import { NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { db, shopContext } from "@/lib/db";
import { hasSecret } from "@/lib/secrets";
import { getBool, getSetting, SETTING_KEYS } from "@/lib/settings";
import { GROQ_API_KEY_SECRET } from "@/lib/ai/providers/groq/catalog";
import { AI_PROVIDER_ORDER_SETTING, parseProviderOrderSetting } from "@/lib/ai/providers/provider-order";
import { readRequestsToday } from "@/lib/ai/providers/quota-counter";
import { readGeminiFreeKeyEvidence } from "@/lib/ai/providers/quota-evidence";
import { quotaLedger, type AiProviderId } from "@/lib/ai/providers/quota-ledger";
import { restoreQuotaLedger } from "@/lib/ai/providers/quota-ledger-store";
import { GEMINI_FREE_DAILY_LIMIT, pausesFromLedger, resolveQuotaState } from "@/lib/ai/providers/quota-state";

export const dynamic = "force-dynamic";

/**
 * Safe AI setup projection. This endpoint intentionally exposes only presence
 * and consent booleans; it never decrypts or returns the Gemini API key.
 */
/**
 * Quota truth for the notices: the state (ok, low, paused, all_paused) and the
 * provider requests made today. Best effort: when it cannot be worked out the
 * fields are left out and the rest of the answer is unchanged.
 */
async function quotaFields(
  context: { prisma: typeof db; shop: typeof shopContext },
  configured: { gemini: boolean; groq: boolean },
  order: string,
) {
  try {
    await restoreQuotaLedger(context);
    const now = new Date();
    const ranked: AiProviderId[] = order === "groq-first" ? ["groq", "gemini"] : ["gemini", "groq"];
    const providers = ranked.filter((id) => (id === "gemini" ? configured.gemini : configured.groq));
    const [usedToday, freeKey] = await Promise.all([readRequestsToday(context, now), readGeminiFreeKeyEvidence(context, now)]);
    const quota = resolveQuotaState({
      now,
      providers,
      pauses: pausesFromLedger(quotaLedger, providers, now),
      usedToday,
      // Only a free Gemini key has a limit we know. Groq's plan is unknown to the app: no limit, never "low".
      limits: freeKey ? { gemini: GEMINI_FREE_DAILY_LIMIT } : {},
    });
    return { quota, requestsToday: { gemini: usedToday.gemini, groq: usedToday.groq } };
  } catch {
    return {};
  }
}

export const GET = withErrorHandler(async () => {
  await requireAuth("ai.use");
  const context = { prisma: db, shop: shopContext };
  const [consentAccepted, keyConfigured, groqConfigured, orderValue] = await Promise.all([
    getBool(context, SETTING_KEYS.geminiConsentAccepted, false),
    hasSecret(context, "gemini_api_key"),
    hasSecret(context, GROQ_API_KEY_SECRET),
    getSetting(context, AI_PROVIDER_ORDER_SETTING),
  ]);

  const order = parseProviderOrderSetting(orderValue);
  const quota = await quotaFields(context, { gemini: keyConfigured, groq: groqConfigured }, order);

  return NextResponse.json({
    provider: "gemini",
    consentAccepted,
    keyConfigured,
    // `ready` means the chat assistant: it runs on a Gemini key or a free Groq key.
    // `keyConfigured` still means only "the Gemini key exists".
    ready: consentAccepted && (keyConfigured || groqConfigured),
    // Order reading works with either key.
    extractionReady: consentAccepted && (keyConfigured || groqConfigured),
    providers: { groq: { configured: groqConfigured }, gemini: { configured: keyConfigured } },
    order,
    ...quota,
  });
}, "GET /api/ai/status");
