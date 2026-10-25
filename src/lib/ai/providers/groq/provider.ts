import "server-only";

import { logger } from "@/lib/logger";
import { DEFAULT_GROQ_MODEL } from "./catalog";

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
// Same ceiling as requestGemini.
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RETRY_DELAY_MS = 600;
const SECRET_PLACEHOLDER = "[redacted]";
const GROQ_KEY_SHAPE = /\bgsk_[A-Za-z0-9]{20,}/g;
const MIN_SCRUBBED_KEY_LENGTH = 8;

export type GroqProviderErrorCode =
  | "GROQ_KEY_INVALID"
  | "GROQ_PERMISSION_DENIED"
  | "GROQ_QUOTA_EXHAUSTED"
  | "GROQ_MODEL_UNAVAILABLE"
  | "GROQ_REQUEST_INVALID"
  | "GROQ_TIMEOUT"
  | "GROQ_NETWORK_ERROR"
  | "GROQ_PROVIDER_UNAVAILABLE";

export class GroqProviderError extends Error {
  constructor(
    public readonly code: GroqProviderErrorCode,
    message: string,
    public readonly status?: number,
    /** Seconds until the limit resets (429 only); null when Groq did not say. */
    public readonly retryAfterSeconds?: number | null,
  ) {
    super(message);
    this.name = "GroqProviderError";
  }
}

/** Remove the key, and anything shaped like one, from text that may be thrown, shown or logged. */
export function scrubGroqSecrets(text: string, apiKey?: string): string {
  let scrubbed = text;
  const key = apiKey?.trim() ?? "";
  if (key.length >= MIN_SCRUBBED_KEY_LENGTH) {
    scrubbed = scrubbed.split(key).join(SECRET_PLACEHOLDER);
  }
  return scrubbed.replace(GROQ_KEY_SHAPE, SECRET_PLACEHOLDER);
}

/** Groq durations: "7.66s", "2m59.56s", "1h2m3s", "250ms", or plain seconds. Returns seconds. */
export function parseGroqDuration(text: string | null | undefined): number | null {
  const value = text?.trim();
  if (!value) return null;
  if (/^\d+(?:\.\d+)?$/.test(value)) return Number(value);
  const match = /^(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m(?!s))?(?:(\d+(?:\.\d+)?)s)?(?:(\d+(?:\.\d+)?)ms)?$/.exec(value);
  if (!match || match.slice(1).every((part) => part === undefined)) return null;
  const [, h, m, s, ms] = match;
  return Number(h ?? 0) * 3600 + Number(m ?? 0) * 60 + Number(s ?? 0) + Number(ms ?? 0) / 1000;
}

export interface GroqRateLimitInfo {
  limitRequests?: number;
  remainingRequests?: number;
  remainingTokens?: number;
  resetRequestsSeconds?: number;
  resetTokensSeconds?: number;
}

