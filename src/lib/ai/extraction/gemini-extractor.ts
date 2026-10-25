import { GeminiProviderError, requestGemini } from "@/lib/ai/gemini/provider";
import { loadGeminiRuntimePreferences } from "@/lib/ai/gemini/runtime-preferences";
import { db, shopContext } from "@/lib/db";
import { EXTRACTION_SYSTEM_PROMPT, EXTRACTION_USER_PROMPT } from "../prompts/extraction";
import { ExtractedOrderSchema, canonicalizeOrder } from "./model-order";
import type { ExtractionInput, ExtractionResult } from "./types";

export { verifyGeminiKey } from "@/lib/ai/gemini/provider";
// Kept exported from here: the visual extractor and tests import them from this module.
export { ExtractedOrderSchema, canonicalizeOrder };

// Exported for the visual extractor (ledger AI-21): both paths validate the
// model output with the exact same bounded schema — one extraction truth.
export const responseSchema = {
  type: "object",
  properties: {
    customerName: { type: "string" }, phone: { type: "string" },
    wilaya: { type: "string" }, commune: { type: "string" },
    address: { type: "string" }, totalPrice: { type: "number", minimum: 0 },
    notes: { type: "string" },
    items: { type: "array", items: { type: "object", properties: {
      productName: { type: "string" }, quantity: { type: "integer", minimum: 1 },
      unitPrice: { type: "number", minimum: 0 },
    }, required: ["productName", "quantity"], additionalProperties: false } },
  },
  required: ["items"], additionalProperties: false,
} as const;

type GeminiPart = { text?: string; thought?: boolean };
type GeminiResponse = { candidates?: Array<{ content?: { parts?: GeminiPart[] } }> };

/** Drop thought parts the way chat does, then join only visible text. */
export function visibleGeminiText(parts: GeminiPart[] | undefined): string {
  return (parts ?? [])
    .filter((part) => !part.thought)
    .map((part) => part.text ?? "")
    .join("")
    .trim();
}
const fail = (code: string, retryAfterSeconds?: number): ExtractionResult => ({
  order: null, method: "none", confidence: 0, isComplete: false, missingFields: [code],
  // Only a quota answer that named a delay carries it (the router pauses on it).
  ...(retryAfterSeconds !== undefined ? { raw: { retryAfterSeconds } } : {}),
});

export interface GeminiExtractorOptions { apiKey: string; timeoutMs?: number }

export async function extractWithGemini(
  input: ExtractionInput,
  options: GeminiExtractorOptions,
): Promise<ExtractionResult> {
  if (!options.apiKey) return fail("GEMINI_KEY_MISSING");
  try {
    const runtime = await loadGeminiRuntimePreferences({
      prisma: db,
      shop: shopContext,
    });
    const { response, model } = await requestGemini(options.apiKey, {
      timeoutMs: options.timeoutMs ?? 15_000,
      preferredModel: runtime.model,
      body: {
        systemInstruction: { parts: [{ text: EXTRACTION_SYSTEM_PROMPT }] },
        contents: [{
          role: "user",
          parts: [{ text: EXTRACTION_USER_PROMPT(input.body, input.catalog?.map((entry) => entry.name)) }],
        }],
        generationConfig: {
          // Same output budget as chat. 1024 counted thinking tokens and
          // starved the JSON.
          maxOutputTokens: 8192,
          responseMimeType: "application/json",
          responseJsonSchema: responseSchema,
          thinkingConfig: { thinkingLevel: runtime.thinkingLevel },
        },
      },
    });
    const data = await response.json() as GeminiResponse;
    const text = visibleGeminiText(data.candidates?.[0]?.content?.parts);
    if (!text) return fail("GEMINI_EMPTY_RESPONSE");
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { return fail("GEMINI_INVALID_EXTRACTION"); }
    const validated = ExtractedOrderSchema.safeParse(parsed);
    if (!validated.success) return fail("GEMINI_INVALID_EXTRACTION");
    const order = canonicalizeOrder(validated.data, input);
    const missingFields: string[] = [];
    if (order.items.length === 0) missingFields.push("items");
    if (!order.wilaya) missingFields.push("wilaya");
    if (!order.phone) missingFields.push("phone");
    return {
      order, method: "gemini", confidence: 0.9,
      isComplete: missingFields.length === 0,
      missingFields: missingFields.length ? missingFields : undefined,
      raw: { model },
    };
  } catch (error) {
    return error instanceof GeminiProviderError
      ? fail(error.code, error.retryAfterSeconds)
      : fail("GEMINI_PROVIDER_UNAVAILABLE");
  }
}
