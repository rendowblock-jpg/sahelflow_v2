import "server-only";

import { logger } from "@/lib/logger";

export const GEMINI_MODELS = [
  "gemini-3.5-flash",
  "gemini-3.6-flash",
] as const;
export type GeminiModel = (typeof GEMINI_MODELS)[number];

const GEMINI_API_ROOT =
  "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_TIMEOUT_MS = 30_000;
const TRANSIENT_STATUS = new Set([408, 429, 500, 502, 503, 504]);

export type GeminiProviderErrorCode =
  | "GEMINI_KEY_INVALID"
  | "GEMINI_PERMISSION_DENIED"
  | "GEMINI_QUOTA_EXHAUSTED"
  | "GEMINI_LOCATION_UNSUPPORTED"
  | "GEMINI_REGION_OR_BILLING_REQUIRED"
  | "GEMINI_MODEL_UNAVAILABLE"
  | "GEMINI_REQUEST_INVALID"
  | "GEMINI_TIMEOUT"
  | "GEMINI_NETWORK_ERROR"
  | "GEMINI_PROVIDER_UNAVAILABLE";

type GeminiErrorBody = {
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
};

export class GeminiProviderError extends Error {
  constructor(
    public readonly code: GeminiProviderErrorCode,
    message: string,
    public readonly status?: number,
    public readonly providerStatus?: string | null,
    public readonly transport?: GeminiTransportCause | null,
  ) {
    super(message);
    this.name = "GeminiProviderError";
  }
}

/**
 * PII-free named cause for a transport-level (no HTTP response) failure —
 * campaign row D1 round 3. Node/undici fetch wraps the real network error in
 * `TypeError: fetch failed` and moves the decisive code (DNS, TLS, connect,
 * reset) into `error.cause`. Installed evidence (Internal.32 campaign, D1):
 * the founder's browser probe authenticated the SAME AQ. key that this app's
 * server-side probe reported as HTTP n/a, so the transport layer must now
 * name its cause at the operator instead of discarding it.
 */
export type GeminiTransportCause = {
  name: string;
  code: string | null;
};

export type GeminiTransportClass =
  | "dns"
  | "tls"
  | "blocked"
  | "reset"
  | "timeout";

const DNS_CAUSE_PATTERN = /ENOTFOUND|EAI_AGAIN|ENOGETADDRINFO|ESERVFAIL/i;
const TLS_CAUSE_PATTERN =
  /CERT|SSL|TLS|UNABLE_TO_VERIFY_LEAF|SELF_SIGNED|CERTIFICATE/i;
const BLOCKED_CAUSE_PATTERN =
  /ECONNREFUSED|EACCES|EPERM|UND_ERR_CONNECT_TIMEOUT|ETIMEDOUT|HPE_|ENETUNREACH|EHOSTUNREACH/i;
const RESET_CAUSE_PATTERN = /ECONNRESET|UND_ERR_SOCKET|EPIPE|UND_ERR_ABORTED/i;

/** Classify a raw transport cause into a bounded, localizable family. */
export function classifyTransportCause(
  cause: GeminiTransportCause | null | undefined,
): GeminiTransportClass | null {
  if (!cause) return null;
  const haystack = `${cause.code ?? ""} ${cause.name}`;
  if (DNS_CAUSE_PATTERN.test(haystack)) return "dns";
  if (TLS_CAUSE_PATTERN.test(haystack)) return "tls";
  if (RESET_CAUSE_PATTERN.test(haystack)) return "reset";
  if (BLOCKED_CAUSE_PATTERN.test(haystack)) return "blocked";
  return null;
}

/**
 * Walk the fetch error's `cause` chain (bounded depth) and return the first
 * object carrying a usable name/code. Never includes message bodies — codes
 * and class names only, so the value is safe for UI, logs and evidence.
 */
