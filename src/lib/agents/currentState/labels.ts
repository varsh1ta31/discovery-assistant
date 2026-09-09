import * as z from "zod";
import { getModelProvider } from "@/lib/model";
import type { CurrentStateProcessInput } from "./types";

// Short labels for the swim-lane (§13.1): captured `activity` text is often
// a full sentence ("Relationship manager or closing team sends covenant
// details... to Lending Ops via email"), which doesn't fit a slide card
// even wrapped. This derives a short verb-phrase label per step, generated
// fresh each time rather than stored — consistent with §13.3 (artifacts
// regenerate from the EKB, they aren't separately maintained documents) and
// with how this activity's full text can itself still change between
// regenerations.
const labelsOutputSchema = z.object({
  labels: z.array(
    z.object({
      stepId: z.string(),
      label: z.string(),
    })
  ),
});

const SYSTEM_INSTRUCTION = `You write short labels for steps on a swim-lane process diagram going into an
executive presentation. Each step has a full captured description; your job is to compress it into a
label that fits a small card.

Rules:
- 3-6 words, imperative or active voice ("Send covenant details to Ops", "Calculate financial ratio"),
  not a restatement of the full sentence.
- Preserve the concrete subject and any condition or uncertainty that changes meaning.
  Never turn an optional check into a mandatory one, or an outcome check into guaranteed success.
- Do not invent detail the source text doesn't contain.
- Return exactly one label per step, matched by the given stepId.`;

export interface StepLabelInput {
  stepId: string;
  activity: string;
}

export async function generateStepLabels(
  steps: StepLabelInput[]
): Promise<Map<string, string>> {
  if (steps.length === 0) return new Map();

  const model = getModelProvider();
  const result = await model.generateStructured({
    systemInstruction: SYSTEM_INSTRUCTION,
    schema: labelsOutputSchema,
    temperature: 0.1,
    messages: [
      {
        role: "user",
        content: `Steps:\n\n${JSON.stringify(steps, null, 2)}`,
      },
    ],
  });

  const byStepId = new Map<string, string>();
  for (const { stepId, label } of result.data.labels) {
    byStepId.set(stepId, label);
  }
  return byStepId;
}

// Fallback used only if the model returns a mismatched set (missing a
// stepId, say) — a hard truncation is a worse label than the model's own,
// but a broken diagram (a step with no label at all) is worse than a
// truncated one.
export function fallbackLabel(activity: string, maxLength = 40): string {
  const trimmed = activity.trim();
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength - 1)}…` : trimmed;
}

// Phase bands group steps into named stages of the process ("Set Up &
// Monitor", "Assess", ...) for the swim-lane diagram's header row. Always
// derived by this model call, for every step, rather than read directly
// off ProcessStep.stage — the diagram needs a small, presentation-sized
// set of bands (narrow enough phases just read as visual noise, see the
// system instruction's band-count rule below), while `stage` is captured
// during discovery at whatever granularity the interview actually
// surfaced and isn't tuned for how many bands fit a slide. Passing each
// step's captured stage as a hint keeps this grounded in what was actually
// captured (§13.2 — no invented content) rather than the model
// re-deriving phases from scratch; it's free to keep, split, or merge
// those hints into a coarser set for the diagram, but every phase name it
// returns still has to trace back to real captured stages, not be invented
// whole-cloth.
const phasesOutputSchema = z.object({
  stepPhases: z.array(
    z.object({
      stepId: z.string(),
      phase: z.string(),
    })
  ),
});

const PHASE_SYSTEM_INSTRUCTION = `You group the steps of a business process into a handful of named
phases for a swim-lane diagram — the same kind of grouping a process consultant would draw as labeled
bands across the top of the diagram.

Each step may include a "capturedStage" — the stage name an analyst captured for that step during
discovery. Use these as your primary signal for where phase boundaries fall and what to call each phase,
but you are grouping for a slide, not transcribing the interview: several adjacent captured stages that
are all part of the same broad activity (e.g. "Track Due Items" immediately followed by "Collect
Documents") should usually collapse into one diagram phase rather than each getting its own band. Do not
invent a phase or a boundary that has no basis in the captured stages / step content — only regroup and
rename for concision, never fabricate a stage no step suggests.

Rules:
- Produce 3-5 phases spanning the whole process in order — not one phase per step or per captured stage,
  and not so few that the grouping says nothing. A phase that would only cover one, or a small fraction,
  of the process's steps should almost always be merged into a neighboring phase instead of standing
  alone — narrow phases are worse than fewer, broader ones on a slide.
- Name each phase 2-4 words, e.g. "Set Up & Monitor", "Collect Documents", "Assess Compliance",
  "Escalate & Report". When merging captured stages, a combined name should still describe what actually
  happens in that span (e.g. "Track & Collect Documents"), not a generic placeholder.
- Every step belongs to exactly one phase. Assign the same exact phase name (character-for-character) to
  every step in that phase.
- Base the grouping on what the steps actually do, in their given order — do not reorder steps.
- Return one entry per given step, matched by the given stepId.`;

export interface StepPhaseInput {
  stepId: string;
  order: number;
  activity: string;
  capturedStage: string | null;
}

export async function generateStepPhases(steps: StepPhaseInput[]): Promise<Map<string, string>> {
  if (steps.length === 0) return new Map();

  const model = getModelProvider();
  const result = await model.generateStructured({
    systemInstruction: PHASE_SYSTEM_INSTRUCTION,
    schema: phasesOutputSchema,
    temperature: 0.1,
    messages: [
      {
        role: "user",
        content: `Steps, in order:\n\n${JSON.stringify(steps, null, 2)}`,
      },
    ],
  });

  const phaseByStepId = new Map<string, string>();
  for (const { stepId, phase } of result.data.stepPhases) {
    phaseByStepId.set(stepId, phase);
  }
  return phaseByStepId;
}

export type { CurrentStateProcessInput };
