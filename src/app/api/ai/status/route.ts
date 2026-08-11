import { NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { db, shopContext } from "@/lib/db";
import { hasSecret } from "@/lib/secrets";
import { getBool, SETTING_KEYS } from "@/lib/settings";

export const dynamic = "force-dynamic";

/**
 * Safe AI setup projection. This endpoint intentionally exposes only presence
 * and consent booleans; it never decrypts or returns the Gemini API key.
 */
export const GET = withErrorHandler(async () => {
  await requireAuth("ai.use");
  const context = { prisma: db, shop: shopContext };
  const [consentAccepted, keyConfigured] = await Promise.all([
    getBool(context, SETTING_KEYS.geminiConsentAccepted, false),
    hasSecret(context, "gemini_api_key"),
  ]);

  return NextResponse.json({
    provider: "gemini",
    consentAccepted,
    keyConfigured,
    ready: consentAccepted && keyConfigured,
  });
}, "GET /api/ai/status");
