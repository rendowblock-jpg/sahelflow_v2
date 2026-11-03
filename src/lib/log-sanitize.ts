/**
 * What may reach the seller's app.log (F-0033). Pure and table-tested.
 *
 * The packaged desktop discards the Next server's console, so before the app
 * log existed an unexpected error on a seller's PC left no trace. The file is
 * read by support, possibly sent to us, so it must hold the cause of an error
 * (name, code, a short message, the top frames) and nothing about a customer
 * or the seller's machine:
 *
 *   kept:     ts, level, msg, scalar context values, error name / code /
 *             message, the first 6 stack frames
 *   dropped:  request bodies, headers, cookies, tokens, PINs, passwords and
 *             any non-scalar context value
 *   redacted: user folders, e-mail addresses, WhatsApp ids, phone numbers,
 *             every run of 7 or more digits, bearer tokens and long
 *             hex/base64 strings
 *
 * Redaction runs BEFORE any cut, so a secret straddling a cut leaves no
 * readable prefix. Phone and e-mail detection is reused from redact-pii.ts
 * (one place that knows what a phone number looks like).
 */

import { redactPii } from "@/lib/redact-pii";

export const LOG_MSG_MAX = 200;
export const LOG_CONTEXT_STRING_MAX = 160;
export const LOG_ERROR_NAME_MAX = 80;
export const LOG_ERROR_MESSAGE_MAX = 200;
export const LOG_STACK_LINES_MAX = 6;
const STACK_LINE_MAX = 200;
const CONTEXT_KEYS_MAX = 20;
const CONTEXT_KEY_MAX = 40;
const TS_MAX = 40;
// Bound the work on a pathological 10 MB message: only the head can survive the
// final cut anyway (redaction never grows text by more than a few characters).
const PRE_CUT_FACTOR = 4;

export type LogContextValue = string | number | boolean | null;

export interface SanitizedLogEntry {
  ts: string;
  level: string;
  msg: string;
  context?: Record<string, LogContextValue>;
  error?: { name?: string; code?: string | number; message?: string; stack?: string };
}