export function describeTransportCause(
  error: unknown,
): GeminiTransportCause | null {
  let current: unknown = error;
  for (let depth = 0; depth < 3; depth += 1) {
    if (!current || typeof current !== "object") break;
    const candidate = current as { cause?: unknown; code?: unknown };
    const nested = candidate.cause;
    if (nested && typeof nested === "object") {
      const nestedCandidate = nested as { name?: unknown; code?: unknown };
      const name =
        typeof nestedCandidate.name === "string" ? nestedCandidate.name : "";
      const code =
        typeof nestedCandidate.code === "string" ? nestedCandidate.code : null;
      if (code || name) return { name: name || "Error", code };
      current = nested;
      continue;
    }
    break;
  }
  // No nested cause object: fall back to the error's own top-level identity.
  if (error instanceof Error) {
    const topLevel = error as Error & { code?: unknown };
    return {
      name: error.name,
      code: typeof topLevel.code === "string" ? topLevel.code : null,
    };
  }
  return null;
}

function providerError(
  status: number,
  body: GeminiErrorBody,
): GeminiProviderError {
  const providerStatus = body.error?.status;
  const message = body.error?.message?.trim() || `Gemini HTTP ${status}`;
  const withStatus = (
    code: GeminiProviderErrorCode,
  ): GeminiProviderError =>
    new GeminiProviderError(code, message, status, providerStatus ?? null);
  if (status === 403 || providerStatus === "PERMISSION_DENIED") {
    return withStatus("GEMINI_PERMISSION_DENIED");
  }
  // D1 round 3: a 401 UNAUTHENTICATED verdict IS the key verdict — Google
  // rejected the credential. Reporting it as "provider unavailable" sent the
  // Internal.32 campaign chasing the wrong layer.
  if (status === 401 || providerStatus === "UNAUTHENTICATED") {
    const keyInvalid = /api.?key|key not valid|invalid key|unauthenticated/i.test(
      message,
    );
    return withStatus(
      keyInvalid ? "GEMINI_KEY_INVALID" : "GEMINI_PERMISSION_DENIED",
    );
  }
  if (status === 429 || providerStatus === "RESOURCE_EXHAUSTED") {
    return withStatus("GEMINI_QUOTA_EXHAUSTED");
  }
  // Google refuses Gemini API use from countries/regions outside its
  // availability list (e.g. Algeria) with FAILED_PRECONDITION "User location
  // is not supported for the API use." That is a seller-location verdict —
  // auth already passed — and must not read as a key or billing problem.
  if (
    providerStatus === "FAILED_PRECONDITION" &&
    /location is not supported|not supported for the api use/i.test(message)
  ) {
    return withStatus("GEMINI_LOCATION_UNSUPPORTED");
  }
  if (providerStatus === "FAILED_PRECONDITION") {
    return withStatus("GEMINI_REGION_OR_BILLING_REQUIRED");
  }
  if (status === 404 || providerStatus === "NOT_FOUND") {
    return withStatus("GEMINI_MODEL_UNAVAILABLE");
  }
  if (status === 400 || providerStatus === "INVALID_ARGUMENT") {
    const keyInvalid = /api.?key|key not valid|invalid key/i.test(message);
    return withStatus(
      keyInvalid ? "GEMINI_KEY_INVALID" : "GEMINI_REQUEST_INVALID",
    );
  }
  return withStatus("GEMINI_PROVIDER_UNAVAILABLE");
}

