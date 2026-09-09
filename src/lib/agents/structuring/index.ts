import { getModelProvider } from "@/lib/model";
import type { CaptureMode } from "@/generated/prisma/enums";
import {
  structuringAgentOutputSchema,
  type StructuringAgentOutput,
} from "./schema";
import {
  buildSystemInstruction,
  buildExistingEntitiesBlock,
  type ExistingEntitySummary,
} from "./prompt";

export type { StructuringAgentOutput, ExtractedEntity } from "./schema";
export type { ExistingEntitySummary } from "./prompt";

export interface StructuringAgentInput {
  mode: CaptureMode;
  /** Raw narrative dump, live fragment, or ingested document text. */
  rawText: string;
  /** Existing EKB entities in this engagement, for entity resolution. */
  existingEntities: ExistingEntitySummary[];
  /**
   * Name of the process this live session is currently focused on, if any.
   * Lets a later fragment continue the process an earlier fragment in the
   * same session established, without relying on the model re-deriving
   * that continuity from entity names alone (§9.2, live-mode capture).
   */
  activeProcessName?: string | null;
}

// The Structuring Agent (§9.2): raw narrative -> proposed EKB entities and
// relationships, with evidence states and entity resolution against what's
// already captured. Returns a proposal for the Orchestrator/UI to apply —
// it does not write to the EKB itself, keeping structuring and persistence
// separately testable.
export async function runStructuringAgent(
  input: StructuringAgentInput
): Promise<StructuringAgentOutput> {
  const model = getModelProvider();

  const systemInstruction = buildSystemInstruction(input.mode, input.activeProcessName);
  const existingBlock = buildExistingEntitiesBlock(input.existingEntities);

  const result = await model.generateStructured({
    systemInstruction,
    schema: structuringAgentOutputSchema,
    temperature: 0.1,
    messages: [
      {
        role: "user",
        content: `${existingBlock}\n\n---\n\nNarrative to structure:\n\n${input.rawText}`,
      },
    ],
  });

  return result.data;
}
