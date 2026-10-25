/**
 * Errors for the "Sign in with ChatGPT" engine: stable codes, the mapping from
 * OpenAI answers, scrubbing, and plain fr/ar/en messages.
 */

export const OPENAI_ERROR_CODES = [
  "OPENAI_CONSENT_DECLINED",
  "OPENAI_ADMISSION_FAILED",
  "OPENAI_PLAN_NOT_ELIGIBLE",
  "OPENAI_SESSION_REVOKED",
  "OPENAI_TOKEN_EXPIRED",
  "OPENAI_QUOTA_EXHAUSTED",
  "OPENAI_MODEL_UNAVAILABLE",
  "OPENAI_REQUEST_INVALID",
  "OPENAI_TIMEOUT",
  "OPENAI_NETWORK_ERROR",
  "OPENAI_PROVIDER_UNAVAILABLE",
] as const;
export type OpenAiProviderErrorCode = (typeof OPENAI_ERROR_CODES)[number];
export type OpenAiLocale = "fr" | "ar" | "en";

/** Where the seller sees and manages what apps may use of the ChatGPT plan. */
export const OPENAI_USAGE_URL = "https://chatgpt.com/settings/usage";

export interface OpenAiErrorDetails {
  status?: number;
  /** Quota only: seconds until the limit resets; null when OpenAI did not say. */
  retryAfterSeconds?: number | null;
  requestId?: string;
  /** OpenAI's own error.code, kept for support; never shown as the message. */
  upstreamCode?: string;
  param?: string;
  usageLinkHint?: string;
  /** Internal: the caller may try once more (connection failure, 502/503/504). */
  retryable?: boolean;
}

export class OpenAiProviderError extends Error {
  readonly status?: number;
  readonly retryAfterSeconds?: number | null;
  readonly requestId?: string;
  readonly upstreamCode?: string;
  readonly param?: string;
  /** Quota only: link the UI can offer so the seller can check the plan usage. */
  readonly usageLinkHint?: string;
  readonly retryable: boolean;
  constructor(public readonly code: OpenAiProviderErrorCode, message: string, details: OpenAiErrorDetails = {}) {
    super(message);
    this.name = "OpenAiProviderError";
    this.status = details.status;
    this.retryAfterSeconds = details.retryAfterSeconds;
    this.requestId = details.requestId;
    this.upstreamCode = details.upstreamCode;
    this.param = details.param;
    this.usageLinkHint = details.usageLinkHint ?? (code === "OPENAI_QUOTA_EXHAUSTED" ? OPENAI_USAGE_URL : undefined);
    this.retryable = details.retryable === true;
  }
}

const PLACEHOLDER = "[redacted]";
const MIN_KNOWN_SECRET_LENGTH = 6;
const JWT_SHAPE = /\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}(?:\.[A-Za-z0-9_-]*)?/g;
const BEARER_VALUE = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
// Refresh tokens have no documented shape, so name the field that carries one.
const TOKEN_FIELD = /\b(refresh_token|access_token|id_token_hint|id_token|code_verifier|client_secret)(["']?\s*[:=]\s*["']?)[^\s"'&,}]+/gi;

/** Remove tokens (JWT shape, bearer values, token fields, and any value you pass) from text that may be thrown or logged. */
export function scrubOpenAiSecrets(text: string, ...knownSecrets: Array<string | null | undefined>): string {
  let out = text;
  for (const secret of knownSecrets) {
    const value = secret?.trim() ?? "";
    if (value.length >= MIN_KNOWN_SECRET_LENGTH) out = out.split(value).join(PLACEHOLDER);
  }
  return out
    .replace(TOKEN_FIELD, (_m, name: string, glue: string) => `${name}${glue}${PLACEHOLDER}`)
    .replace(BEARER_VALUE, `Bearer ${PLACEHOLDER}`)
    .replace(JWT_SHAPE, PLACEHOLDER);
}

/**
 * Only an expired or revoked session may send the user through OAuth again.
 * A plan that is not eligible, a usage limit or a refused request never does:
 * the docs forbid looping through OAuth on them.
 */
export function shouldRerunOAuth(error: unknown): boolean {
  return error instanceof OpenAiProviderError && error.code === "OPENAI_SESSION_REVOKED";
}

/** retry-after: seconds, or an HTTP date. */
export function parseRetryAfter(value: string | null | undefined, now: () => number = Date.now): number | null {
  const text = value?.trim();
  if (!text) return null;
  if (/^\d+(?:\.\d+)?$/.test(text)) return Math.ceil(Number(text));
  const at = Date.parse(text);
  return Number.isNaN(at) ? null : Math.max(0, Math.ceil((at - now()) / 1000));
}

