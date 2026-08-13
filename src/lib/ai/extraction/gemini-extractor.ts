import { z } from "zod";
import { GeminiProviderError, requestGemini } from "@/lib/ai/gemini/provider";
import { EXTRACTION_SYSTEM_PROMPT, EXTRACTION_USER_PROMPT } from "../prompts/extraction";
import type { ExtractedOrder, ExtractionInput, ExtractionResult } from "./types";

export { verifyGeminiKey } from "@/lib/ai/gemini/provider";

const numeric = (label: string, min = 0) => z.union([
  z.number().min(min),
  z.string().transform((value, ctx) => {
    const number = Number(value);
    if (!Number.isFinite(number) || number < min) {
      ctx.addIssue({ code: "custom", message: `Invalid ${label}` });
      return z.NEVER;
    }
    return number;
  }),
]);

export const ExtractedOrderSchema = z.object({
  customerName: z.string().optional(),
  phone: z.string().optional(),
  wilaya: z.string().optional(),
  commune: z.string().optional(),
  address: z.string().optional(),
  items: z.array(z.object({
    productName: z.string(),
    quantity: numeric("quantity", 1).transform((value) => Math.trunc(value)),
    unitPrice: numeric("unitPrice").optional(),
  })),
  totalPrice: numeric("totalPrice").optional(),
  notes: z.string().optional(),
});

const responseSchema = {
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

type GeminiResponse = { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
const fail = (code: string): ExtractionResult => ({
  order: null, method: "none", confidence: 0, isComplete: false, missingFields: [code],
});

export interface GeminiExtractorOptions { apiKey: string; timeoutMs?: number }

export async function extractWithGemini(
  input: ExtractionInput,
  options: GeminiExtractorOptions,
): Promise<ExtractionResult> {
  if (!options.apiKey) return fail("GEMINI_KEY_MISSING");
  try {
    const { response, model } = await requestGemini(options.apiKey, {
      timeoutMs: options.timeoutMs ?? 15_000,
      body: {
        systemInstruction: { parts: [{ text: EXTRACTION_SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: EXTRACTION_USER_PROMPT(input.body) }] }],
        generationConfig: {
          maxOutputTokens: 1024,
          responseFormat: { text: { mimeType: "application/json", schema: responseSchema } },
        },
      },
    });
    const data = await response.json() as GeminiResponse;
    const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
    if (!text) return fail("GEMINI_EMPTY_RESPONSE");
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { return fail("GEMINI_INVALID_EXTRACTION"); }
    const validated = ExtractedOrderSchema.safeParse(parsed);
    if (!validated.success) return fail("GEMINI_INVALID_EXTRACTION");
    const order: ExtractedOrder = validated.data;
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
    return fail(error instanceof GeminiProviderError ? error.code : "GEMINI_PROVIDER_UNAVAILABLE");
  }
}
