import { NextRequest, NextResponse } from "next/server";
import { OpenAiProviderError, openAiErrorMessage } from "@/lib/ai/providers/openai-chatgpt/errors";
import { getOpenAiRuntime } from "@/lib/ai/providers/openai-chatgpt/runtime";
import { invalidRequest, requestLocale } from "@/lib/ai/providers/openai-chatgpt/route-support";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth, requireRecentReauthentication } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/** GET /api/ai/openai/sign-in/status?attempt=ID: pending, done (safe summary) or failed (code and our own sentence). */
export const GET = withErrorHandler(async (req: NextRequest) => {
  await requireAuth("integrations.manage");
  await requireRecentReauthentication();
  const locale = requestLocale(req);
  const attempt = req.nextUrl.searchParams.get("attempt") ?? "";
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(attempt)) return invalidRequest(locale);
  const status = getOpenAiRuntime().signIn.getSignInStatus(attempt);
  if (!status) return invalidRequest(locale);
  if (status.state === "failed") {
    return NextResponse.json({ ok: true, ...status, error: openAiErrorMessage(new OpenAiProviderError(status.code, "failed"), locale) });
  }
  return NextResponse.json({ ok: true, ...status });
}, "GET /api/ai/openai/sign-in/status");