const CODE_MAP: Record<string, OpenAiProviderErrorCode> = {
  subscription_sharing_user_not_eligible: "OPENAI_PLAN_NOT_ELIGIBLE",
  subscription_sharing_route_not_supported: "OPENAI_ADMISSION_FAILED",
  chatpass_v2_scope_not_authorized: "OPENAI_ADMISSION_FAILED",
  chatpass_v2_invalid_authorization_context: "OPENAI_ADMISSION_FAILED",
  subscription_sharing_usage_limit_exceeded: "OPENAI_QUOTA_EXHAUSTED",
  subscription_sharing_usage_unavailable: "OPENAI_PROVIDER_UNAVAILABLE",
  subscription_sharing_user_unavailable: "OPENAI_PROVIDER_UNAVAILABLE",
  subscription_sharing_unsupported_capability: "OPENAI_REQUEST_INVALID",
  subscription_sharing_invalid_user: "OPENAI_TOKEN_EXPIRED",
  model_not_found: "OPENAI_MODEL_UNAVAILABLE",
};

function codeFromStatus(status: number | undefined): OpenAiProviderErrorCode {
  if (status === 401) return "OPENAI_TOKEN_EXPIRED";
  if (status === 403) return "OPENAI_ADMISSION_FAILED";
  if (status === 404) return "OPENAI_MODEL_UNAVAILABLE";
  if (status === 429) return "OPENAI_QUOTA_EXHAUSTED";
  if (status === undefined || status >= 500 || status === 408) return "OPENAI_PROVIDER_UNAVAILABLE";
  return "OPENAI_REQUEST_INVALID";
}

/** An error object from a Responses answer or a response.failed event. */
export function errorFromErrorObject(
  error: { code?: unknown; message?: unknown; param?: unknown } | null | undefined,
  context: { status?: number; headers?: Headers; secrets?: Array<string | undefined>; fallbackMessage?: string; now?: () => number } = {},
): OpenAiProviderError {
  const upstreamCode = typeof error?.code === "string" ? error.code : undefined;
  const code = (upstreamCode && CODE_MAP[upstreamCode]) || codeFromStatus(context.status);
  const raw = typeof error?.message === "string" && error.message.trim() ? error.message.trim() : context.fallbackMessage ?? "OpenAI request failed";
  return new OpenAiProviderError(code, scrubOpenAiSecrets(raw, ...(context.secrets ?? [])), {
    status: context.status,
    upstreamCode,
    param: typeof error?.param === "string" ? error.param : undefined,
    requestId: context.headers?.get("x-request-id") ?? undefined,
    // The plan usage limit gives no reset time (an app-specific weekly cap can apply), so none is taken from it.
    retryAfterSeconds: code !== "OPENAI_QUOTA_EXHAUSTED" ? undefined
      : upstreamCode === "subscription_sharing_usage_limit_exceeded" ? null
        : parseRetryAfter(context.headers?.get("retry-after"), context.now),
    retryable: context.status === 502 || context.status === 503 || context.status === 504 ? code === "OPENAI_PROVIDER_UNAVAILABLE" : false,
  });
}

/**
 * A failed HTTP answer. Not every failure has the standard `error` object:
 * direct admission can answer `{"detail": "..."}`, which is diagnostic text only.
 */
export function errorFromOpenAiResponse(
  status: number, bodyText: string, headers: Headers, secrets: Array<string | undefined> = [], now?: () => number,
): OpenAiProviderError {
  type Body = { error?: unknown; detail?: unknown };
  let parsed: Body | null;
  try { parsed = JSON.parse(bodyText) as Body | null; } catch { parsed = null; }
  const errorField = parsed?.error;
  const errorObject = errorField && typeof errorField === "object"
    ? (errorField as { code?: unknown; message?: unknown; param?: unknown })
    : { message: typeof parsed?.detail === "string" ? parsed.detail : undefined };
  return errorFromErrorObject(errorObject, { status, headers, secrets, fallbackMessage: `OpenAI HTTP ${status}`, now });
}

