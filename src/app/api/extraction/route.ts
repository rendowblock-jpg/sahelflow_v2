import { NextRequest, NextResponse } from "next/server";
import { extractOrder, recordExtractionMetric } from "@/lib/ai/extraction";
import { geminiModelVersion } from "@/lib/ai/extraction/model-version";
import { checkTotal, metricConfidence } from "@/lib/ai/extraction/draft-feedback";

// Session 29 fix (AUDIT-7 AI1): recordExtractionMetric was defined but never
// called outside tests → extraction analytics dashboard was permanently empty.
// Now called fire-and-forget after every extraction.
import { getSecret } from "@/lib/secrets";
import { GROQ_API_KEY_SECRET } from "@/lib/ai/providers/groq/catalog";
import { restoreQuotaLedger, saveQuotaLedger } from "@/lib/ai/providers/quota-ledger-store";
import { getBool, getSetting, SETTING_KEYS } from "@/lib/settings";
import { AI_PROVIDER_ORDER_SETTING, parseProviderOrderSetting, providerOrderFor } from "@/lib/ai/providers/provider-order";
import { z } from "zod";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth, getCurrentUserKey } from "@/lib/auth/server";
import { trustedActionAllowed } from "@/lib/identity/authorization";
import { checkRateLimit } from "@/lib/ai/rate-limit";
import { db, shopContext } from "@/lib/db";
import { listExtractionCatalog } from "@/lib/orders/canonical-named-items";
import { readBoundedText } from "@/lib/mcp/request-body";
import { SahelFlowError } from "@/types/errors";

export const dynamic = "force-dynamic";

/**
 * Hard ceiling on the request body (S06b-08). The message is capped at 16,000
 * characters below; 128 KiB covers that at four bytes a character plus the
 * JSON around it, and nothing larger is buffered.
 */
const MAX_EXTRACTION_BODY_BYTES = 128 * 1024;

const extractionSchema = z.object({
  // Audit S2-6: bounded request body — a multi-MB paste must be rejected at
  // the door, not forwarded toward the Gemini/regex extraction pipeline.
  body: z.string().min(1).max(16000),
  channel: z.string().optional(),
  knownPhone: z.string().max(32).optional(),
  /** AI-M14: optional messageId so the ExtractionMetric row can be linked
   *  back to the WhatsApp/TikTok Message that was extracted. Previously
   *  metrics were always recorded with messageId=null, making the
   *  extraction-analytics dashboard unable to drill into specific messages.
   *  Audit S2-6: capped at 128 — the value feeds the rate-limit bucket key. */
  messageId: z.string().max(128).optional(),
});

/** POST /api/extraction — extract an order from a message body.
 *
 * The offline reader always runs. The Gemini key is used only when the seller
 * consented, from the stored encrypted secret ("gemini_api_key"); otherwise
 * the route is local-only. The response carries the seller's catalog so the
 * review sheet can confirm or correct every item against real products.
 *
 * The key never needs to be present on the client in normal use.
 */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const actorContext = await requireAuth(["ai.use", "customers.contact.read"]);
  // The catalog steers matching server-side for everyone who may extract; it
  // is returned for review only to people who may read products.
  const mayReadCatalog = trustedActionAllowed(actorContext, "products.read", {
    shopId: actorContext.shop.shopId,
  });

  // fix-B6 / FD-064: informed consent governs what LEAVES the device. The
  // offline reader runs locally and sends nothing anywhere, so it works
  // without consent; only the Gemini path requires the seller's explicit
  // consent (Settings → AI). Without it the key is never resolved, and the
  // response says so, so review can offer to enable AI for harder messages.
  const consent = await getBool(
    { prisma: db, shop: shopContext },
    SETTING_KEYS.geminiConsentAccepted,
    false,
  );

  const bounded = await readBoundedText(req, MAX_EXTRACTION_BODY_BYTES);
  if (!bounded.ok) {
    throw new SahelFlowError("The message is too long to read", "VALIDATION_ERROR", 413);
  }
  let body: unknown;
  try {
    body = JSON.parse(bounded.text);
  } catch {
    throw new SahelFlowError("The request body is not valid JSON", "VALIDATION_ERROR", 400);
  }
  const input = extractionSchema.parse(body);

  // AI-M1: rate-limit the extraction route to prevent Gemini-quota
  // exhaustion. Parity with the chat routes (/api/ai/sessions/[id]/messages
  // + stream), which already call checkRateLimit. Without this, an
  // authenticated user could spam /api/extraction to drain the seller's
  // Gemini free-tier quota in seconds.
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
    // Audit S2-6: coded 429 with Retry-After when the limiter provides one.
    return NextResponse.json(
      { error: rl.reason ?? "Rate limited", code: "AI_RATE_LIMITED" },
      {
        status: 429,
        headers: rl.retryAfterMs
          ? { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) }
          : {},
      },
    );
  }

  // Provider selection and credentials remain server authority. Request bodies
  // cannot redirect customer data to an arbitrary external account or force a
  // provider path.
  const geminiApiKey = consent
    ? (await getSecret({ prisma: db, shop: shopContext }, "gemini_api_key")) ?? undefined
    : undefined;
  // A seller who made a free Groq key has it here too; none changes nothing.
  const groqApiKey = consent
    ? (await getSecret({ prisma: db, shop: shopContext }, GROQ_API_KEY_SECRET)) ?? undefined
    : undefined;
  // The seller's "try this AI first" choice; a missing or unreadable value means Groq first.
  let storedOrder: string | null = null;
  try {
    storedOrder = await getSetting({ prisma: db, shop: shopContext }, AI_PROVIDER_ORDER_SETTING);
  } catch {
    // A failed read must never block order reading; the default order applies.
  }
  const providerOrder = providerOrderFor(parseProviderOrderSetting(storedOrder));
  // Pauses from an earlier run (best effort; once per process).
  await restoreQuotaLedger({ prisma: db, shop: shopContext });
  const catalog = await listExtractionCatalog({ prisma: db });

  const start = Date.now();
  const result = await extractOrder(
    {
      body: input.body,
      channel: input.channel,
      knownPhone: input.knownPhone,
      catalog: catalog.map((entry) => ({ name: entry.name })),
    },
    { geminiApiKey, groqApiKey, providerOrder },
  );
  await saveQuotaLedger({ prisma: db, shop: shopContext });

  // Fire-and-forget — never blocks the response. recordExtractionMetric
  // has its own try/catch that swallows errors (best-effort).
  // Session 29 fix (AUDIT-7 AI1): without this, the extraction-analytics
  // dashboard at /analytics/extraction is permanently empty.
  // AI-M14: forward the messageId (when provided by the caller) so the
  // ExtractionMetric row can be linked back to the source Message.
  void recordExtractionMetric({ prisma: db, shop: shopContext }, {
    messageId: input.messageId,
    method: result.method,
    // S06b-11: a model's own claim is not stored as a measurement (-1 = not measured).
    confidence: metricConfidence(result).value,
    isComplete: result.isComplete,
    missingFields: result.missingFields,
    latencyMs: Date.now() - start,
    modelVersion: geminiModelVersion(result, "gemini"),
  }).catch(() => { /* best-effort */ });

  return NextResponse.json({
    result: { ...result, totalCheck: checkTotal(result.order), confidenceBasis: metricConfidence(result).basis },
    catalog: mayReadCatalog ? catalog : [],
    ai: {
      consent,
      available: Boolean(geminiApiKey || groqApiKey),
      ...(consent ? {} : { code: "AI_CONSENT_REQUIRED" }),
    },
  });
}, "POST /api/extraction");
