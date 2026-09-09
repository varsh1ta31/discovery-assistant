// Input/output shapes for the Current-State generator (§13). Deliberately
// decoupled from Prisma's generated types — the generator is a pure
// function over a plain shape, so it can be unit-tested and reused without
// a DB round trip.

export interface CurrentStatePersona {
  id: string;
  role: string;
}

export interface CurrentStateSystem {
  id: string;
  name: string;
  apiAvailability: string;
  // True once an SME has actually confirmed nobody knows — distinct from
  // apiAvailability sitting at its UNKNOWN default because it's simply
  // never come up. Only an unconfirmed unknown counts as an open gap.
  apiAvailabilityConfirmed: boolean;
}

export interface CurrentStateStepSystemLink {
  system: CurrentStateSystem;
  direction: "READ" | "WRITE";
}

export interface CurrentStatePainPoint {
  id: string;
  description: string;
}

export interface CurrentStateException {
  id: string;
  scenario: string;
}

export interface CurrentStateStep {
  id: string;
  order: number;
  activity: string;
  stage: string | null; // captured phase grouping — null falls back to a derived one, see labels.ts
  entryTrigger: string | null;
  exitCriteria: string | null;
  isEscalationPoint: boolean;
  personas: CurrentStatePersona[];
  primaryPersonaId?: string;
  unresolvedGaps?: string[];
  systemLinks: CurrentStateStepSystemLink[];
  painPoints: CurrentStatePainPoint[];
  exceptions: CurrentStateException[];
}

export interface CurrentStateProcessInput {
  id: string;
  name: string;
  purpose: string | null;
  trigger: string | null;
  outcome: string | null;
  steps: CurrentStateStep[];
}

// --- Output -----------------------------------------------------------

export interface SwimLaneNode {
  stepId: string;
  order: number;
  activity: string; // full captured text — used for the hover/title, not the card label
  shortLabel: string; // slide-card label (model-generated, see labels.ts)
  phase: string; // this step's phase-band name — captured stage, or the derived fallback
  laneId: string; // primary persona id, or UNASSIGNED_LANE_ID
  column: number;
  alsoInvolved: string[];
  context: string;
  ownerEvidence: string;
  mode: "MAIN" | "CONDITIONAL" | "ONGOING";
  isEscalationPoint: boolean;
  isGap: boolean; // true when this step has an unresolved gap (§13.2)
  gapReasons: string[];
  systemsTouched: Array<{
    name: string;
    direction: "READ" | "WRITE";
    apiAvailability: string;
    apiAvailabilityConfirmed: boolean;
  }>;
}

export interface SwimLane {
  laneId: string;
  label: string; // persona role, or "Unassigned"
}

/** A contiguous phase span in the presentation grid. */
export interface PhaseBand {
  name: string;
  startColumn: number; // 0-based index of the first step's column in this phase
  endColumn: number; // 0-based index of the last step's column in this phase
}

export interface SwimLaneModel {
  lanes: SwimLane[];
  nodes: SwimLaneNode[]; // ordered left-to-right by step order
  phases: PhaseBand[]; // ordered left-to-right, spanning all nodes
  edges: SwimLaneEdge[];
}

export interface CurrentStateArtifact {
  processId: string;
  processName: string;
  generatedAt: string; // ISO timestamp — this is a render, not a stored doc (§13.3)
  swimLane: SwimLaneModel;
  gapCount: number;
  personaCount: number; // count of personas with a lane (primary on some step) — see alsoInvolvedRoles for the rest
  alsoInvolvedRoles: string[]; // roles of personas with no lane of their own, named only as secondary participants somewhere — de-duped, sorted; rendered as the "ALSO INVOLVED" band under the diagram
  systemCount: number;
  escalationCount: number;
}

export const UNASSIGNED_LANE_ID = "__unassigned__";

export interface SwimLaneEdge {
  from: string;
  to: string;
  condition: string;
  kind: "SEQUENCE" | "CONDITIONAL" | "RETURN" | "ASSOCIATION";
  evidence: string;
}
