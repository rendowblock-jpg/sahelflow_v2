import { NextResponse, type NextRequest } from "next/server";
import { OpenAiProviderError, openAiErrorMessage, type OpenAiLocale, type OpenAiProviderErrorCode } from "./errors";

export function requestLocale(req: NextRequest): OpenAiLocale {
  const raw = req.cookies.get("sahelflow-locale")?.value;
  return raw === "ar" || raw === "en" || raw === "fr" ? raw : "fr";
}

// 401 is avoided on purpose: the app treats it as "your session ended".
const STATUS: Record<OpenAiProviderErrorCode, number> = {
  OPENAI_REQUEST_INVALID: 400, OPENAI_CONSENT_DECLINED: 409, OPENAI_ADMISSION_FAILED: 409, OPENAI_PLAN_NOT_ELIGIBLE: 409,
  OPENAI_SESSION_REVOKED: 409, OPENAI_TOKEN_EXPIRED: 409, OPENAI_MODEL_UNAVAILABLE: 409, OPENAI_QUOTA_EXHAUSTED: 429,
  OPENAI_TIMEOUT: 504, OPENAI_NETWORK_ERROR: 502, OPENAI_PROVIDER_UNAVAILABLE: 502,
};

/** Our own localized sentence for a provider error, never the provider's text. Other errors go to withErrorHandler. */
export function openAiFailure(error: unknown, locale: OpenAiLocale): NextResponse {
  if (!(error instanceof OpenAiProviderError)) throw error;
  return NextResponse.json(
    { ok: false, code: error.code, error: openAiErrorMessage(error, locale), ...(error.usageLinkHint ? { usageUrl: error.usageLinkHint } : {}) },
    { status: STATUS[error.code] },
  );
}

export const invalidRequest = (locale: OpenAiLocale) => openAiFailure(new OpenAiProviderError("OPENAI_REQUEST_INVALID", "invalid"), locale);

/** "12" -> 12; anything else -> null. */
export function parseAccountId(raw: string | null | undefined): number | null {
  return raw && /^[1-9]\d{0,8}$/.test(raw) ? Number(raw) : null;
}
