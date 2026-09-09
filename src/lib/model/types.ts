import type { z } from "zod";

// The model layer's public contract (§17.3). Agents depend only on this —
// never on a provider SDK directly — so the underlying model is a swappable
// dependency rather than a hard commitment (§9.1).

export interface ModelMessage {
  role: "user" | "model";
  content: string;
}

export interface StructuredCallOptions<T> {
  /** System-level instructions defining the agent's behavior. */
  systemInstruction: string;
  /** Conversation so far, oldest first. */
  messages: ModelMessage[];
  /** Schema the response must satisfy. Also drives runtime validation. */
  schema: z.ZodType<T>;
  /** Lower = more deterministic. Extraction-style agent calls default low. */
  temperature?: number;
  /** Upper bound on retries when the model returns invalid structured output. */
  maxRetries?: number;
}

export interface StructuredCallResult<T> {
  data: T;
  /** Raw text the model produced, kept for audit/debugging. */
  rawText: string;
  /** Number of attempts taken (1 = succeeded first try). */
  attempts: number;
}

export interface ModelProvider {
  readonly name: string;
  generateStructured<T>(
    options: StructuredCallOptions<T>
  ): Promise<StructuredCallResult<T>>;
}
