import { OpenAiProviderError } from "@/lib/ai/providers/openai-chatgpt/errors";
import { requestOpenAiResponses } from "@/lib/ai/providers/openai-chatgpt/responses";
import { EXTRACTION_SYSTEM_PROMPT, EXTRACTION_USER_PROMPT } from "../prompts/extraction";
import { ExtractedOrderSchema, canonicalizeOrder } from "./model-order";
import type { ExtractionInput, ExtractionResult } from "./types";

const fail = (code: string, retryAfterSeconds?: number | null): ExtractionResult => ({
  order: null, method: "none", confidence: 0, isComplete: false, missingFields: [code],
  // A quota answer that named a delay carries it so the router can pause this engine.
  ...(typeof retryAfterSeconds === "number" ? { raw: { retryAfterSeconds } } : {}),
});

export interface OpenAiExtractorOptions { accessToken: string; model: string; timeoutMs?: number }

/** The model may wrap its JSON in a code fence or add a sentence; take the object. */
function parseJsonObject(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = (fenced?.[1] ?? text).trim();
  try { return JSON.parse(body); } catch { /* try the outermost braces */ }
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try { return JSON.parse(body.slice(start, end + 1)); } catch { /* fall through */ }
  }
  return undefined;
}

/**
 * Reads an order with the seller's own ChatGPT plan (Responses API). Same
 * result contract as extractWithGroq: a failure returns no order and the error
 * code as `missingFields[0]`. Pure: the caller supplies a fresh access token.
 */
export async function extractWithOpenAiPlan(
  input: ExtractionInput,
  options: OpenAiExtractorOptions,
): Promise<ExtractionResult> {
  if (!options.accessToken) return fail("OPENAI_TOKEN_EXPIRED");
  if (!options.model) return fail("OPENAI_MODEL_UNAVAILABLE");
  try {
    const answer = await requestOpenAiResponses({
      accessToken: options.accessToken,
      model: options.model,
      instructions: EXTRACTION_SYSTEM_PROMPT,
      input: [{ role: "user", content: EXTRACTION_USER_PROMPT(input.body, input.catalog?.map((entry) => entry.name)) }],
    }, { timeoutMs: options.timeoutMs ?? 30_000 });
    const text = answer.text.trim();
    if (!text) return fail("OPENAI_EMPTY_RESPONSE");
    const validated = ExtractedOrderSchema.safeParse(parseJsonObject(text));
    if (!validated.success) return fail("OPENAI_INVALID_EXTRACTION");
    const order = canonicalizeOrder(validated.data, input);
    const missingFields: string[] = [];
    if (order.items.length === 0) missingFields.push("items");
    if (!order.wilaya) missingFields.push("wilaya");
    if (!order.phone) missingFields.push("phone");
    return {
      order, method: "openai", confidence: 0.9,
      isComplete: missingFields.length === 0,
      missingFields: missingFields.length ? missingFields : undefined,
      raw: { model: answer.model, usage: answer.usage },
    };
  } catch (error) {
    return error instanceof OpenAiProviderError
      ? fail(error.code, error.retryAfterSeconds)
      : fail("OPENAI_PROVIDER_UNAVAILABLE");
  }
}
