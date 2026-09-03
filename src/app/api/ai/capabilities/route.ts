import { NextResponse } from "next/server";

import { aiCapabilityGroups } from "@/lib/ai/chat/tools/capability-groups";
import { loadShopBriefing } from "@/lib/ai/chat/shop-context";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { db, shopContext } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/ai/capabilities — the AI Agents page's capability truth (F-06).
 *
 * `groups` is projected from the same central policy map the registry and the
 * proposal runtime enforce, grouped by operational job; blocked tools are
 * omitted (Gemini never sees them). `briefing` carries the shop's honest
 * present-state counts, each independently nullable — a failed count renders
 * nothing rather than a fabricated zero.
 */
export const GET = withErrorHandler(async () => {
  await requireAuth("ai.use");
  const [groups, briefing] = await Promise.all([
    aiCapabilityGroups(),
    loadShopBriefing(db, shopContext),
  ]);
  return NextResponse.json({ groups, briefing });
}, "GET /api/ai/capabilities");
