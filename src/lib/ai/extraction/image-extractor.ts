import { GeminiProviderError, requestGemini } from "@/lib/ai/gemini/provider";
import {
  EXTRACTION_IMAGE_USER_PROMPT,
  EXTRACTION_SYSTEM_PROMPT,
} from "../prompts/extraction";
import { ExtractedOrderSchema, responseSchema } from "./gemini-extractor";
import type { ExtractionImageInput, ExtractionResult } from "./types";

/**
 * Ledger AI-21 — visual extraction bridge for the agents composer.
 *
 * Sellers screenshot conversations when the customer's order details live in
 * an image (WhatsApp, Facebook, Instagram DMs). The extraction result type,
 * the bounded zod schema and the structured-JSON provider contract are shared
 * verbatim with the text extractor, so a screenshot extraction can never
 * produce a shape the rest of the pipeline has not already audited.
 *
 * Container truth: browser declarations never become authority — the image
 * bytes are authenticated by magic-number sniffing in the route before this
 * module is reached, and the provider receives the sniffed MIME type.
 */

/** Screenshot declarations the visual extractor accepts (same set the inbox
 *  image sender ships — JPEG/PNG/WebP are what WebView2 pickers produce). */
export const SAFE_EXTRACTION_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

/** Hard ceiling for one screenshot (WhatsApp screenshots sit far below it). */
export const MAX_EXTRACTION_IMAGE_BYTES = 10 * 1024 * 1024;

const fail = (code: string): ExtractionResult => ({
  order: null,
  method: "none",
  confidence: 0,
  isComplete: false,
  missingFields: [code],
});

export interface GeminiImageExtractorOptions {
  apiKey: string;
  timeoutMs?: number;
}

type GeminiImageResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
};

export async function extractWithGeminiFromImage(
  input: ExtractionImageInput,
  options: GeminiImageExtractorOptions,
): Promise<ExtractionResult> {
  if (!options.apiKey) return fail("GEMINI_KEY_MISSING");
  if (!SAFE_EXTRACTION_IMAGE_TYPES.has(input.mimeType)) {
    return fail("EXTRACTION_IMAGE_TYPE_UNSUPPORTED");
  }
  if (
    input.bytes.byteLength === 0 ||
    input.bytes.byteLength > MAX_EXTRACTION_IMAGE_BYTES
  ) {
    return fail("EXTRACTION_IMAGE_TOO_LARGE");
  }
  try {
    const { response, model } = await requestGemini(options.apiKey, {
      timeoutMs: options.timeoutMs ?? 20_000,
      body: {
        systemInstruction: { parts: [{ text: EXTRACTION_SYSTEM_PROMPT }] },
        contents: [
          {
            role: "user",
            parts: [
              {
                inline_data: {
                  mime_type: input.mimeType,
                  data: Buffer.from(input.bytes).toString("base64"),
                },
              },
              { text: EXTRACTION_IMAGE_USER_PROMPT(input.fileName) },
            ],
          },
        ],
        generationConfig: {
          maxOutputTokens: 1024,
          responseMimeType: "application/json",
          responseJsonSchema: responseSchema,
        },
      },
    });
    const data = (await response.json()) as GeminiImageResponse;
    const text = data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("")
      .trim();
    if (!text) return fail("GEMINI_EMPTY_RESPONSE");
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return fail("GEMINI_INVALID_EXTRACTION");
    }
    const validated = ExtractedOrderSchema.safeParse(parsed);
    if (!validated.success) return fail("GEMINI_INVALID_EXTRACTION");
    const order = validated.data;
    const missingFields: string[] = [];
    if (order.items.length === 0) missingFields.push("items");
    if (!order.wilaya) missingFields.push("wilaya");
    if (!order.phone) missingFields.push("phone");
    return {
      order,
      method: "gemini",
      confidence: 0.9,
      isComplete: missingFields.length === 0,
      missingFields: missingFields.length ? missingFields : undefined,
      raw: { model, source: "screenshot" },
    };
  } catch (error) {
    return fail(
      error instanceof GeminiProviderError
        ? error.code
        : "GEMINI_PROVIDER_UNAVAILABLE",
    );
  }
}
