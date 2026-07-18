/**
 * Smart router — decides whether to use regex or Gemini.
 *
 * Strategy (design system v2.1):
 *   1. Try regex first (instant, offline, free)
 *   2. If regex confidence >= 0.6 AND isComplete → use regex result
 *   3. Otherwise → try Gemini (uses seller's API key)
 *   4. If Gemini also fails → return best result + missing fields
 *
 * This protects the 1,500 RPD Gemini quota: ~70% of messages
 * are handled by regex and never hit Gemini.
 */

import type { ServiceContext } from "@/lib/data/service-base";
import { extractWithRegex } from "./regex-extractor";
import { extractWithGemini } from "./gemini-extractor";
import type { ExtractionInput, ExtractionResult } from "./types";

/** Minimum regex confidence to skip Gemini */
const REGEX_CONFIDENCE_THRESHOLD = 0.6;

export interface SmartRouterOptions {
  /** Seller's Gemini API key (from OS keychain). If absent, regex-only mode. */
  geminiApiKey?: string;
  /** Force Gemini even if regex succeeds (for testing) */
  forceGemini?: boolean;
}

export async function extractOrder(
  input: ExtractionInput,
  options: SmartRouterOptions = {},
): Promise<ExtractionResult> {
  // Step 1: Try regex first (unless forced to Gemini)
  if (!options.forceGemini) {
    const regexResult = extractWithRegex(input);

    // If regex is confident and complete, use it
    if (regexResult.confidence >= REGEX_CONFIDENCE_THRESHOLD && regexResult.isComplete) {
      return regexResult;
    }

    // If regex has decent confidence but incomplete, still try Gemini for the missing fields
    // (but keep regex as a fallback)
    if (regexResult.confidence >= 0.3 && !options.geminiApiKey) {
      // No Gemini key — return the partial regex result
      return regexResult;
    }
  }

  // Step 2: Try Gemini (for complex messages or when regex is incomplete)
  if (options.geminiApiKey) {
    const geminiResult = await extractWithGemini(input, { apiKey: options.geminiApiKey });

    // If Gemini succeeded, use it
    if (geminiResult.order) {
      return geminiResult;
    }
  }

  // Step 3: Fall back to regex result (even if incomplete)
  const regexFallback = extractWithRegex(input);
  return regexFallback;
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
