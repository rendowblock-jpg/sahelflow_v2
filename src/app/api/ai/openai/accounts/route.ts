import { NextRequest, NextResponse } from "next/server";
import { getOpenAiRuntime } from "@/lib/ai/providers/openai-chatgpt/runtime";
import { openAiFailure, requestLocale } from "@/lib/ai/providers/openai-chatgpt/route-support";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth, requireRecentReauthentication } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/** GET /api/ai/openai/accounts: saved ChatGPT accounts, safe fields only (no tokens, no client id). */
export const GET = withErrorHandler(async (req: NextRequest) => {
  await requireAuth("integrations.manage");
  await requireRecentReauthentication();
  try {
    const accounts = await getOpenAiRuntime().store.list();
    return NextResponse.json({
      ok: true,
      accounts: accounts.map((a) => ({ id: a.id, email: a.email ?? null, planUsageEnabled: a.planUsageEnabled, signedIn: a.signedIn, active: a.active })),
    });
  } catch (error) {
    return openAiFailure(error, requestLocale(req));
  }
}, "GET /api/ai/openai/accounts");
