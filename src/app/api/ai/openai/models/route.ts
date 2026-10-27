import { NextRequest, NextResponse } from "next/server";
import { OpenAiProviderError } from "@/lib/ai/providers/openai-chatgpt/errors";
import { listOpenAiModels } from "@/lib/ai/providers/openai-chatgpt/responses";
import { getOpenAiRuntime } from "@/lib/ai/providers/openai-chatgpt/runtime";
import { invalidRequest, openAiFailure, parseAccountId, requestLocale } from "@/lib/ai/providers/openai-chatgpt/route-support";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth, requireRecentReauthentication } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/** GET /api/ai/openai/models[?account=ID]: the models this ChatGPT account lists (visibility "list"), with a refreshed token. */
export const GET = withErrorHandler(async (req: NextRequest) => {
  await requireAuth("integrations.manage");
  await requireRecentReauthentication();
  const locale = requestLocale(req);
  const raw = req.nextUrl.searchParams.get("account");
  const asked = raw === null ? undefined : parseAccountId(raw);
  if (asked === null) return invalidRequest(locale);
  const { store, accessToken } = getOpenAiRuntime();
  try {
    const id = asked ?? (await store.getActive())?.id;
    if (id === undefined) throw new OpenAiProviderError("OPENAI_SESSION_REVOKED", "No ChatGPT account is signed in");
    return NextResponse.json({ ok: true, models: await listOpenAiModels(await accessToken(id)) });
  } catch (error) {
    return openAiFailure(error, locale);
  }
}, "GET /api/ai/openai/models");