/** Convert an error delivered inside a successful Gemini SSE response. */
export function geminiProviderErrorFromStream(
  error: NonNullable<GeminiErrorBody["error"]>,
): GeminiProviderError {
  const statusByName: Record<string, number> = {
    INVALID_ARGUMENT: 400,
    UNAUTHENTICATED: 401,
    PERMISSION_DENIED: 403,
    NOT_FOUND: 404,
    RESOURCE_EXHAUSTED: 429,
    INTERNAL: 500,
    UNAVAILABLE: 503,
    DEADLINE_EXCEEDED: 504,
  };
  const numericCode = error.code;
  const status =
    typeof numericCode === "number" &&
    Number.isSafeInteger(numericCode) &&
    numericCode >= 400
      ? numericCode
      : statusByName[error.status ?? ""] ?? 500;
  return providerError(status, { error });
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function geminiAuthUrl(url: string, apiKey: string): string {
  // Campaign row D1 (round 3): auth travels as the documented `?key=` query
  // parameter — the carriage Google's own quickstarts use — NOT the
  // `x-goog-api-key` header. Installed evidence: the Founder's browser
  // probe (models list with ?key=) succeeded with the SAME AQ. key that
  // this app's header-authenticated probe rejected as GEMINI_KEY_INVALID.
  // New-format "AQ." keys are the demonstrated failure class for the header
  // carriage on generativelanguage.googleapis.com; the parameter carriage
  // is universally accepted for both AIza and AQ. keys. The key never
  // reaches app logs: request logging records only model/attempt/status.
  // Trim here as well: keys stored before the save-boundary trim (or written
  // by an older build) must not travel with stray surrounding whitespace —
  // the provider's own verify path already trims, so the call path must
  // behave identically.
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}key=${encodeURIComponent(apiKey.trim())}`;
}

async function fetchAttempt(
  url: string,
  apiKey: string,
  body: unknown,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(geminiAuthUrl(url, apiKey), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify(body),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      // D1 round 3: the abort is our own timeout controller, so the named
      // transport class is "timeout" — surfaced verbatim in probe
      // diagnostics instead of collapsing into an anonymous HTTP n/a line.
      throw new GeminiProviderError(
        "GEMINI_TIMEOUT",
        "Gemini request timed out.",
        undefined,
        null,
        { name: "AbortError", code: "SAHELFLOW_TIMEOUT" },
      );
    }
    throw new GeminiProviderError(
      "GEMINI_NETWORK_ERROR",
      error instanceof Error ? error.message : "Gemini network request failed.",
      undefined,
      null,
      describeTransportCause(error),
    );
  } finally {
    clearTimeout(timeout);
  }
}

export interface GeminiRequestOptions {
  body: unknown;
  stream?: boolean;
  timeoutMs?: number;
  maxAttemptsPerModel?: number;
}

export async function requestGemini(
  apiKey: string,
  options: GeminiRequestOptions,
): Promise<{ response: Response; model: GeminiModel }> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const attempts = Math.max(1, options.maxAttemptsPerModel ?? 2);
  let lastError: GeminiProviderError | null = null;

  for (const model of GEMINI_MODELS) {
    const suffix = options.stream
      ? ":streamGenerateContent?alt=sse"
      : ":generateContent";
    const url = `${GEMINI_API_ROOT}/${model}${suffix}`;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      let response: Response;
      const startedAt = Date.now();
      try {
        response = await fetchAttempt(url, apiKey, options.body, timeoutMs);
      } catch (error) {
        if (!(error instanceof GeminiProviderError)) throw error;
        lastError = error;
        // Per-attempt diagnostics: the only installed-build evidence for why
        // a verify/extract failed. Never logs the key, headers or URL.
        logger.warn("ai.gemini.request_failed", {
          model,
          attempt: attempt + 1,
          durationMs: Date.now() - startedAt,
          code: error.code,
          transportCode: error.transport?.code ?? null,
        });
        if (
          (error.code === "GEMINI_TIMEOUT" ||
            error.code === "GEMINI_NETWORK_ERROR") &&
          attempt < attempts - 1
        ) {
          await sleep(500 * 2 ** attempt);
          continue;
        }
        break;
      }

      if (response.ok) {
        logger.debug("ai.gemini.request_ok", {
          model,
          attempt: attempt + 1,
          durationMs: Date.now() - startedAt,
        });
        return { response, model };
      }
      const errorBody = (await response
        .json()
        .catch(() => ({}))) as GeminiErrorBody;
      const error = providerError(response.status, errorBody);
      lastError = error;
      logger.warn("ai.gemini.request_rejected", {
        model,
        attempt: attempt + 1,
        durationMs: Date.now() - startedAt,
        status: response.status,
        code: error.code,
      });

      if (error.code === "GEMINI_MODEL_UNAVAILABLE") break;
      if (TRANSIENT_STATUS.has(response.status) && attempt < attempts - 1) {
        await sleep(750 * 2 ** attempt);
        continue;
      }
      if (
        error.code === "GEMINI_QUOTA_EXHAUSTED" ||
        error.code === "GEMINI_PROVIDER_UNAVAILABLE"
      ) {
        break;
      }
      throw error;
    }
  }

  throw (
    lastError ??
    new GeminiProviderError(
      "GEMINI_PROVIDER_UNAVAILABLE",
      "No supported Gemini model was available.",
    )
  );
}

const ERROR_COPY: Record<
  "fr" | "ar" | "en",
  Record<GeminiProviderErrorCode, string>
> = {
  fr: {
    GEMINI_KEY_INVALID: "La clé Gemini est invalide.",
    GEMINI_PERMISSION_DENIED:
      "La clé Gemini n'a pas l'autorisation requise.",
    GEMINI_QUOTA_EXHAUSTED:
      "Le quota Gemini est atteint. Réessayez après réinitialisation du quota.",
    GEMINI_LOCATION_UNSUPPORTED:
      "La clé est valide, mais Google n'autorise pas l'API Gemini depuis votre pays ou région actuels.",
    GEMINI_REGION_OR_BILLING_REQUIRED:
      "Gemini nécessite une configuration de région ou de facturation pour ce projet.",
    GEMINI_MODEL_UNAVAILABLE:
      "Aucun modèle Gemini de production pris en charge n'est disponible pour ce projet.",
    GEMINI_REQUEST_INVALID: "La requête Gemini a été refusée comme invalide.",
    GEMINI_TIMEOUT: "Gemini n'a pas répondu dans le délai attendu.",
    GEMINI_NETWORK_ERROR: "Impossible de joindre Gemini. Vérifiez la connexion.",
    GEMINI_PROVIDER_UNAVAILABLE: "Gemini est temporairement indisponible.",
  },
  ar: {
    GEMINI_KEY_INVALID: "مفتاح Gemini غير صالح.",
    GEMINI_PERMISSION_DENIED: "مفتاح Gemini لا يملك الصلاحيات المطلوبة.",
    GEMINI_QUOTA_EXHAUSTED: "تم استهلاك حصة Gemini. أعد المحاولة بعد تجدد الحصة.",
    GEMINI_LOCATION_UNSUPPORTED:
      "المفتاح صالح، لكن Google لا يسمح باستخدام واجهة Gemini من بلدك أو منطقتك الحالية.",
    GEMINI_REGION_OR_BILLING_REQUIRED: "يتطلب Gemini إعداد المنطقة أو الفوترة لهذا المشروع.",
    GEMINI_MODEL_UNAVAILABLE: "لا يوجد نموذج Gemini إنتاجي مدعوم متاح لهذا المشروع.",
    GEMINI_REQUEST_INVALID: "رفض Gemini الطلب لأنه غير صالح.",
    GEMINI_TIMEOUT: "لم يستجب Gemini ضمن المهلة المتوقعة.",
    GEMINI_NETWORK_ERROR: "تعذر الاتصال بـ Gemini. تحقق من الاتصال.",
    GEMINI_PROVIDER_UNAVAILABLE: "Gemini غير متاح مؤقتًا.",
  },
  en: {
    GEMINI_KEY_INVALID: "The Gemini key is invalid.",
    GEMINI_PERMISSION_DENIED: "The Gemini key does not have the required permission.",
    GEMINI_QUOTA_EXHAUSTED: "The Gemini quota is exhausted. Retry after the quota resets.",
    GEMINI_LOCATION_UNSUPPORTED:
      "The key is valid, but Google does not allow the Gemini API from your current country or region.",
    GEMINI_REGION_OR_BILLING_REQUIRED: "Gemini requires region or billing setup for this project.",
    GEMINI_MODEL_UNAVAILABLE: "No supported production Gemini model is available for this project.",
    GEMINI_REQUEST_INVALID: "Gemini rejected the request as invalid.",
    GEMINI_TIMEOUT: "Gemini did not respond within the expected timeout.",
    GEMINI_NETWORK_ERROR: "Gemini could not be reached. Check the connection.",
    GEMINI_PROVIDER_UNAVAILABLE: "Gemini is temporarily unavailable.",
  },
};

export function geminiErrorMessage(
  error: unknown,
  locale: "fr" | "ar" | "en" = "fr",
): string {
  if (error instanceof GeminiProviderError) {
    return ERROR_COPY[locale][error.code];
  }
  return ERROR_COPY[locale].GEMINI_PROVIDER_UNAVAILABLE;
}

type MinimalGeminiResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: {
    blockReason?: string;
  };
};

/** PII-free shape of a 200 response the probe could not verify by text. */
type GeminiResponseShape = {
  jsonParseFailed: boolean;
  candidatesCount: number | null;
  finishReason: string | null;
  blockReason: string | null;
};

/**
 * PII-free installed-build diagnostics for a failed key verification
 * (campaign row D1 round 2). The founder re-pasted a fresh key and the
 * probe still failed, so the route must return WHAT Google actually said
 * (HTTP status + provider status + sanitized reason) and the exact shape
 * of the received key, without ever carrying key material.
 */
export type GeminiProbeDiagnostics = {
  httpStatus?: number;
  providerStatus?: string | null;
  reason?: string | null;
  // D1 round 3: named transport cause for failures with no HTTP response
  // (the previous "HTTP n/a" dead end), plus a bounded localized family.
  transport?: GeminiTransportCause | null;
  transportClass?: GeminiTransportClass | null;
  // D1 round 3: truthful shape of an HTTP-200 body that produced no visible
  // text (the demonstrated Internal.32 failure: a thinking-model response
  // with finishReason MAX_TOKENS and an empty visible-parts list).
  responseShape?: GeminiResponseShape | null;
  keyShape: {
    prefix: string;
    length: number;
    hasWhitespace: boolean;
    hasNewline: boolean;
  };
};

const KEY_LIKE_FRAGMENT = /(?:AIza|AQ\.)[0-9A-Za-z_-]{8,}/g;

function sanitizedReason(message: string | undefined): string | null {
  if (!message) return null;
  const redacted = message.replace(KEY_LIKE_FRAGMENT, "[redacted]");
  return redacted.length > 160 ? `${redacted.slice(0, 157)}...` : redacted;
}

function probeDiagnostics(
  rawApiKey: string,
  error?: GeminiProviderError,
  responseShape?: GeminiResponseShape,
): GeminiProbeDiagnostics {
  const trimmed = rawApiKey.trim();
  const transport = error?.transport ?? null;
  return {
    httpStatus: error?.status,
    providerStatus: error?.providerStatus ?? null,
    reason: sanitizedReason(error?.message),
    transport,
    transportClass: classifyTransportCause(transport),
    responseShape: responseShape ?? null,
    keyShape: {
      prefix: trimmed.startsWith("AIza") ? "AIza" : trimmed.slice(0, 3),
      length: trimmed.length,
      hasWhitespace: /\s/.test(rawApiKey),
      hasNewline: /[\r\n]/.test(rawApiKey),
    },
  };
}

export async function verifyGeminiKey(
  apiKey: string,
  timeoutMs = 10_000,
): Promise<{
  ok: boolean;
  model?: GeminiModel;
  error?: string;
  code?: GeminiProviderErrorCode;
  diagnostics?: GeminiProbeDiagnostics;
}> {
  // Google AI Studio issues keys in two formats: the legacy "AIza…" project
  // keys and the newer "AQ." keys. Both travel the same ?key= query
  // parameter; the live probe below is the real validator (campaign row D1 —
  // the stale AIza-only gate rejected valid new-format keys before any
  // network activity, and the header carriage rejected the parameter-valid
  // AQ. keys at the auth layer).
  const candidateKey = apiKey.trim();
  const knownKeyFormat =
    candidateKey.startsWith("AIza") || candidateKey.startsWith("AQ.");
  if (!candidateKey || !knownKeyFormat) {
    return {
      ok: false,
      code: "GEMINI_KEY_INVALID",
      error: "Le format de la clé Gemini semble invalide.",
      diagnostics: probeDiagnostics(apiKey),
    };
  }

  try {
    const { response, model } = await requestGemini(candidateKey, {
      timeoutMs,
      maxAttemptsPerModel: 1,
      body: {
        contents: [
          {
            role: "user",
            parts: [{ text: "Reply with exactly OK." }],
          },
        ],
        // D1 round 3: thinking-enabled Gemini models spend generation output
        // on internal thought before any visible text. The previous 8-token
        // budget produced HTTP 200 responses with finishReason MAX_TOKENS and
        // an empty visible-parts list on the installed Internal.32 campaign —
        // read as "provider unavailable" even though the key had
        // authenticated and the model had answered. A generous budget lets a
        // benign probe answer in text.
        generationConfig: { maxOutputTokens: 256 },
      },
    });
    let data: MinimalGeminiResponse;
    try {
      data = (await response.json()) as MinimalGeminiResponse;
    } catch {
      // A 200 with a non-JSON body (captive portal, intercepting middlebox)
      // used to collapse into the same anonymous failure as every other
      // shape; the jsonParseFailed shape now names it.
      return {
        ok: false,
        code: "GEMINI_PROVIDER_UNAVAILABLE",
        error: "Gemini a répondu sans contenu vérifiable.",
        diagnostics: probeDiagnostics(apiKey, undefined, {
          jsonParseFailed: true,
          candidatesCount: null,
          finishReason: null,
          blockReason: null,
        }),
      };
    }
    const text = data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("")
      .trim();
    if (text) {
      return { ok: true, model };
    }
    // No visible text: classify the 200 truthfully instead of calling the
    // provider unavailable. A candidate with a finishReason proves the key
    // authenticated AND the model generated (thinking models can spend the
    // whole visible budget on thought) — that is a verified working key. A
    // promptFeedback blockReason is a policy refusal over an authenticated
    // key. Both convert to truthful coded outcomes; the remaining unknown
    // shapes now carry their exact response shape.
    const candidate = data.candidates?.[0];
    const shape: GeminiResponseShape = {
      jsonParseFailed: false,
      candidatesCount: data.candidates?.length ?? 0,
      finishReason: candidate?.finishReason ?? null,
      blockReason: data.promptFeedback?.blockReason ?? null,
    };
    if (candidate?.finishReason) {
      return { ok: true, model };
    }
    if (shape.blockReason) {
      return {
        ok: false,
        code: "GEMINI_REQUEST_INVALID",
        error: "Gemini a répondu sans contenu vérifiable.",
        diagnostics: probeDiagnostics(apiKey, undefined, shape),
      };
    }
    return {
      ok: false,
      code: "GEMINI_PROVIDER_UNAVAILABLE",
      error: "Gemini a répondu sans contenu vérifiable.",
      diagnostics: probeDiagnostics(apiKey, undefined, shape),
    };
  } catch (error) {
    return {
      ok: false,
      code:
        error instanceof GeminiProviderError
          ? error.code
          : "GEMINI_PROVIDER_UNAVAILABLE",
      error: geminiErrorMessage(error, "fr"),
      diagnostics: probeDiagnostics(
        apiKey,
        error instanceof GeminiProviderError ? error : undefined,
      ),
    };
  }
}
