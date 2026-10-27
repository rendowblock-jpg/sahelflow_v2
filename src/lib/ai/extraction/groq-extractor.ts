import { GroqProviderError, requestGroq } from "@/lib/ai/providers/groq/provider";
import { GROQ_EXTRACTION_TUNING, parseGroqModel } from "@/lib/ai/providers/groq/catalog";
import { EXTRACTION_SYSTEM_PROMPT, EXTRACTION_USER_PROMPT } from "../prompts/extraction";
import { ExtractedOrderSchema, canonicalizeOrder } from "./model-order";
import type { ExtractionInput, ExtractionResult } from "./types";

const fail = (code: string, retryAfterSeconds?: number | null): ExtractionResult => ({
  order: null, method: "none", confidence: 0, isComplete: false, missingFields: [code],
  // A quota answer that named a delay carries it so the router can pause Groq.
  ...(typeof retryAfterSeconds === "number" ? { raw: { retryAfterSeconds } } : {}),
});

/**
 * Groq's JSON mode has no schema, so the model writes null for "not stated" ("unitPrice": null, "commune": null);
 * Gemini's schema mode never does. A null field means absent. Only nulls are dropped: a required field that
 * was null is then missing, and the schema still refuses the answer.
 */
function dropNulls(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(value as Record<string, unknown>)) {
    if (field === null) continue;
    out[key] = key === "items" && Array.isArray(field) ? field.map((item) => dropNulls(item)) : field;
  }
  return out;
}

/**
 * The shape of a Groq answer, made readable: nulls are dropped (see dropNulls), and an answer object with no "items"
 * means "the AI found no items" (for a message that is not an order Groq writes {}; Gemini's schema mode always sends
 * "items": []). Anything that is not an object is left alone, so the schema still refuses it.
 */
function readableAnswer(value: unknown): unknown {
  const cleaned = dropNulls(value);
  if (cleaned && typeof cleaned === "object" && !Array.isArray(cleaned) && !("items" in cleaned)) {
    return { ...(cleaned as Record<string, unknown>), items: [] };
  }
  return cleaned;
}

export interface GroqExtractorOptions { apiKey: string; model?: string; timeoutMs?: number }

/**
 * Reads an order with Groq (OpenAI-compatible chat, JSON mode). Same result
 * contract as extractWithGemini: a failure returns no order and the error
 * code as `missingFields[0]`.
 */
export async function extractWithGroq(
  input: ExtractionInput,
  options: GroqExtractorOptions,
): Promise<ExtractionResult> {
  if (!options.apiKey) return fail("GROQ_KEY_MISSING");
  const model = parseGroqModel(options.model);
  const tuning = GROQ_EXTRACTION_TUNING[model];
  try {
    const { data, model: usedModel } = await requestGroq(options.apiKey, {
      model,
      timeoutMs: options.timeoutMs ?? 15_000,
      body: {
        messages: [
          { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
          { role: "user", content: EXTRACTION_USER_PROMPT(input.body, input.catalog?.map((entry) => entry.name)) },
        ],
        response_format: { type: "json_object" },
        reasoning_effort: tuning.reasoningEffort,
        temperature: 0,
        max_completion_tokens: tuning.maxCompletionTokens,
      },
    });
    const content = data.choices?.[0]?.message?.content;
    const text = typeof content === "string" ? content.trim() : "";
    if (!text) return fail("GROQ_EMPTY_RESPONSE");
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { return fail("GROQ_INVALID_EXTRACTION"); }
    const validated = ExtractedOrderSchema.safeParse(readableAnswer(parsed));
    if (!validated.success) return fail("GROQ_INVALID_EXTRACTION");
    const order = canonicalizeOrder(validated.data, input);
    const missingFields: string[] = [];
    if (order.items.length === 0) missingFields.push("items");
    if (!order.wilaya) missingFields.push("wilaya");
    if (!order.phone) missingFields.push("phone");
    return {
      order, method: "groq", confidence: 0.9,
      isComplete: missingFields.length === 0,
      missingFields: missingFields.length ? missingFields : undefined,
      raw: { model: usedModel, usage: data.usage },
    };
  } catch (error) {
    return error instanceof GroqProviderError
      ? fail(error.code, error.retryAfterSeconds)
      : fail("GROQ_PROVIDER_UNAVAILABLE");
  }
}