const COPY: Record<OpenAiLocale, Record<OpenAiProviderErrorCode, string>> = {
  fr: {
    OPENAI_CONSENT_DECLINED: "L'utilisation de votre forfait ChatGPT n'est pas autorisée. Autorisez-la dans les réglages pour continuer.",
    OPENAI_ADMISSION_FAILED: "ChatGPT n'a pas accepté cette connexion. Vérifiez le compte choisi puis reconnectez-vous.",
    OPENAI_PLAN_NOT_ELIGIBLE: "Votre forfait ChatGPT ne peut pas être utilisé par cette application. Utilisez plutôt une clé Groq gratuite.",
    OPENAI_SESSION_REVOKED: "La session ChatGPT n'est plus valable. Connectez-vous de nouveau avec ChatGPT.",
    OPENAI_TOKEN_EXPIRED: "La connexion ChatGPT a expiré. Si cela continue, connectez-vous de nouveau avec ChatGPT.",
    OPENAI_QUOTA_EXHAUSTED: "La limite d'utilisation de votre forfait ChatGPT est atteinte.",
    OPENAI_MODEL_UNAVAILABLE: "Le modèle ChatGPT demandé n'est pas disponible pour ce compte.",
    OPENAI_REQUEST_INVALID: "ChatGPT a refusé la demande car elle est invalide.",
    OPENAI_TIMEOUT: "ChatGPT n'a pas répondu dans le délai prévu.",
    OPENAI_NETWORK_ERROR: "Impossible de joindre ChatGPT. Vérifiez la connexion.",
    OPENAI_PROVIDER_UNAVAILABLE: "ChatGPT est temporairement indisponible.",
  },
  ar: {
    OPENAI_CONSENT_DECLINED: "استخدام خطة ChatGPT الخاصة بك غير مسموح به. فعّله من الإعدادات للمتابعة.",
    OPENAI_ADMISSION_FAILED: "لم يقبل ChatGPT هذا الاتصال. تحقق من الحساب المختار ثم سجّل الدخول من جديد.",
    OPENAI_PLAN_NOT_ELIGIBLE: "لا يمكن استخدام خطة ChatGPT الخاصة بك في هذا التطبيق. استخدم مفتاح Groq المجاني بدلاً من ذلك.",
    OPENAI_SESSION_REVOKED: "جلسة ChatGPT لم تعد صالحة. سجّل الدخول بواسطة ChatGPT من جديد.",
    OPENAI_TOKEN_EXPIRED: "انتهت صلاحية اتصال ChatGPT. إذا استمر ذلك سجّل الدخول بواسطة ChatGPT من جديد.",
    OPENAI_QUOTA_EXHAUSTED: "تم بلوغ حد استخدام خطة ChatGPT الخاصة بك.",
    OPENAI_MODEL_UNAVAILABLE: "نموذج ChatGPT المطلوب غير متاح لهذا الحساب.",
    OPENAI_REQUEST_INVALID: "رفض ChatGPT الطلب لأنه غير صالح.",
    OPENAI_TIMEOUT: "لم يستجب ChatGPT ضمن المهلة المتوقعة.",
    OPENAI_NETWORK_ERROR: "تعذر الاتصال بـ ChatGPT. تحقق من الاتصال.",
    OPENAI_PROVIDER_UNAVAILABLE: "ChatGPT غير متاح مؤقتًا.",
  },
  en: {
    OPENAI_CONSENT_DECLINED: "Using your ChatGPT plan is not allowed yet. Turn it on in settings to continue.",
    OPENAI_ADMISSION_FAILED: "ChatGPT did not accept this connection. Check the chosen account, then sign in again.",
    OPENAI_PLAN_NOT_ELIGIBLE: "Your ChatGPT plan cannot be used by this app. Use a free Groq key instead.",
    OPENAI_SESSION_REVOKED: "Your ChatGPT session is no longer valid. Sign in with ChatGPT again.",
    OPENAI_TOKEN_EXPIRED: "The ChatGPT connection expired. If this keeps happening, sign in with ChatGPT again.",
    OPENAI_QUOTA_EXHAUSTED: "The usage limit of your ChatGPT plan was reached.",
    OPENAI_MODEL_UNAVAILABLE: "The requested ChatGPT model is not available for this account.",
    OPENAI_REQUEST_INVALID: "ChatGPT rejected the request as invalid.",
    OPENAI_TIMEOUT: "ChatGPT did not respond within the expected time.",
    OPENAI_NETWORK_ERROR: "ChatGPT could not be reached. Check the connection.",
    OPENAI_PROVIDER_UNAVAILABLE: "ChatGPT is temporarily unavailable.",
  },
};

const RESET: Record<OpenAiLocale, { soon: string; minutes: (n: number) => string; hours: (n: number) => string }> = {
  fr: { soon: "Réinitialisation dans moins d'une minute.", minutes: (n) => `Réinitialisation dans environ ${n} min.`, hours: (n) => `Réinitialisation dans environ ${n} h.` },
  ar: { soon: "يتجدد الحد خلال أقل من دقيقة.", minutes: (n) => `يتجدد الحد بعد حوالي ${n} دقيقة.`, hours: (n) => `يتجدد الحد بعد حوالي ${n} ساعة.` },
  en: { soon: "It resets in less than a minute.", minutes: (n) => `It resets in about ${n} min.`, hours: (n) => `It resets in about ${n} h.` },
};

export function openAiErrorMessage(error: unknown, locale: OpenAiLocale = "fr"): string {
  if (!(error instanceof OpenAiProviderError)) return COPY[locale].OPENAI_PROVIDER_UNAVAILABLE;
  const base = COPY[locale][error.code];
  const seconds = error.retryAfterSeconds;
  if (error.code !== "OPENAI_QUOTA_EXHAUSTED" || seconds == null || !(seconds > 0)) return base;
  if (seconds < 60) return `${base} ${RESET[locale].soon}`;
  const minutes = Math.ceil(seconds / 60);
  return `${base} ${minutes < 120 ? RESET[locale].minutes(minutes) : RESET[locale].hours(Math.ceil(minutes / 60))}`;
}
