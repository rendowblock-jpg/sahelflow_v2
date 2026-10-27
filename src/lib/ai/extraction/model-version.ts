import type { ExtractionResult } from "./types";

/**
 * The model name for an ExtractionMetric row. Only an AI answer (Gemini, Groq or
 * ChatGPT) names a model. Those results carry it in `raw.model`; a result without a usable
 * name keeps `fallback`, the label the routes stored before the name was read.
 */
export function geminiModelVersion(
  result: Pick<ExtractionResult, "method" | "raw">,
  fallback: string,
): string | undefined {
  if (result.method !== "gemini" && result.method !== "groq" && result.method !== "openai") return undefined;
  const model = (result.raw as { model?: unknown } | null | undefined)?.model;
  return typeof model === "string" && model.trim() ? model.trim() : fallback;
}
