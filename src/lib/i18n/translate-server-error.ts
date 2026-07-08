/**
 * Server-error translation helper.
 *
 * Problem: API routes return English (or occasionally French) error strings in
 * their JSON `{ error: "..." }` responses. The client shows these verbatim in
 * toasts via `toast.error(e.message)` / `toast.error(data.error)`, so Arabic
 * and French users see English notifications.
 *
 * Fix strategy: a client-side mapping from known server error strings to i18n
 * keys. This is pragmatic — the server can't read the client locale, and
 * reworking every API route to return error codes would be a much larger
 * change. The mapping covers the high-frequency error strings; anything
 * unmapped falls back to the provided `t()`-translated generic message.
 *
 * Usage:
 *   const { t } = useI18n();
 *   const msg = translateServerError(data.error, t, t("common.error"));
 *   toast.error(msg);
 *
 * Matching is case-insensitive + substring-based (server strings may vary
 * slightly with params). The first matching rule wins.
 */
type TFunc = (key: string, params?: Record<string, string | number>) => string;

interface ErrorRule {
  /** Substring to match (case-insensitive). */
  match: string;
  /** i18n key to translate. */
  key: string;
  /** Optional params for the i18n key. */
  params?: (raw: string) => Record<string, string | number>;
}

// Ordered list — first match wins. Keep specific phrases before generic ones.
const RULES: readonly ErrorRule[] = [
  // Auth
  { match: "incorrect pin", key: "auth.incorrectPin" },
  { match: "too many attempts", key: "auth.tooManyAttempts" },
  { match: "too many failed attempts", key: "auth.accountLocked" },
  { match: "auth not set up", key: "auth.notSetUp" },
  { match: "current pin is incorrect", key: "auth.incorrectPin" },
  { match: "new pin must be different", key: "auth.samePin" },
  { match: "already set up", key: "auth.alreadySetUp" },

  // Rate limiting
  { match: "too many orders", key: "error.rateLimited" },
  { match: "rate limit", key: "error.rateLimited" },

  // WhatsApp sidecar
  { match: "sidecar not reachable", key: "whatsapp.sidecarUnreachable" },
  { match: "sidecar token unavailable", key: "whatsapp.sidecarTokenUnavailable" },
  { match: "no qr available", key: "whatsapp.noQr" },

  // Storefront
  { match: "storefront not found", key: "storefront.errors.notFound" },
  { match: "storefront not found or inactive", key: "storefront.errors.notFound" },
  { match: "product not found", key: "storefront.errors.productNotFound" },
  { match: "produit non disponible", key: "storefront.errors.productNotFound" },

  // Orders / delivery / risk
  { match: "order not found", key: "orders.errors.notFound" },
  { match: "delivery not found", key: "deliveries.errors.notFound" },
  { match: "must be confirmed before shipping", key: "deliveries.errors.mustBeConfirmed" },
  { match: "pas de numéro de suivi", key: "deliveries.errors.noTrackingNumber" },

  // Validation
  { match: "invalid wilaya", key: "common.invalidWilaya" },
  { match: "failed to load communes", key: "common.failedToLoadCommunes" },

  // Generic fallback patterns
  { match: "not found", key: "error.notFound" },
  { match: "unauthorized", key: "error.unauthorized" },
  { match: "forbidden", key: "error.forbidden" },
  { match: "validation", key: "error.validationFailed" },
];

/**
 * Translate a server-provided error string to the active locale.
 *
 * @param rawError - the raw `error` string from the API JSON response (may be undefined/null)
 * @param t - the i18n `t()` function
 * @param fallback - a pre-translated fallback message (e.g. `t("common.error")`)
 * @returns the best-effort translated message
 */
export function translateServerError(
  rawError: string | { message?: string } | undefined | null,
  t: TFunc,
  fallback: string,
): string {
  if (!rawError) return fallback;
  const raw = typeof rawError === "string" ? rawError : (rawError.message ?? "");
  if (!raw) return fallback;
  const lower = raw.toLowerCase();
  for (const rule of RULES) {
    if (lower.includes(rule.match)) {
      const params = rule.params?.(raw);
      return params ? t(rule.key, params) : t(rule.key);
    }
  }
  // No rule matched — if it's a generic "Request failed (NNN)" fallback, prefer
  // the translated generic. Otherwise return the raw string (a one-off server
  // message the user can still act on is better than a vague generic).
  if (/^request failed \(\d+\)$/i.test(raw)) {
    return t("error.requestFailed");
  }
  return raw;
}
