import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat as zodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type {
  ModelProvider,
  StructuredCallOptions,
  StructuredCallResult,
} from "./types";

// Opus is the slowest/most expensive tier — a poor fit for a synchronous
// "submit and wait" UI flow. Sonnet is current-gen, much faster, and strong
// enough for structured extraction; override via CLAUDE_MODEL if needed.
const DEFAULT_MODEL = process.env.CLAUDE_MODEL ?? "claude-sonnet-5";
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_MAX_TOKENS = 16000;

export class ClaudeProvider implements ModelProvider {
  readonly name = "claude";
  private client: Anthropic;
  private model: string;

  constructor(options?: { apiKey?: string; model?: string }) {
    const apiKey = options?.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY is not set. The model layer requires an API key to reach Claude."
      );
    }
    this.client = new Anthropic({ apiKey });
    this.model = options?.model ?? DEFAULT_MODEL;
  }

  async generateStructured<T>(
    options: StructuredCallOptions<T>
  ): Promise<StructuredCallResult<T>> {
    const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    const format = zodOutputFormat(options.schema);

    let lastError: unknown;
    let attempt = 0;

    while (attempt <= maxRetries) {
      attempt += 1;
      try {
        const response = await this.client.beta.messages.parse({
          model: this.model,
          max_tokens: DEFAULT_MAX_TOKENS,
          system: options.systemInstruction,
          // `temperature` is deprecated/rejected on newer models (e.g.
          // claude-opus-5) — the API errors instead of ignoring it, so it's
          // left unset here rather than forwarded from the shared,
          // provider-agnostic StructuredCallOptions.
          // Extended thinking is on by default and was consuming most of the
          // latency (~2/3 of output tokens) for what is a fairly direct
          // extraction task — the prompt/schema already constrain the shape,
          // so deliberation isn't buying much. Disabled to keep this call
          // fast enough for a synchronous "submit and wait" UI.
          thinking: { type: "disabled" },
          output_format: format,
          messages: options.messages.map((m) => ({
            // Claude uses "assistant", not Gemini's "model", for the
            // non-user turn — translate at the boundary so the shared
            // ModelMessage type can stay provider-agnostic.
            role: m.role === "model" ? "assistant" : "user",
            content: m.content,
          })),
        });

        if (response.stop_reason === "refusal") {
          throw new ModelOutputError("Claude refused the request");
        }

        if (response.parsed_output === null) {
          throw new ModelOutputError(
            "Structured output failed schema validation or parsing"
          );
        }

        const textBlock = response.content.find(
          (b): b is Extract<typeof b, { type: "text" }> => b.type === "text"
        );
        const rawText = textBlock?.text ?? JSON.stringify(response.parsed_output);

        return { data: response.parsed_output, rawText, attempts: attempt };
      } catch (error) {
        lastError = error;
        if (attempt > maxRetries) break;
      }
    }

    throw new Error(
      `Claude structured call failed after ${attempt} attempt(s): ${
        lastError instanceof Error ? lastError.message : String(lastError)
      }`
    );
  }
}

class ModelOutputError extends Error {}
