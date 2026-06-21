/**
 * AI extraction module — smart routing between regex and Gemini.
 *
 * Usage:
 *   import { extractOrder } from "@/lib/ai/extraction";
 *   const result = await extractOrder({ body: message }, { geminiApiKey });
 */
export { extractWithRegex } from "./regex-extractor";
export { extractWithGemini, verifyGeminiKey } from "./gemini-extractor";
export { extractOrder } from "./smart-router";
export type { ExtractionInput, ExtractionResult, ExtractedOrder, ExtractedItem } from "./types";
