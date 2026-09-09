import { NextRequest, NextResponse } from "next/server";
import { hasUnconfirmedApiGap } from "@/lib/systemAccess";
import { prisma } from "@/lib/db";
import { fallbackLabel, generateStepLabels } from "@/lib/agents/currentState/labels";

// GET /api/engagements/:engagementId/knowledge
// Snapshot of the EKB for the knowledge surface: entity counts plus the
// most recently touched steps/pain points/exceptions with their gap status.
// This is a coarse placeholder for the real coverage view (§17.5, Phase 3) —
// it reads entity presence, not yet the confidence-engine coverage targets.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ engagementId: string }> }
) {
  const { engagementId } = await params;

  const [processes, personas, systems, painPoints, exceptions] = await Promise.all([
    prisma.process.findMany({
      where: { engagementId },
      include: {
        steps: {
          orderBy: { order: "asc" },
          include: {
            personas: { include: { persona: { select: { id: true, role: true } } } },
            systemLinks: {
              include: { system: { select: { id: true, name: true } } },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.persona.findMany({ where: { engagementId }, orderBy: { createdAt: "desc" } }),
    prisma.systemApplication.findMany({ where: { engagementId }, orderBy: { createdAt: "desc" } }),
    // Pain points/exceptions relate to a step OR the process directly (both
    // FKs nullable — §8.2), so "in this engagement" has to reach through
    // either path rather than just step.process.
    prisma.painPoint.findMany({
      where: {
        OR: [
          { step: { process: { engagementId } } },
          { process: { engagementId } },
        ],
      },
      include: {
        step: { select: { id: true, activity: true } },
        process: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.exception.findMany({
      where: {
        OR: [
          { step: { process: { engagementId } } },
          { process: { engagementId } },
        ],
      },
      include: {
        step: { select: { id: true, activity: true } },
        process: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  const stepCount = processes.reduce((sum, p) => sum + p.steps.length, 0);
  const stepsMissingExitCriteria = processes.reduce(
    (sum, p) => sum + p.steps.filter((s) => !s.exitCriteria).length,
    0
  );

  // apiAvailability=UNKNOWN is ambiguous by itself: it's both the column
  // default for "never asked" and a legitimate answer once someone
  // confirms nobody knows. A provenance row on the apiAvailability
  // attribute is only ever written when the Structuring Agent saw the
  // question actually addressed (apply.ts skips it for NOT_MENTIONED), so
  // its presence is what tells a confirmed unknown apart from an unasked
  // one — an open question only counts the latter.
  const apiAvailabilityProvenance = await prisma.provenance.findMany({
    where: {
      entityKind: "SYSTEM",
      attribute: "apiAvailability",
      supersededById: null,
      entityId: { in: systems.map((s) => s.id) },
    },
    select: { entityId: true },
  });
  const confirmedSystemIds = new Set(apiAvailabilityProvenance.map((row) => row.entityId));
  const systemsUnknownApi = systems.filter(
    (s) => hasUnconfirmedApiGap({ ...s, apiAvailabilityConfirmed: confirmedSystemIds.has(s.id) })
  ).length;

  // Whole-entity evidence state (stated/inferred/estimated/gap) for processes
  // and steps, so the knowledge surface can show real provenance instead of
  // a fabricated tag. Non-superseded records only, most recent wins.
  const stepIds = processes.flatMap((p) => p.steps.map((s) => s.id));
  const provenanceRows = await prisma.provenance.findMany({
    where: {
      attribute: null,
      supersededById: null,
      entityKind: { in: ["PROCESS", "PROCESS_STEP"] },
      entityId: { in: [...processes.map((p) => p.id), ...stepIds] },
    },
    orderBy: { createdAt: "desc" },
  });
  const evidenceByEntityId = new Map<string, string>();
  for (const row of provenanceRows) {
    if (!evidenceByEntityId.has(row.entityId)) {
      evidenceByEntityId.set(row.entityId, row.evidenceState);
    }
  }

  // Chips referencing a step (systems' "used in", personas' step list, a
  // pain point/exception's "where") used to carry the full captured
  // activity sentence, hard-truncated to fit — which just cuts a sentence
  // off mid-word ("Relationship manager or closi…"), not a real label.
  // Short labels are generated once here and reused across every one of
  // those chips, the same approach the swim-lane artifact uses.
  const allSteps = processes.flatMap((p) => p.steps);
  const shortLabelByStepId = await generateStepLabels(
    allSteps.map((s) => ({ stepId: s.id, activity: s.activity }))
  );
  function stepLabel(stepId: string, activity: string): string {
    return shortLabelByStepId.get(stepId) ?? fallbackLabel(activity);
  }

  // Reverse indexes — which steps touch each persona/system — built off the
  // same step rows rather than a second round trip, so the flat persona and
  // system tables can show "used in" without the step table needing to
  // repeat the full relation on every row.
  const stepsByPersonaId = new Map<string, Array<{ id: string; label: string }>>();
  const stepsBySystemId = new Map<
    string,
    Array<{ id: string; label: string; direction: string }>
  >();
  for (const p of processes) {
    for (const s of p.steps) {
      const label = stepLabel(s.id, s.activity);
      for (const link of s.personas) {
        const list = stepsByPersonaId.get(link.persona.id) ?? [];
        list.push({ id: s.id, label });
        stepsByPersonaId.set(link.persona.id, list);
      }
      for (const link of s.systemLinks) {
        const list = stepsBySystemId.get(link.system.id) ?? [];
        list.push({ id: s.id, label, direction: link.direction });
        stepsBySystemId.set(link.system.id, list);
      }
    }
  }

  return NextResponse.json({
    counts: {
      processes: processes.length,
      steps: stepCount,
      personas: personas.length,
      systems: systems.length,
      painPoints: painPoints.length,
      exceptions: exceptions.length,
    },
    gaps: {
      stepsMissingExitCriteria,
      systemsUnknownApi,
    },
    processes: processes.map((p) => ({
      ...p,
      evidenceState: evidenceByEntityId.get(p.id) ?? null,
      steps: p.steps.map((s) => ({
        ...s,
        evidenceState: evidenceByEntityId.get(s.id) ?? null,
        personas: s.personas.map((link) => link.persona),
        systems: s.systemLinks.map((link) => ({ ...link.system, direction: link.direction })),
      })),
    })),
    personas: personas.map((p) => ({ ...p, steps: stepsByPersonaId.get(p.id) ?? [] })),
    systems: systems.map((s) => ({
      ...s,
      steps: stepsBySystemId.get(s.id) ?? [],
      // True once an SME has actually been asked and the honest answer is
      // "we don't know" — distinct from apiAvailability just sitting at its
      // UNKNOWN column default because nobody's addressed it yet.
      apiAvailabilityConfirmed: confirmedSystemIds.has(s.id),
    })),
    painPoints: painPoints.map((pp) => ({
      ...pp,
      location: pp.step
        ? { kind: "step" as const, id: pp.step.id, label: stepLabel(pp.step.id, pp.step.activity) }
        : pp.process
          ? { kind: "process" as const, id: pp.process.id, label: pp.process.name }
          : null,
    })),
    exceptions: exceptions.map((ex) => ({
      ...ex,
      location: ex.step
        ? { kind: "step" as const, id: ex.step.id, label: stepLabel(ex.step.id, ex.step.activity) }
        : ex.process
          ? { kind: "process" as const, id: ex.process.id, label: ex.process.name }
          : null,
    })),
  });
}
