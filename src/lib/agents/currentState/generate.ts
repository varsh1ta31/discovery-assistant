import { hasUnconfirmedApiGap } from "../../systemAccess";
import {
  UNASSIGNED_LANE_ID,
  type CurrentStateArtifact,
  type CurrentStateProcessInput,
  type CurrentStateStep,
  type PhaseBand,
  type SwimLane,
  type SwimLaneNode,
} from "./types";
import { generateProcessFlow, type ProcessFlow } from "./flow";

// The Current-State Agent (§13): reads a structured process from the EKB
// and renders it as a swim-lane flow for executive presentation — no
// invented content, and a gap (undefined exit criteria, unconfirmed
// unknown API status) is a visible marker, never smoothed over (§13.2).
// Regenerated on demand from current EKB state, not persisted as its own
// document (§13.3) — this module has no DB writes. (An earlier version
// also produced a prose narrative; dropped — the deliverable this feeds is
// structured slide artifacts, not a document to read top to bottom.)
export async function generateCurrentState(
  process: CurrentStateProcessInput
): Promise<CurrentStateArtifact> {
  const steps = [...process.steps].sort((a, b) => a.order - b.order);

  const flow = await generateProcessFlow({ ...process, steps });
  return buildCurrentState(process, flow);
}

export function buildCurrentState(process: CurrentStateProcessInput, flow: ProcessFlow): CurrentStateArtifact {
  const steps = [...process.steps].sort((a, b) => a.order - b.order);
  const swimLane = buildSwimLane(steps, flow);
  const gapCount = swimLane.nodes.filter((n) => n.isGap).length;
  const escalationCount = swimLane.nodes.filter((n) => n.isEscalationPoint).length;

  const laneOwnerIds = new Set(swimLane.lanes.map((l) => l.laneId).filter((id) => id !== UNASSIGNED_LANE_ID));
  // Keyed by id (not role) so the same persona named on several steps only
  // contributes one entry, even though we ultimately display their role —
  // two distinct personas could share a role label, so de-duping by id
  // first and mapping to role second avoids conflating them.
  const alsoInvolved = new Map<string, string>();
  for (const step of steps) {
    for (const persona of step.personas) {
      if (!laneOwnerIds.has(persona.id)) alsoInvolved.set(persona.id, persona.role);
    }
  }
  const alsoInvolvedRoles = [...new Set(alsoInvolved.values())].sort((a, b) => a.localeCompare(b));
  const systemIds = new Set(steps.flatMap((s) => s.systemLinks.map((l) => l.system.id)));

  return {
    processId: process.id,
    processName: process.name,
    generatedAt: new Date().toISOString(),
    swimLane,
    gapCount,
    personaCount: laneOwnerIds.size,
    alsoInvolvedRoles,
    systemCount: systemIds.size,
    escalationCount,
  };
}

function gapsForStep(step: CurrentStateStep): string[] {
  const reasons: string[] = [...(step.unresolvedGaps ?? [])];
  if (!step.exitCriteria) reasons.push("exit criteria not yet captured");
  // A *confirmed* unknown (someone was asked and the honest answer is
  // "nobody knows") is a settled fact, not an open question — only an
  // unconfirmed one still needs chasing (§13.2 gap-honesty applies to that
  // one, not to a real "we don't know" answer).
  const unknownApiSystems = step.systemLinks
    .filter((link) => hasUnconfirmedApiGap(link.system))
    .map((link) => link.system.name);
  for (const name of new Set(unknownApiSystems)) {
    reasons.push(`${name}: API access unknown`);
  }
  if (step.personas.length === 0) reasons.push("no persona identified for this step");
  return [...new Set(reasons)];
}

function buildSwimLane(steps: CurrentStateStep[], flow: ProcessFlow) {
  const planById = new Map(flow.steps.map(node => [node.stepId, node]));
  const lanes = new Map<string, SwimLane>();
  const nodes: SwimLaneNode[] = steps.map((step, column) => {
    const plan = planById.get(step.id)!;
    const owner = step.personas.find(p => p.id === (step.primaryPersonaId || plan.primaryPersonaId));
    const laneId = owner?.id ?? UNASSIGNED_LANE_ID;
    lanes.set(laneId, { laneId, label: owner?.role ?? "Owner to confirm" });
    const gapReasons = gapsForStep(step);
    if (!owner) gapReasons.push("primary performer needs confirmation");
    return {
      stepId: step.id, order: step.order, activity: step.activity,
      shortLabel: plan.label, phase: plan.phase, laneId, column,
      alsoInvolved: [...new Set(step.personas.filter(p => p.id !== owner?.id).map(p => p.role))].sort(),
      context: plan.context, ownerEvidence: plan.ownerEvidence, mode: plan.mode,
      isEscalationPoint: step.isEscalationPoint, isGap: gapReasons.length > 0, gapReasons,
      systemsTouched: step.systemLinks.map(link => ({ ...link.system, direction: link.direction })),
    };
  });
  return { lanes: [...lanes.values()].sort((a,b) => a.laneId === UNASSIGNED_LANE_ID ? 1 : b.laneId === UNASSIGNED_LANE_ID ? -1 : 0), nodes, phases: buildPhaseBands(nodes), edges: flow.edges };
}

// Adjacent cards sharing a phase use one continuous background band.
function buildPhaseBands(nodes: SwimLaneNode[]): PhaseBand[] {
  const bands: PhaseBand[] = [];
  for (const node of nodes) {
    const name = node.phase || "Ungrouped";
    const current = bands[bands.length - 1];
    if (current && current.name === name) {
      current.endColumn = Math.max(current.endColumn, node.column);
    } else {
      bands.push({ name, startColumn: node.column, endColumn: node.column });
    }
  }
  return bands;
}

