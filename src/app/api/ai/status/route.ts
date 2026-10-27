import { NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { db, shopContext } from "@/lib/db";
import { hasSecret } from "@/lib/secrets";
import { getBool, getSetting, SETTING_KEYS } from "@/lib/settings";
import { GROQ_API_KEY_SECRET } from "@/lib/ai/providers/groq/catalog";
import { AI_PROVIDER_ORDER_SETTING, parseProviderOrderSetting } from "@/lib/ai/providers/provider-order";

export const dynamic = "force-dynamic";

/**
 * Safe AI setup projection. This endpoint intentionally exposes only presence
 * and consent booleans; it never decrypts or returns the Gemini API key.
 */
export const GET = withErrorHandler(async () => {
  await requireAuth("ai.use");
  const context = { prisma: db, shop: shopContext };
  const [consentAccepted, keyConfigured, groqConfigured, orderValue] = await Promise.all([
    getBool(context, SETTING_KEYS.geminiConsentAccepted, false),
    hasSecret(context, "gemini_api_key"),
    hasSecret(context, GROQ_API_KEY_SECRET),
    getSetting(context, AI_PROVIDER_ORDER_SETTING),
  ]);

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
    order: parseProviderOrderSetting(orderValue),
  });
}, "GET /api/ai/status");
