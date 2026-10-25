import { NextRequest, NextResponse } from "next/server";
import { revokeRefreshToken } from "@/lib/ai/providers/openai-chatgpt/tokens";
import { getOpenAiRuntime } from "@/lib/ai/providers/openai-chatgpt/runtime";
import { invalidRequest, openAiFailure, parseAccountId, requestLocale } from "@/lib/ai/providers/openai-chatgpt/route-support";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { logAudit } from "@/lib/audit";
import { requireAuth, requireRecentReauthentication } from "@/lib/auth/server";
import { trustedActorAuditIdentity } from "@/lib/identity/authorization";

export const dynamic = "force-dynamic";

/** DELETE /api/ai/openai/accounts/:id: sign out. Revokes at OpenAI when it can, and always deletes the local credentials. */
export const DELETE = withErrorHandler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const actorContext = await requireAuth("integrations.manage");
  await requireRecentReauthentication();
  const locale = requestLocale(req);
  const id = parseAccountId((await ctx.params).id);
  if (id === null) return invalidRequest(locale);
  const { store, context } = getOpenAiRuntime();
  let revokedRemotely = false;
  try {
    ({ revokedRemotely } = await store.signOut(id, (input) => revokeRefreshToken({}, input)));
  } catch {
    // The remote end did not confirm; the local delete below still runs.
  }
  try {
    await store.forget(id);
  } catch (error) {
    return openAiFailure(error, locale);
  }
  await logAudit(context, {
    action: "ai.openai.signed_out", entity: "secret", entityId: `openai_chatgpt_account_${id}`,
    actor: trustedActorAuditIdentity(actorContext.actor), before: { signedIn: true }, after: { signedIn: false },
    metadata: { revokedRemotely },
  });
  return NextResponse.json({ ok: true, revokedRemotely });
}, "DELETE /api/ai/openai/accounts/[id]");
