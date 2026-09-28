/**
 * Smart router — decides whether to use regex or Gemini.
 *
 * Strategy (FD-064):
 *   1. The offline reader runs first (instant, on-device, free)
 *   2. Complete and confident → that is the answer; nothing leaves the device
 *   3. Otherwise, with the seller's key → Gemini, completed from the offline
 *      reading wherever the model left a field empty
 *   4. Gemini unavailable → the offline reading, carrying the failure code
 *
 * This protects the seller-owned Gemini quota (the shared session/user rate
 * limiter caps chat + extraction at 20/session/hour and 100/user/day): ~70%
 * of messages are handled by regex and never hit Gemini.
 */

import type { ServiceContext } from "@/lib/data/service-base";
import { extractWithRegex, readOrderFields } from "./regex-extractor";
import { extractWithGemini } from "./gemini-extractor";
import { extractWithGeminiFromImage } from "./image-extractor";
import type { ExtractedOrder, ExtractionImageInput, ExtractionInput, ExtractionResult } from "./types";

/** Minimum regex confidence to skip Gemini */
const REGEX_CONFIDENCE_THRESHOLD = 0.6;

export interface SmartRouterOptions {
  /** Seller's Gemini API key (from OS keychain). If absent, regex-only mode. */
  geminiApiKey?: string;
  /** Force Gemini even if regex succeeds (for testing) */
  forceGemini?: boolean;
  /** Provider call ceiling (visual extraction path). */
  timeoutMs?: number;
}

export async function extractOrder(
  input: ExtractionInput,
  options: SmartRouterOptions = {},
): Promise<ExtractionResult> {
  const regexResult = extractWithRegex(input);

  // A complete, confident offline reading never leaves the device.
  if (
    !options.forceGemini &&
    regexResult.confidence >= REGEX_CONFIDENCE_THRESHOLD &&
    regexResult.isComplete
  ) {
    return regexResult;
  }
  if (!options.geminiApiKey) return regexResult;

  const geminiResult = await extractWithGemini(input, { apiKey: options.geminiApiKey });
  if (geminiResult.order) return completeFromOfflineReading(geminiResult, input);

  // Gemini unavailable: the offline reading stands, and the reason travels
  // with it so review can say why the AI did not help this time.
  const failure = geminiResult.missingFields?.[0];
  return failure ? { ...regexResult, aiFailure: failure } : regexResult;
}

/**
 * FD-064: Gemini reads the hard part, the offline reader keeps what it is
 * certain of. Any field the model left empty (a phone after a label, a wilaya
 * number, an address line) is filled from the offline reading, so the merged
 * answer is never worse than either reader alone.
 */
function completeFromOfflineReading(
  geminiResult: ExtractionResult,
  input: ExtractionInput,
): ExtractionResult {
  const offline = readOrderFields(input).order;
  const model = geminiResult.order!;
  const order: ExtractedOrder = {
    ...model,
    items: model.items.length > 0 ? model.items : offline.items,
    customerName: model.customerName ?? offline.customerName,
    phone: model.phone ?? offline.phone,
    wilaya: model.wilaya ?? offline.wilaya,
    commune: model.commune ?? offline.commune,
    address: model.address ?? offline.address,
    totalPrice: model.totalPrice ?? offline.totalPrice,
    notes: model.notes ?? offline.notes,
  };
  for (const key of Object.keys(order) as Array<keyof ExtractedOrder>) {
    if (order[key] === undefined) delete order[key];
  }
  const missingFields: string[] = [];
  if (order.items.length === 0) missingFields.push("items");
  if (!order.wilaya) missingFields.push("wilaya");
  if (!order.phone) missingFields.push("phone");
  return {
    ...geminiResult,
    order,
    isComplete: missingFields.length === 0,
    missingFields: missingFields.length ? missingFields : undefined,
  };
}

/**
 * Ledger AI-21 — visual extraction entry point for the agents composer.
 *
 * There is deliberately NO regex fallback for screenshots: pixels have no
 * offline extractor, so without the seller's Gemini key the honest result is
 * the typed failure code (the composer surfaces it verbatim), never a
 * fabricated order.
 */
export async function extractOrderFromImage(
  input: ExtractionImageInput,
  options: SmartRouterOptions = {},
): Promise<ExtractionResult> {
  return extractWithGeminiFromImage(input, {
    apiKey: options.geminiApiKey ?? "",
    ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {}),
  });
}


/**
 * Record an extraction metric for accuracy tracking (Phase 5 moat).
 * Fire-and-forget — never blocks the extraction flow.
 */
export async function recordExtractionMetric(context: ServiceContext, params: {
  messageId?: string;
  method: string;
  confidence: number;
  isComplete: boolean;
  missingFields?: string[];
  fieldAccuracy?: Record<string, boolean>;
  latencyMs: number;
  modelVersion?: string;
}): Promise<void> {
  try {
    await context.prisma.extractionMetric.create({
      data: {
        messageId: params.messageId ?? null,
        method: params.method,
        confidence: params.confidence,
        isComplete: params.isComplete,
        missingFields: params.missingFields ? JSON.stringify(params.missingFields) : null,
        fieldAccuracy: params.fieldAccuracy ? JSON.stringify(params.fieldAccuracy) : null,
        latencyMs: params.latencyMs,
        modelVersion: params.modelVersion ?? null,
      },
    });
  } catch {
    // best-effort — never block extraction
  }
}
