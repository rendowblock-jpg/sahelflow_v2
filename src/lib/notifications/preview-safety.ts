const SECRET_LABEL_PATTERN =
  /\b(?:api[ _-]?key|authorization|bearer|cookie|credential|diagnostic|jwt|one[ _-]?time|otp|passcode|password|private[ _-]?key|secret|session|stack[ _-]?trace|token)\b|(?:كلمة\s*المرور|رمز\s*التحقق|رمز\s*سري|مفتاح\s*سري|mot\s+de\s+passe|code\s+secret|jeton)/iu;
const NUMERIC_CODE_PATTERN = /(?<!\d)\d{4,8}(?!\d)/u;
const JWT_PATTERN = /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/u;
const HIGH_ENTROPY_PATTERN = /\b[A-Za-z0-9_+/=-]{24,}\b/u;
const URL_CREDENTIAL_PATTERN = /\bhttps?:\/\/[^\s/@:]+:[^\s/@]+@/iu;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u;

/**
 * Native previews are lock-screen/history surfaces. Even after an actor opts
 * into protected contact previews, secret-looking content falls back to the
 * generic localized notification rather than leaving the app boundary.
 */
export function sanitizeNativePreview(
  contactName: string,
  body: string,
): { contactName: string; body: string } | null {
  if (
    SECRET_LABEL_PATTERN.test(body) ||
    NUMERIC_CODE_PATTERN.test(body) ||
    JWT_PATTERN.test(body) ||
    HIGH_ENTROPY_PATTERN.test(body) ||
    URL_CREDENTIAL_PATTERN.test(body) ||
    CONTROL_CHARACTER_PATTERN.test(body)
  ) {
    return null;
  }

  const safeContactName = contactName.replace(/\s+/gu, " ").trim().slice(0, 80);
  const safeBody = body.replace(/\s+/gu, " ").trim().slice(0, 240);
  return safeContactName && safeBody
    ? { contactName: safeContactName, body: safeBody }
    : null;
}
