/**
 * Seller-facing Gemini catalog. Safe for client Settings UI.
 * Request execution stays in `provider.ts`.
 */

export const GEMINI_MODELS = [
  "gemini-3.5-flash",
  "gemini-3.6-flash",
] as const;
export type GeminiModel = (typeof GEMINI_MODELS)[number];

export const GEMINI_THINKING_LEVELS = [
  "MINIMAL",
  "LOW",
  "MEDIUM",
  "HIGH",
] as const;
export type GeminiThinkingLevel = (typeof GEMINI_THINKING_LEVELS)[number];

export const DEFAULT_GEMINI_MODEL: GeminiModel = "gemini-3.5-flash";
export const DEFAULT_GEMINI_THINKING_LEVEL: GeminiThinkingLevel = "MINIMAL";

export function isGeminiModel(value: string): value is GeminiModel {
  return (GEMINI_MODELS as readonly string[]).includes(value);
}

export function isGeminiThinkingLevel(
  value: string,
): value is GeminiThinkingLevel {
  return (GEMINI_THINKING_LEVELS as readonly string[]).includes(value);
}

export function parseGeminiModel(
  value: string | null | undefined,
): GeminiModel {
  const trimmed = value?.trim();
  return trimmed && isGeminiModel(trimmed) ? trimmed : DEFAULT_GEMINI_MODEL;
}

export function parseGeminiThinkingLevel(
  value: string | null | undefined,
): GeminiThinkingLevel {
  const normalized = value?.trim().toUpperCase();
  return normalized && isGeminiThinkingLevel(normalized)
    ? normalized
    : DEFAULT_GEMINI_THINKING_LEVEL;
}

export function geminiModelFallbackOrder(
  preferred?: GeminiModel | null,
): GeminiModel[] {
  const first = parseGeminiModel(preferred ?? null);
  return [first, ...GEMINI_MODELS.filter((model) => model !== first)];
}
