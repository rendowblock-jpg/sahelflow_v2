import { NextRequest, NextResponse } from "next/server";
import { getOpenAiRuntime } from "@/lib/ai/providers/openai-chatgpt/runtime";
import { invalidRequest, openAiFailure, parseAccountId, requestLocale } from "@/lib/ai/providers/openai-chatgpt/route-support";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { logAudit } from "@/lib/audit";
import { requireAuth, requireRecentReauthentication } from "@/lib/auth/server";
import { trustedActorAuditIdentity } from "@/lib/identity/authorization";

export const dynamic = "force-dynamic";

/** POST /api/ai/openai/accounts/:id/activate: the account order reading uses. */
export const POST = withErrorHandler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const actorContext = await requireAuth("integrations.manage");
  await requireRecentReauthentication();
  const locale = requestLocale(req);
  const id = parseAccountId((await ctx.params).id);
  if (id === null) return invalidRequest(locale);
  const { store, context } = getOpenAiRuntime();
  try {
    await store.setActive(id);
  } catch (error) {
    return openAiFailure(error, locale);
  }
  await logAudit(context, {
    action: "ai.openai.activated", entity: "secret", entityId: `openai_chatgpt_account_${id}`,
    actor: trustedActorAuditIdentity(actorContext.actor), after: { active: true },
  });
  return NextResponse.json({ ok: true });
}, "POST /api/ai/openai/accounts/[id]/activate");
