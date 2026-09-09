import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { unresolvedStepGaps } from "@/lib/agents/currentState/gaps";
import { generateCurrentState } from "@/lib/agents/currentState/generate";
import type { CurrentStateProcessInput } from "@/lib/agents/currentState/types";

// GET /api/engagements/:engagementId/processes/:processId/current-state
// Renders the Current-State swim-lane artifact (§13) for one process: reads
// the process, its steps, and each step's personas/systems from the EKB,
// then hands that to the generator (deterministic lane/gap layout, plus a
// model call for slide-card short labels — see generate.ts). Nothing here
// is persisted — this is a render on demand, not a stored document (§13.3),
// so every call reflects whatever the EKB holds right now.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ engagementId: string; processId: string }> }
) {
  const { engagementId, processId } = await params;

  const process = await prisma.process.findFirst({
    where: { id: processId, engagementId },
    include: {
      steps: {
        orderBy: { order: "asc" },
        include: {
          personas: { include: { persona: { select: { id: true, role: true } } } },
          systemLinks: {
            include: {
              system: { select: { id: true, name: true, apiAvailability: true } },
            },
          },
          painPoints: { select: { id: true, description: true } },
          exceptions: { select: { id: true, scenario: true } },
        },
      },
    },
  });

  if (!process) {
    return NextResponse.json({ error: "Process not found" }, { status: 404 });
  }

  // apiAvailability=UNKNOWN is ambiguous on its own — it's both the column
  // default for "never asked" and a legitimate answer once an SME confirms
  // nobody knows. Only the latter should stop showing as an open gap in the
  // artifact (§13.2 gap-honesty still applies to the former). A provenance
  // row on the apiAvailability attribute is only ever written when it was
  // actually addressed (see apply.ts), so its presence is the signal.
  const systemIds = [
    ...new Set(process.steps.flatMap((s) => s.systemLinks.map((l) => l.system.id))),
  ];
  const apiAvailabilityProvenance = await prisma.provenance.findMany({
    where: {
      entityKind: "SYSTEM",
      attribute: "apiAvailability",
      supersededById: null,
      entityId: { in: systemIds },
    },
    select: { entityId: true },
  });
  const confirmedSystemIds = new Set(apiAvailabilityProvenance.map((row) => row.entityId));

  const stepProvenance = await prisma.provenance.findMany({
    where: { entityKind: "PROCESS_STEP", entityId: { in: process.steps.map(s => s.id) }, supersededById: null },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { entityId: true, attribute: true, evidenceState: true, note: true, flaggedForReview: true },
  });

  const input: CurrentStateProcessInput = {
    id: process.id,
    name: process.name,
    purpose: process.purpose,
    trigger: process.trigger,
    outcome: process.outcome,
    steps: process.steps.map((s) => ({
      id: s.id,
      order: s.order,
      activity: s.activity,
      stage: s.stage,
      entryTrigger: s.entryTrigger,
      exitCriteria: s.exitCriteria,
      isEscalationPoint: s.isEscalationPoint,
      personas: s.personas.map((link) => link.persona),
      primaryPersonaId: s.attributes && typeof s.attributes === "object" && "primaryPersonaId" in s.attributes
        && typeof s.attributes.primaryPersonaId === "string" ? s.attributes.primaryPersonaId : undefined,
      unresolvedGaps: unresolvedStepGaps(stepProvenance.filter(row => row.entityId === s.id), s.attributes),
      systemLinks: s.systemLinks.map((link) => ({
        system: {
          ...link.system,
          apiAvailabilityConfirmed: confirmedSystemIds.has(link.system.id),
        },
        direction: link.direction,
      })),
      painPoints: s.painPoints,
      exceptions: s.exceptions,
    })),
  };

  try {
    const artifact = await generateCurrentState(input);
    return NextResponse.json({ artifact });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Current-state generation failed" },
      { status: 502 }
    );
  }
}
