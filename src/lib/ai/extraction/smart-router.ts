/**
 * Smart router — decides whether to use the offline reader or an AI provider.
 *
 * Strategy (FD-064):
 *   1. The offline reader runs first (instant, on-device, free)
 *   2. Complete and confident → that is the answer; nothing leaves the device
 *   3. Otherwise, with the seller's keys → each provider in order (default
 *      Groq, then Gemini), completed from the offline reading wherever the
 *      model left a field empty. A provider the quota ledger says is paused
 *      is skipped without a network call
 *   4. No provider answered → the offline reading, carrying the first failure
 *      code and, when a quota pause is running, when to try again
 *
 * This protects the seller-owned AI quota (the shared session/user rate
 * limiter caps chat + extraction at 20/session/hour and 100/user/day).
 * A complete reading that already names the seller's products stays on the
 * device. An unfinished reading, or a product that did not land on the
 * catalog, still asks Gemini when the seller enabled it.
 */

import type { ServiceContext } from "@/lib/data/service-base";
import { extractWithRegex, readOrderFields } from "./regex-extractor";
import { extractWithGemini } from "./gemini-extractor";
import { extractWithGroq } from "./groq-extractor";
import { quotaLedger, type AiProviderId, type QuotaLedger } from "../providers/quota-ledger";
import { extractWithGeminiFromImage } from "./image-extractor";
import type { ExtractedOrder, ExtractionImageInput, ExtractionInput, ExtractionResult } from "./types";

/** Minimum regex confidence to skip Gemini */
const REGEX_CONFIDENCE_THRESHOLD = 0.6;

/**
 * The offline reading is enough when it is complete and, if the seller has a
 * catalog, every item already landed on one product. A complete-looking line
 * that is not in the catalog ("لابنتي", a split name) still goes to Gemini.
 */
function offlineReadingIsEnough(result: ExtractionResult, input: ExtractionInput): boolean {
  if (result.confidence < REGEX_CONFIDENCE_THRESHOLD || !result.isComplete || !result.order) return false;
  if (!input.catalog?.length) return true;
  return result.order.items.length > 0 && result.order.items.every((item) => item.catalogMatch);
}

/** Groq first: its free plan allows far more requests than Gemini's. */
export const DEFAULT_PROVIDER_ORDER: readonly AiProviderId[] = ["groq", "gemini"];

const QUOTA_CODE = /_QUOTA_EXHAUSTED$/;

export interface SmartRouterOptions {
  /** Seller's Gemini API key (from OS keychain). */
  geminiApiKey?: string;
  /** Seller's Groq API key. With neither key the router is offline-only. */
  groqApiKey?: string;
  /** Which providers to try, in order. Providers without a key are skipped. */
  providerOrder?: readonly AiProviderId[];
  /** Force the AI even if regex succeeds (for testing) */
  forceGemini?: boolean;
  /** Provider call ceiling (visual extraction path). */
  timeoutMs?: number;
  /** Quota ledger and clock; tests inject their own. */
  ledger?: QuotaLedger;
  now?: () => Date;
}

export async function extractOrder(
  input: ExtractionInput,
  options: SmartRouterOptions = {},
): Promise<ExtractionResult> {
  const regexResult = extractWithRegex(input);

  // A complete, confident offline reading never leaves the device.
  if (!options.forceGemini && offlineReadingIsEnough(regexResult, input)) {
    return regexResult;
  }

  const keys: Record<AiProviderId, string | undefined> = {
    gemini: options.geminiApiKey,
    groq: options.groqApiKey,
  };
  const providers = (options.providerOrder ?? DEFAULT_PROVIDER_ORDER).flatMap((id) => {
    const apiKey = keys[id];
    return apiKey ? [{ id, apiKey }] : [];
  });
  if (providers.length === 0) return regexResult;

  const ledger = options.ledger ?? quotaLedger;
  const now = options.now?.() ?? new Date();
  let firstFailure: string | undefined;
  const pauseEnds: Date[] = [];

  for (const { id: provider, apiKey } of providers) {
    const pause = ledger.isPaused(provider, now);
    if (pause.paused) {
      // Known to be out of quota: no call, but the reason still travels.
      firstFailure ??= `${provider.toUpperCase()}_QUOTA_EXHAUSTED`;
      pauseEnds.push(pause.until ?? now);
      continue;
    }
    ledger.recordRequest(provider, now);
    const result =
      provider === "groq"
        ? await extractWithGroq(input, { apiKey })
        : await extractWithGemini(input, { apiKey });
    if (result.order) return completeFromOfflineReading(result, input);

    const failure = result.missingFields?.[0];
    firstFailure ??= failure;
    if (failure && QUOTA_CODE.test(failure)) {
      const delay = (result.raw as { retryAfterSeconds?: unknown } | null | undefined)?.retryAfterSeconds;
      pauseEnds.push(ledger.recordQuotaHit(provider, typeof delay === "number" ? delay : null, now));
    }
  }

  // No provider answered: the offline reading stands, and the reason travels
  // with it so review can say why the AI did not help this time.
  if (!firstFailure) return regexResult;
  const retryAt = pauseEnds.length ? new Date(Math.min(...pauseEnds.map((d) => d.getTime()))) : null;
  return {
    ...regexResult,
    aiFailure: firstFailure,
    ...(retryAt ? { aiRetryAt: retryAt.toISOString() } : {}),
  };
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
