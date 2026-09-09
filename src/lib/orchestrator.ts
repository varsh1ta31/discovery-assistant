import { prisma } from "@/lib/db";
import type { CaptureMode } from "@/generated/prisma/enums";
import { runStructuringAgent } from "@/lib/agents/structuring";
import { applyStructuringOutput } from "@/lib/agents/structuring/apply";
import { runExclusive } from "@/lib/engagementQueue";

export interface SubmitNarrativeInput {
  engagementId: string;
  contributorId: string;
  mode: CaptureMode;
  text: string;
}

export interface SubmitNarrativeResult {
  captureSessionId: string;
  entitiesWritten: number;
  flaggedForReview: number;
}

// The Orchestrator (§9.2): routes capture input to the right agent and
// sequences the resulting writes. Holds no domain logic of its own — today
// that means narrative -> Structuring Agent -> EKB write. Gap analysis
// (Discovery Agent) is the next stage to chain in here once built (Phase 3).
export async function submitNarrative(
  input: SubmitNarrativeInput
): Promise<SubmitNarrativeResult> {
  // Live fragments arrive in quick succession during a real conversation.
  // Run them one at a time per engagement so fragment N's entity-resolution
  // read always sees fragment N-1's write — otherwise two fragments
  // describing the same process race and each creates its own duplicate
  // (see: two live fragments producing separate Process rows for what was
  // one narrative in write-up mode).
  if (input.mode === "LIVE") {
    return runExclusive(input.engagementId, () => submitNarrativeUnsafe(input));
  }
  return submitNarrativeUnsafe(input);
}

async function submitNarrativeUnsafe(input: SubmitNarrativeInput): Promise<SubmitNarrativeResult> {
  const existingEntities = await loadExistingEntitySummaries(input.engagementId);
  const knownProcessIdByName = new Map(existingEntities.filter((e) => e.kind === "PROCESS").map((e) => [e.name, e.id]));

  const activeProcessName =
    input.mode === "LIVE" ? await loadActiveProcessName(input.engagementId) : null;

  const structured = await runStructuringAgent({
    mode: input.mode,
    rawText: input.text,
    existingEntities,
    activeProcessName,
  });

  const applied = await applyStructuringOutput(structured, {
    engagementId: input.engagementId,
    contributorId: input.contributorId,
    mode: input.mode,
    sourceType: input.mode === "LIVE" ? "fragment" : "narrative",
    rawText: input.text,
    knownProcessIdByName,
  });

  if (input.mode === "LIVE" && applied.touchedProcess) {
    await setActiveProcessName(input.engagementId, applied.touchedProcess.name);
  }

  return {
    captureSessionId: applied.captureSessionId,
    entitiesWritten: Object.keys(applied.createdEntityIds).length,
    flaggedForReview: applied.flaggedForReview,
  };
}

async function loadExistingEntitySummaries(engagementId: string) {
  const [processes, personas, systems, steps] = await Promise.all([
    prisma.process.findMany({ where: { engagementId }, select: { id: true, name: true } }),
    prisma.persona.findMany({ where: { engagementId }, select: { id: true, role: true } }),
    prisma.systemApplication.findMany({
      where: { engagementId },
      select: { id: true, name: true },
    }),
    // Steps were missing from this list entirely — the model never saw them,
    // so it could never set existingId for a step and every write-up that
    // touched an already-captured step (e.g. answering "what's the exit
    // criteria for X") silently created a duplicate step instead of
    // updating the original, leaving the original gap looking unresolved.
    prisma.processStep.findMany({
      where: { process: { engagementId } },
      select: { id: true, activity: true, processId: true, process: { select: { name: true } } },
    }),
  ]);

  return [
    ...processes.map((p) => ({ kind: "PROCESS", id: p.id, name: p.name })),
    ...personas.map((p) => ({ kind: "PERSONA", id: p.id, name: p.role })),
    ...systems.map((s) => ({ kind: "SYSTEM", id: s.id, name: s.name })),
    // Named with its process for disambiguation — the same activity text
    // can recur across processes, and the model needs the process alongside
    // the activity to tell which existing step (if any) a mention matches.
    ...steps.map((s) => ({
      kind: "PROCESS_STEP",
      id: s.id,
      name: `${s.activity} (process: ${s.process.name})`,
    })),
  ];
}

// The "active process" pointer is per-engagement live-session state, not
// evidence-bearing EKB content — it lives in Engagement.attributes (the
// gap-tolerant JSON column, §17.2) rather than a new column/table.
async function loadActiveProcessName(engagementId: string): Promise<string | null> {
  const engagement = await prisma.engagement.findUnique({
    where: { id: engagementId },
    select: { attributes: true },
  });
  const attrs = engagement?.attributes as { liveActiveProcessName?: string } | undefined;
  return attrs?.liveActiveProcessName ?? null;
}

async function setActiveProcessName(engagementId: string, processName: string): Promise<void> {
  const engagement = await prisma.engagement.findUnique({
    where: { id: engagementId },
    select: { attributes: true },
  });
  const attrs = (engagement?.attributes as Record<string, unknown> | undefined) ?? {};
  await prisma.engagement.update({
    where: { id: engagementId },
    data: { attributes: { ...attrs, liveActiveProcessName: processName } },
  });
}
