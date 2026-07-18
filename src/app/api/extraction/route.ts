import { NextRequest, NextResponse } from "next/server";
import { extractOrder, recordExtractionMetric } from "@/lib/ai/extraction";

// Session 29 fix (AUDIT-7 AI1): recordExtractionMetric was defined but never
// called outside tests → extraction analytics dashboard was permanently empty.
// Now called fire-and-forget after every extraction.
import { getSecret } from "@/lib/secrets";
import { getBool, SETTING_KEYS } from "@/lib/settings";
import { z } from "zod";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth, getCurrentUserKey } from "@/lib/auth/server";
import { checkRateLimit } from "@/lib/ai/rate-limit";
import { db, shopContext } from "@/lib/db";

export const dynamic = "force-dynamic";

const extractionSchema = z.object({
  body: z.string().min(1),
  channel: z.string().optional(),
  knownPhone: z.string().optional(),
  /** Optional client override; if absent, the server loads the stored key. */
  geminiApiKey: z.string().optional(),
  /** Force Gemini even if regex is confident (for testing). */
  forceGemini: z.boolean().optional(),
  /** AI-M14: optional messageId so the ExtractionMetric row can be linked
   *  back to the WhatsApp/TikTok Message that was extracted. Previously
   *  metrics were always recorded with messageId=null, making the
   *  extraction-analytics dashboard unable to drill into specific messages. */
  messageId: z.string().optional(),
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

  // fix-B6: Informed-consent gate. The extraction pipeline sends raw WhatsApp
  // message bodies (containing customer phone, name, address) to Google
  // Gemini's free-tier API — Google's free-tier terms may use inputs for
  // model training. The seller MUST explicitly consent (Settings → AI →
  // consent checkbox) before any message leaves their device. Without
  // consent, return 403 with a specific error code the UI can catch.
  // (Wave 1: gate the entire route. Wave 2 may allow regex-only without
  // consent since regex extraction is fully local.)
  const consent = await getBool(
    { prisma: db, shop: shopContext },
    SETTING_KEYS.geminiConsentAccepted,
    false,
  );
  if (!consent) {
    return NextResponse.json(
      {
        error: "consent_required",
        message:
          "AI extraction consent not given. Visit Settings → AI to enable.",
      },
      { status: 403 },
    );
  }

  const body = await req.json();
  const input = extractionSchema.parse(body);

  // AI-M1: rate-limit the extraction route to prevent Gemini-quota
  // exhaustion. Parity with the chat routes (/api/ai/sessions/[id]/messages
  // + stream), which already call checkRateLimit. Without this, an
  // authenticated user could spam /api/extraction to drain the 1500 RPD
  // Gemini free-tier in seconds.
  // Use a synthetic session key for the per-session bucket (the extraction
  // route has no sessionId; the user-key bucket is the real protection).
  // W3-19: pass the user's auth key (was: omitted → defaulted to "default",
  // so ALL users shared a single daily bucket, defeating the per-user cap).
  // Now each authenticated user gets their own 100/day bucket, matching
  // the chat routes' behavior.
  const extractionSessionKey = `extraction:${input.messageId ?? "anonymous"}`;
  const userKey = await getCurrentUserKey();
  const rl = checkRateLimit(extractionSessionKey, userKey);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: rl.reason ?? "Rate limited" },
      { status: 429, headers: rl.retryAfterMs ? { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } : {} },
    );
  }

  // Resolve the Gemini key: explicit override > stored secret > none
  let geminiApiKey = input.geminiApiKey;
  if (!geminiApiKey) {
    geminiApiKey =
      (await getSecret({ prisma: db, shop: shopContext }, "gemini_api_key")) ?? undefined;
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
  // AI-M14: forward the messageId (when provided by the caller) so the
  // ExtractionMetric row can be linked back to the source Message.
  void recordExtractionMetric({ prisma: db, shop: shopContext }, {
    messageId: input.messageId,
    method: result.method,
    confidence: result.confidence,
    isComplete: result.isComplete,
    missingFields: result.missingFields,
    latencyMs: Date.now() - start,
    modelVersion: result.method === "gemini" ? "gemini" : undefined,
  }).catch(() => { /* best-effort */ });

  return NextResponse.json({ result });
}, "POST /api/extraction");
