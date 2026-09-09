import { ClaudeProvider } from "./claude";
import type { ModelProvider } from "./types";

export type { ModelProvider, ModelMessage, StructuredCallOptions, StructuredCallResult } from "./types";

let provider: ModelProvider | undefined;

// Single point where the active model provider is chosen. Agents call
// getModelProvider() and never import a provider SDK directly — swapping
// providers means changing this function, not agent code (§9.1, §17.3).
export function getModelProvider(): ModelProvider {
  if (!provider) {
    provider = new ClaudeProvider();
  }
  return provider;
}
