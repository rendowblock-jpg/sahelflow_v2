import "server-only";

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
  ) {
    super(message);
    this.name = "GeminiProviderError";
  }
}

function providerError(
  status: number,
  body: GeminiErrorBody,
): GeminiProviderError {
  const providerStatus = body.error?.status;
  const message = body.error?.message?.trim() || `Gemini HTTP ${status}`;
  if (status === 403 || providerStatus === "PERMISSION_DENIED") {
    return new GeminiProviderError(
      "GEMINI_PERMISSION_DENIED",
      message,
      status,
    );
  }
  if (status === 429 || providerStatus === "RESOURCE_EXHAUSTED") {
    return new GeminiProviderError(
      "GEMINI_QUOTA_EXHAUSTED",
      message,
      status,
    );
  }
  if (providerStatus === "FAILED_PRECONDITION") {
    return new GeminiProviderError(
      "GEMINI_REGION_OR_BILLING_REQUIRED",
      message,
      status,
    );
  }
  if (status === 404 || providerStatus === "NOT_FOUND") {
    return new GeminiProviderError(
      "GEMINI_MODEL_UNAVAILABLE",
      message,
      status,
    );
  }
  if (status === 400 || providerStatus === "INVALID_ARGUMENT") {
    const keyInvalid = /api.?key|key not valid|invalid key/i.test(message);
    return new GeminiProviderError(
      keyInvalid ? "GEMINI_KEY_INVALID" : "GEMINI_REQUEST_INVALID",
      message,
      status,
    );
  }
  return new GeminiProviderError(
    "GEMINI_PROVIDER_UNAVAILABLE",
    message,
    status,
  );
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
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
    return await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      signal: controller.signal,
      body: JSON.stringify(body),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new GeminiProviderError(
        "GEMINI_TIMEOUT",
        "Gemini request timed out.",
      );
    }
    throw new GeminiProviderError(
      "GEMINI_NETWORK_ERROR",
      error instanceof Error ? error.message : "Gemini network request failed.",
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
      try {
        response = await fetchAttempt(url, apiKey, options.body, timeoutMs);
      } catch (error) {
        if (!(error instanceof GeminiProviderError)) throw error;
        lastError = error;
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

      if (response.ok) return { response, model };
      const errorBody = (await response
        .json()
        .catch(() => ({}))) as GeminiErrorBody;
      const error = providerError(response.status, errorBody);
      lastError = error;

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
  }>;
};

export async function verifyGeminiKey(
  apiKey: string,
  timeoutMs = 10_000,
): Promise<{
  ok: boolean;
  model?: GeminiModel;
  error?: string;
  code?: GeminiProviderErrorCode;
}> {
  if (!apiKey || !apiKey.startsWith("AIza")) {
    return {
      ok: false,
      code: "GEMINI_KEY_INVALID",
      error: "Le format de la clé Gemini semble invalide.",
    };
  }

  try {
    const { response, model } = await requestGemini(apiKey, {
      timeoutMs,
      maxAttemptsPerModel: 1,
      body: {
        contents: [
          {
            role: "user",
            parts: [{ text: "Reply with exactly OK." }],
          },
        ],
        generationConfig: { maxOutputTokens: 8 },
      },
    });
    const data = (await response.json()) as MinimalGeminiResponse;
    const text = data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("")
      .trim();
    if (!text) {
      return {
        ok: false,
        code: "GEMINI_PROVIDER_UNAVAILABLE",
        error: "Gemini a répondu sans contenu vérifiable.",
      };
    }
    return { ok: true, model };
  } catch (error) {
    return {
      ok: false,
      code:
        error instanceof GeminiProviderError
          ? error.code
          : "GEMINI_PROVIDER_UNAVAILABLE",
      error: geminiErrorMessage(error, "fr"),
    };
  }
}