const WINDOWS_USER_DIR = /[A-Za-z]:[\\/]+Users[\\/]+[^\\/"'<>|:*?\r\n]{1,64}(?=[\\/])/gi;
const WINDOWS_USER_DIR_AT_END = /[A-Za-z]:[\\/]+Users[\\/]+[^\\/\s"'<>|:*?]+/gi;
const POSIX_USER_DIR = /(?<![\w.~-])\/(?:Users|home)\/[^/\s"'<>|:*?]+/g;
const WHATSAPP_JID =
  /[\w.:-]+@(?:lid|s\.whatsapp\.net|g\.us|c\.us|broadcast|newsletter|hosted(?:\.lid)?)(?![A-Za-z0-9])/gi;
const AUTH_SCHEME = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi;
const SECRET_ASSIGNMENT =
  /\b([A-Za-z0-9_-]*(?:token|secret|password|passwd|pwd|apikey|api[_-]key|signature|authorization|otp|pin|key))=([^\s&"',;]+)/gi;
const LONG_TOKEN = /[A-Za-z0-9+/_=-]{24,}/g;
// A UUID is an id support needs, not a number: it is matched first so that its
// digit-only tail is not mistaken for a phone number.
const UUID_OR_DIGIT_RUN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b|[0-9\u0660-\u0669\u06F0-\u06F9]{7,}/gi;
const WHITESPACE_AND_CONTROL = /[\s\p{Cc}]+/gu;
const LEVELS = new Set(["debug", "info", "warn", "error"]);

function isSecretLike(token: string): boolean {
  if (/^[0-9a-f]{24,}$/i.test(token)) return true;
  // Random base64 mixes both cases and digits; file paths, identifiers and
  // lowercase ids (cuid, uuid) do not.
  return /[a-z]/.test(token) && /[A-Z]/.test(token) && /[0-9]/.test(token);
}

/** Replace everything personal or secret in a piece of text. */
export function redactLogText(text: string): string {
  let out = text
    .replace(WINDOWS_USER_DIR, "%USERPROFILE%")
    .replace(WINDOWS_USER_DIR_AT_END, "%USERPROFILE%")
    .replace(POSIX_USER_DIR, "~")
    .replace(WHATSAPP_JID, "<jid>");
  // redact-pii.ts owns phone and e-mail detection; map its markers.
  out = redactPii(out).replace(/\[EMAIL\]/g, "<email>").replace(/\[PHONE\]/g, "<digits>");
  return out
    .replace(AUTH_SCHEME, "$1 <secret>")
    .replace(SECRET_ASSIGNMENT, "$1=<secret>")
    .replace(LONG_TOKEN, (token) => (isSecretLike(token) ? "<secret>" : token))
    .replace(UUID_OR_DIGIT_RUN, (match) => (match.includes("-") ? match : "<digits>"));
}

/** One line, redacted, then cut. */
function clean(value: string, max: number): string {
  const limit = max * PRE_CUT_FACTOR;
  const head = value.length > limit ? value.slice(0, limit) : value;
  return redactLogText(head.replace(WHITESPACE_AND_CONTROL, " ").trim()).slice(0, max);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const FORBIDDEN_KEY_SUFFIXES = [
  "token",
  "password",
  "passwd",
  "secret",
  "secrets",
  "cookie",
  "cookies",
  "apikey",
  "privatekey",
  "secretkey",
  "body",
  "headers",
  "authorization",
  "credential",
  "credentials",
];
const FORBIDDEN_KEY_WORDS = new Set(["pin", "pwd", "jwt", "otp", "signature", "header"]);
const KEY_QUALIFIERS = new Set([
  "api",
  "private",
  "secret",
  "access",
  "signing",
  "encryption",
  "master",
  "auth",
  "shared",
  "license",
  "licence",
  "session",
  "client",
]);
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** body, headers, authorization, cookie, pin, key, token, password and their spellings. */
function isForbiddenKey(key: string): boolean {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  return words.some((word, index) => {
    if (FORBIDDEN_KEY_WORDS.has(word)) return true;
    if (FORBIDDEN_KEY_SUFFIXES.some((suffix) => word.endsWith(suffix))) return true;
    return word === "key" && (words.length === 1 || KEY_QUALIFIERS.has(words[index - 1] ?? ""));
  });
}

function sanitizeContext(context: unknown): Record<string, LogContextValue> | undefined {
  if (!isRecord(context)) return undefined;
  const out: Record<string, LogContextValue> = {};
  let count = 0;
  for (const key of Object.keys(context)) {
    if (count >= CONTEXT_KEYS_MAX) break;
    if (UNSAFE_KEYS.has(key) || isForbiddenKey(key)) continue;
    let value: LogContextValue;
    try {
      const raw = context[key];
      if (typeof raw === "string") value = clean(raw, LOG_CONTEXT_STRING_MAX);
      else if (typeof raw === "number" && Number.isFinite(raw)) value = raw;
      else if (typeof raw === "boolean" || raw === null) value = raw;
      else continue;
    } catch {
      continue;
    }
    out[clean(key, CONTEXT_KEY_MAX)] = value;
    count += 1;
  }
  return count > 0 ? out : undefined;
}

/** Only real frames ("at ..."), never the header line: it repeats name and message. */
function sanitizeStack(stack: string): string | undefined {
  const frames: string[] = [];
  for (const raw of stack.slice(0, 8192).split("\n")) {
    const line = raw.trim();
    if (!/^at\s/.test(line)) continue;
    frames.push(clean(line, STACK_LINE_MAX));
    if (frames.length >= LOG_STACK_LINES_MAX) break;
  }
  return frames.length > 0 ? frames.join("\n") : undefined;
}

function sanitizeError(error: unknown): SanitizedLogEntry["error"] {
  if (error === undefined || error === null) return undefined;
  if (!isRecord(error)) {
    const message = clean(String(error), LOG_ERROR_MESSAGE_MAX);
    return message ? { message } : undefined;
  }
  const out: NonNullable<SanitizedLogEntry["error"]> = {};
  if (typeof error.name === "string") out.name = clean(error.name, LOG_ERROR_NAME_MAX);
  if (typeof error.code === "string") out.code = clean(error.code, LOG_ERROR_NAME_MAX);
  else if (typeof error.code === "number" && Number.isFinite(error.code)) out.code = error.code;
  if (typeof error.message === "string") out.message = clean(error.message, LOG_ERROR_MESSAGE_MAX);
  if (typeof error.stack === "string") {
    const stack = sanitizeStack(error.stack);
    if (stack) out.stack = stack;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** The entry that is safe to write to disk. Never throws. */
export function sanitizeForFile(entry: unknown): SanitizedLogEntry {
  const source: Record<string, unknown> = isRecord(entry) ? entry : {};
  let ts = "";
  let level = "error";
  let msg = "";
  try {
    if (typeof source.ts === "string") ts = clean(source.ts, TS_MAX);
    if (typeof source.level === "string" && LEVELS.has(source.level)) level = source.level;
    if (typeof source.msg === "string") msg = clean(source.msg, LOG_MSG_MAX);
  } catch {
    // keep the defaults
  }
  const out: SanitizedLogEntry = { ts: ts || new Date().toISOString(), level, msg };
  try {
    const context = sanitizeContext(source.context);
    if (context) out.context = context;
  } catch {
    // an unreadable context is left out
  }
  try {
    const error = sanitizeError(source.error);
    if (error) out.error = error;
  } catch {
    // an unreadable error is left out
  }
  return out;
}
