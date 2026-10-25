import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOpenAiRuntime } from "@/lib/ai/providers/openai-chatgpt/runtime";
import { invalidRequest, openAiFailure, requestLocale } from "@/lib/ai/providers/openai-chatgpt/route-support";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { logAudit } from "@/lib/audit";
import { requireAuth, requireRecentReauthentication } from "@/lib/auth/server";
import { trustedActorAuditIdentity } from "@/lib/identity/authorization";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ accountId: z.number().int().positive().optional() }).strict();

/**
 * POST /api/ai/openai/sign-in: starts a Sign in with ChatGPT. Returns the address the app opens in the
 * SYSTEM browser. The browser's return arrives at a loopback listener (not at this server), so the screen
 * polls /sign-in/status with the attempt id.
 */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const actorContext = await requireAuth("integrations.manage");
  await requireRecentReauthentication();
  const locale = requestLocale(req);
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return invalidRequest(locale);
  const { signIn, context } = getOpenAiRuntime();
  try {
    const { url, attemptId } = await signIn.startSignIn(parsed.data);
    const actor = trustedActorAuditIdentity(actorContext.actor);
    void signIn.completeSignIn(attemptId).then(
      (summary) => logAudit(context, {
        action: "ai.openai.signed_in", entity: "secret", entityId: `openai_chatgpt_account_${summary.accountId}`, actor,
        after: { signedIn: true, planUsageEnabled: summary.planUsageEnabled },
      }),
      () => undefined,
    ).catch(() => undefined);
    return NextResponse.json({ ok: true, url, attemptId });
  } catch (error) {
    return openAiFailure(error, locale);
  }
}, "POST /api/ai/openai/sign-in");
