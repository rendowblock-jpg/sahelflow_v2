import { NextRequest, NextResponse } from "next/server";
import { extractOrder, recordExtractionMetric } from "@/lib/ai/extraction";

// Session 29 fix (AUDIT-7 AI1): recordExtractionMetric was defined but never
// called outside tests → extraction analytics dashboard was permanently empty.
// Now called fire-and-forget after every extraction.
import { getSecret } from "@/lib/secrets";
import { z } from "zod";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

const extractionSchema = z.object({
  body: z.string().min(1),
  channel: z.string().optional(),
  knownPhone: z.string().optional(),
  /** Optional client override; if absent, the server loads the stored key. */
  geminiApiKey: z.string().optional(),
  /** Force Gemini even if regex is confident (for testing). */
  forceGemini: z.boolean().optional(),
});

/** POST /api/extraction — extract an order from a message body.
 *
 * The Gemini key is resolved in this order:
 *   1. Explicit `geminiApiKey` in the request (for testing / overrides)
 *   2. The stored encrypted secret ("gemini_api_key")
 *   3. undefined → regex-only mode
 *
 * The key never needs to be present on the client in normal use.
 */
export const POST = withErrorHandler(async (req: NextRequest) => {
  await requireAuth();
  const body = await req.json();
  const input = extractionSchema.parse(body);

  // Resolve the Gemini key: explicit override > stored secret > none
  let geminiApiKey = input.geminiApiKey;
  if (!geminiApiKey) {
    geminiApiKey = (await getSecret("gemini_api_key")) ?? undefined;
  }

  const start = Date.now();
  const result = await extractOrder(
    { body: input.body, channel: input.channel, knownPhone: input.knownPhone },
    { geminiApiKey, forceGemini: input.forceGemini },
  );

  // Fire-and-forget — never blocks the response. recordExtractionMetric
  // has its own try/catch that swallows errors (best-effort).
  // Session 29 fix (AUDIT-7 AI1): without this, the extraction-analytics
  // dashboard at /analytics/extraction is permanently empty.
  void recordExtractionMetric({
    method: result.method,
    confidence: result.confidence,
    isComplete: result.isComplete,
    missingFields: result.missingFields,
    latencyMs: Date.now() - start,
    modelVersion: result.method === "gemini" ? "gemini" : undefined,
  }).catch(() => { /* best-effort */ });

  return NextResponse.json({ result });
}, "POST /api/extraction");
