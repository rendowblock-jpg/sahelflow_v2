import { z } from "zod";
import { GeminiProviderError, requestGemini } from "@/lib/ai/gemini/provider";
import { EXTRACTION_SYSTEM_PROMPT, EXTRACTION_USER_PROMPT } from "../prompts/extraction";
import { matchCatalog } from "./catalog";
import { normalizePhone } from "./fields";
import { canonicalWilaya } from "./geography";
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
  // Audit S3-18: a misbehaving model response must not inject an unbounded
  // item list into the proposal path.
  items: z.array(z.object({
    productName: z.string(),
    quantity: numeric("quantity", 1).transform((value) => Math.trunc(value)),
    unitPrice: numeric("unitPrice").optional(),
  })).max(200),
  totalPrice: numeric("totalPrice").optional(),
  notes: z.string().optional(),
});

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

type GeminiResponse = { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
const fail = (code: string): ExtractionResult => ({
  order: null, method: "none", confidence: 0, isComplete: false, missingFields: [code],
});

export interface GeminiExtractorOptions { apiKey: string; timeoutMs?: number }

/**
 * A model answer is held to the same canonical forms as the offline reader
 * (FD-064): 0XXXXXXXXX phones, official wilaya names, catalog item names.
 * A value that cannot be made canonical is dropped and reported missing
 * rather than passed on to order creation.
 */
export function canonicalizeOrder(
  order: z.infer<typeof ExtractedOrderSchema>,
  input: Pick<ExtractionInput, "catalog" | "knownPhone">,
): ExtractedOrder {
  const phone = normalizePhone(order.phone) ?? normalizePhone(input.knownPhone);
  const wilaya = canonicalWilaya(order.wilaya);
  const clean = (value: string | undefined) => value?.replace(/\s+/g, " ").trim() || undefined;
  const items = order.items
    .map((item) => ({ ...item, productName: item.productName.replace(/\s+/g, " ").trim() }))
    .filter((item) => item.productName)
    .map((item) => {
      const quantity = Math.min(Math.max(item.quantity, 1), 999);
      const match = matchCatalog(item.productName, input.catalog);
      return {
        productName: match?.name ?? item.productName,
        quantity,
        ...(item.unitPrice !== undefined ? { unitPrice: Math.round(item.unitPrice) } : {}),
        ...(match ? { catalogMatch: match.kind } : {}),
        ...(match && match.name !== item.productName ? { sourceText: item.productName } : {}),
      };
    });
  return {
    items,
    ...(clean(order.customerName) ? { customerName: clean(order.customerName) } : {}),
    ...(phone ? { phone } : {}),
    ...(wilaya ? { wilaya } : {}),
    ...(clean(order.commune) ? { commune: clean(order.commune) } : {}),
    ...(clean(order.address) ? { address: clean(order.address) } : {}),
    ...(order.totalPrice !== undefined ? { totalPrice: Math.round(order.totalPrice) } : {}),
    ...(clean(order.notes) ? { notes: clean(order.notes) } : {}),
  };
}

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
        contents: [{
          role: "user",
          parts: [{ text: EXTRACTION_USER_PROMPT(input.body, input.catalog?.map((entry) => entry.name)) }],
        }],
        generationConfig: {
          maxOutputTokens: 1024,
          responseMimeType: "application/json",
          responseJsonSchema: responseSchema,
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
    return fail(error instanceof GeminiProviderError ? error.code : "GEMINI_PROVIDER_UNAVAILABLE");
  }
}
