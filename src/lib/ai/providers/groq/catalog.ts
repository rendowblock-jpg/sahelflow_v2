/**
 * Seller-facing Groq catalog. Safe for client Settings UI.
 * Request execution stays in `provider.ts`.
 */

export const GROQ_MODELS = [
  "qwen/qwen3.8-27b",
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
] as const;
export type GroqModel = (typeof GROQ_MODELS)[number];

/** Measured free default: 131072 context, 16384 max output. */
export const DEFAULT_GROQ_MODEL: GroqModel = "qwen/qwen3.8-27b";

/** Name of the seller's Groq key in the secrets store. */
export const GROQ_API_KEY_SECRET = "groq_api_key";

/**
 * Per-model request tuning for extraction. Only the qwen row was measured on
 * the real prompt; the gpt-oss rows follow Groq's documented effort levels
 * (they have no "none") with room for reasoning tokens, and are unmeasured.
 */
export const GROQ_EXTRACTION_TUNING: Record<
  GroqModel,
  { reasoningEffort: "none" | "low"; maxCompletionTokens: number }
> = {
  "qwen/qwen3.8-27b": { reasoningEffort: "none", maxCompletionTokens: 800 },
  "openai/gpt-oss-120b": { reasoningEffort: "low", maxCompletionTokens: 2000 },
  "openai/gpt-oss-20b": { reasoningEffort: "low", maxCompletionTokens: 2000 },
};

export function isGroqModel(value: string): value is GroqModel {
  return (GROQ_MODELS as readonly string[]).includes(value);
}

export function parseGroqModel(value: string | null | undefined): GroqModel {
  const trimmed = value?.trim();
  return trimmed && isGroqModel(trimmed) ? trimmed : DEFAULT_GROQ_MODEL;
}
