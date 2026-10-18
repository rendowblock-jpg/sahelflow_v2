/**
 * A short, secret-free label for a failed backup step: the error `code` (for
 * example ECONNRESET) or its `name`, only when it looks like an identifier.
 * The message is never used: it can carry URLs, tokens or paths.
 */
const SAFE_CODE = /^[A-Za-z0-9_]{1,40}$/;

export function backupFailureCode(error: unknown): string {
  if (error && typeof error === "object") {
    const { code, name } = error as { code?: unknown; name?: unknown };
    if (typeof code === "string" && SAFE_CODE.test(code)) return code;
    if (typeof name === "string" && SAFE_CODE.test(name)) return name;
  }
  return "UNKNOWN";
}