function intHeader(headers: Headers, name: string): number | undefined {
  const value = headers.get(name);
  if (value === null || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function durationHeader(headers: Headers, name: string): number | undefined {
  return parseGroqDuration(headers.get(name)) ?? undefined;
}

export function readGroqRateLimit(headers: Headers): GroqRateLimitInfo {
  const info: GroqRateLimitInfo = {
    limitRequests: intHeader(headers, "x-ratelimit-limit-requests"),
    remainingRequests: intHeader(headers, "x-ratelimit-remaining-requests"),
    remainingTokens: intHeader(headers, "x-ratelimit-remaining-tokens"),
    resetRequestsSeconds: durationHeader(headers, "x-ratelimit-reset-requests"),
    resetTokensSeconds: durationHeader(headers, "x-ratelimit-reset-tokens"),
  };
  return Object.fromEntries(Object.entries(info).filter(([, v]) => v !== undefined)) as GroqRateLimitInfo;
}

/**
 * Seconds to wait after a 429: the retry-after header first; else the reset
 * of the bucket that is empty (the later one if both are); else the nearest
 * reset; else null (the caller then uses its default pause).
 */
export function groqRetryAfterSeconds(headers: Headers): number | null {
  const direct = durationHeader(headers, "retry-after");
  if (direct !== undefined) return Math.ceil(direct);
  const info = readGroqRateLimit(headers);
  const exhausted = [
    info.remainingRequests === 0 ? info.resetRequestsSeconds : undefined,
    info.remainingTokens === 0 ? info.resetTokensSeconds : undefined,
  ].filter((v): v is number => v !== undefined);
  if (exhausted.length) return Math.ceil(Math.max(...exhausted));
  const resets = [info.resetRequestsSeconds, info.resetTokensSeconds].filter((v): v is number => v !== undefined);
  return resets.length ? Math.ceil(Math.min(...resets)) : null;
}

type GroqErrorBody = { error?: { message?: string; type?: string; code?: string } };

function errorFromResponse(response: Response, body: GroqErrorBody, apiKey: string): GroqProviderError {
  const status = response.status;
  const message = scrubGroqSecrets(body.error?.message?.trim() || `Groq HTTP ${status}`, apiKey);
  const make = (code: GroqProviderErrorCode, retry?: number | null) =>
    new GroqProviderError(code, message, status, retry);
  if (status === 401) return make("GROQ_KEY_INVALID");
  if (status === 403) return make("GROQ_PERMISSION_DENIED");
  if (status === 404) return make("GROQ_MODEL_UNAVAILABLE");
  if (status === 429) return make("GROQ_QUOTA_EXHAUSTED", groqRetryAfterSeconds(response.headers));
  if (status >= 500 || status === 408) return make("GROQ_PROVIDER_UNAVAILABLE");
  return make("GROQ_REQUEST_INVALID");
}

async function fetchOnce(apiKey: string, body: unknown, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(GROQ_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey.trim()}` },
      signal: controller.signal,
      body: JSON.stringify(body),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new GroqProviderError("GROQ_TIMEOUT", "Groq request timed out.");
    }
    throw new GroqProviderError(
      "GROQ_NETWORK_ERROR",
      error instanceof Error ? scrubGroqSecrets(error.message, apiKey) : "Groq network request failed.",
    );
  } finally {
    clearTimeout(timeout);
  }
}

export interface GroqChatCompletion {
  choices?: Array<{ message?: { content?: string | null }; finish_reason?: string }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

export interface GroqRequestOptions {
  /** Chat-completions body; `model` is set from `model` below. */
  body: Record<string, unknown>;
  model?: string;
  timeoutMs?: number;
  /** Pause before the single retry of a 5xx or network failure. */
  retryDelayMs?: number;
}

/**
 * One chat-completions call. A 429 is never retried (a retry burns quota);
 * a 5xx or network failure is retried once. The key only travels in the
 * Authorization header and never reaches an error, a log line or a URL.
 */
export async function requestGroq(
  apiKey: string,
  options: GroqRequestOptions,
): Promise<{ data: GroqChatCompletion; model: string; rateLimit: GroqRateLimitInfo }> {
  const model = options.model ?? DEFAULT_GROQ_MODEL;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const body = { ...options.body, model };

  for (let attempt = 0; ; attempt += 1) {
    const startedAt = Date.now();
    let response: Response;
    try {
      response = await fetchOnce(apiKey, body, timeoutMs);
    } catch (error) {
      if (!(error instanceof GroqProviderError)) throw error;
      logger.warn("ai.groq.request_failed", { model, attempt: attempt + 1, durationMs: Date.now() - startedAt, code: error.code });
      if (error.code === "GROQ_NETWORK_ERROR" && attempt === 0) {
        await sleep(retryDelayMs);
        continue;
      }
      throw error;
    }

    if (response.ok) {
      let data: GroqChatCompletion;
      try {
        data = (await response.json()) as GroqChatCompletion;
      } catch {
        throw new GroqProviderError("GROQ_PROVIDER_UNAVAILABLE", "Groq answered without JSON.", response.status);
      }
      logger.debug("ai.groq.request_ok", { model, attempt: attempt + 1, durationMs: Date.now() - startedAt });
      return { data, model, rateLimit: readGroqRateLimit(response.headers) };
    }

    const errorBody = (await response.json().catch(() => ({}))) as GroqErrorBody;
    const error = errorFromResponse(response, errorBody, apiKey);
    logger.warn("ai.groq.request_rejected", {
      model, attempt: attempt + 1, durationMs: Date.now() - startedAt, status: response.status, code: error.code,
    });
    if (error.code === "GROQ_PROVIDER_UNAVAILABLE" && attempt === 0) {
      await sleep(retryDelayMs);
      continue;
    }
    throw error;
  }
}

const GROQ_MODELS_ENDPOINT = "https://api.groq.com/openai/v1/models";
const VERIFY_TIMEOUT_MS = 10_000;

export type GroqKeyVerification =
  | { ok: true; model?: string }
  | { ok: false; code: GroqProviderErrorCode; retryAfterSeconds?: number | null };

/**
 * Settings "test my key": lists the models the key can use. Listing does not
 * spend generation quota. A 401, 403 or 429 is final (retrying only burns the
 * limit); a 5xx is retried once. The key never reaches a result or a log line.
 */
export async function verifyGroqKey(
  rawKey: string,
  options: { timeoutMs?: number; retryDelayMs?: number } = {},
): Promise<GroqKeyVerification> {
  const apiKey = rawKey.trim();
  if (!apiKey) return { ok: false, code: "GROQ_KEY_INVALID" };
  const timeoutMs = options.timeoutMs ?? VERIFY_TIMEOUT_MS;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;

  for (let attempt = 0; ; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetch(GROQ_MODELS_ENDPOINT, {
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
      });
    } catch (error) {
      const aborted = error instanceof Error && error.name === "AbortError";
      logger.warn("ai.groq.verify_failed", { code: aborted ? "GROQ_TIMEOUT" : "GROQ_NETWORK_ERROR" });
      return { ok: false, code: aborted ? "GROQ_TIMEOUT" : "GROQ_NETWORK_ERROR" };
    } finally {
      clearTimeout(timeout);
    }

    if (response.ok) {
      const body = (await response.json().catch(() => ({}))) as { data?: Array<{ id?: unknown }> };
      const listed = Array.isArray(body.data) && body.data.some((entry) => entry?.id === DEFAULT_GROQ_MODEL);
      logger.debug("ai.groq.verify_ok", { listedDefault: listed });
      return listed ? { ok: true, model: DEFAULT_GROQ_MODEL } : { ok: true };
    }

    const errorBody = (await response.json().catch(() => ({}))) as GroqErrorBody;
    const error = errorFromResponse(response, errorBody, apiKey);
    logger.warn("ai.groq.verify_rejected", { status: response.status, code: error.code });
    if (error.code === "GROQ_PROVIDER_UNAVAILABLE" && attempt === 0) {
      await sleep(retryDelayMs);
      continue;
    }
    return error.code === "GROQ_QUOTA_EXHAUSTED"
      ? { ok: false, code: error.code, retryAfterSeconds: error.retryAfterSeconds ?? null }
      : { ok: false, code: error.code };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type Locale = "fr" | "ar" | "en";

const ERROR_COPY: Record<Locale, Record<GroqProviderErrorCode, string>> = {
  fr: {
    GROQ_KEY_INVALID: "La clé Groq est invalide.",
    GROQ_PERMISSION_DENIED: "La clé Groq n'a pas l'autorisation requise.",
    GROQ_QUOTA_EXHAUSTED: "La limite par minute ou par jour du plan gratuit Groq est atteinte.",
    GROQ_MODEL_UNAVAILABLE: "Le modèle Groq demandé n'est pas disponible.",
    GROQ_REQUEST_INVALID: "La requête Groq a été refusée comme invalide.",
    GROQ_TIMEOUT: "Groq n'a pas répondu dans le délai attendu.",
    GROQ_NETWORK_ERROR: "Impossible de joindre Groq. Vérifiez la connexion.",
    GROQ_PROVIDER_UNAVAILABLE: "Groq est temporairement indisponible.",
  },
  ar: {
    GROQ_KEY_INVALID: "مفتاح Groq غير صالح.",
    GROQ_PERMISSION_DENIED: "مفتاح Groq لا يملك الصلاحيات المطلوبة.",
    GROQ_QUOTA_EXHAUSTED: "تم بلوغ الحد اليومي أو الدقيقي للخطة المجانية في Groq.",
    GROQ_MODEL_UNAVAILABLE: "نموذج Groq المطلوب غير متاح.",
    GROQ_REQUEST_INVALID: "رفض Groq الطلب لأنه غير صالح.",
    GROQ_TIMEOUT: "لم يستجب Groq ضمن المهلة المتوقعة.",
    GROQ_NETWORK_ERROR: "تعذر الاتصال بـ Groq. تحقق من الاتصال.",
    GROQ_PROVIDER_UNAVAILABLE: "Groq غير متاح مؤقتًا.",
  },
  en: {
    GROQ_KEY_INVALID: "The Groq key is invalid.",
    GROQ_PERMISSION_DENIED: "The Groq key does not have the required permission.",
    GROQ_QUOTA_EXHAUSTED: "The daily or per-minute limit of the free Groq plan was reached.",
    GROQ_MODEL_UNAVAILABLE: "The requested Groq model is not available.",
    GROQ_REQUEST_INVALID: "Groq rejected the request as invalid.",
    GROQ_TIMEOUT: "Groq did not respond within the expected timeout.",
    GROQ_NETWORK_ERROR: "Groq could not be reached. Check the connection.",
    GROQ_PROVIDER_UNAVAILABLE: "Groq is temporarily unavailable.",
  },
};

const RESET_COPY: Record<Locale, { soon: string; minutes: (n: number) => string; hours: (n: number) => string }> = {
  fr: { soon: "Réinitialisation dans moins d'une minute.", minutes: (n) => `Réinitialisation dans environ ${n} min.`, hours: (n) => `Réinitialisation dans environ ${n} h.` },
  ar: { soon: "يتجدد الحد خلال أقل من دقيقة.", minutes: (n) => `يتجدد الحد بعد حوالي ${n} دقيقة.`, hours: (n) => `يتجدد الحد بعد حوالي ${n} ساعة.` },
  en: { soon: "It resets in less than a minute.", minutes: (n) => `It resets in about ${n} min.`, hours: (n) => `It resets in about ${n} h.` },
};

export function groqErrorMessage(error: unknown, locale: Locale = "fr"): string {
  if (!(error instanceof GroqProviderError)) return ERROR_COPY[locale].GROQ_PROVIDER_UNAVAILABLE;
  const base = ERROR_COPY[locale][error.code];
  const seconds = error.retryAfterSeconds;
  if (error.code !== "GROQ_QUOTA_EXHAUSTED" || seconds == null || !(seconds > 0)) return base;
  const copy = RESET_COPY[locale];
  if (seconds < 60) return `${base} ${copy.soon}`;
  const minutes = Math.ceil(seconds / 60);
  return `${base} ${minutes < 120 ? copy.minutes(minutes) : copy.hours(Math.ceil(minutes / 60))}`;
}
