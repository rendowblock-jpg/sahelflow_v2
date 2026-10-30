// CORS for the phone app (a browser on another origin). Pure functions, no I/O.
// The list comes from the PWA_ORIGINS variable: exact scheme+host+port, no
// wildcard, no "null" origin. Anything else gets no CORS headers at all.

export const CORS_ALLOWED_METHODS = "GET, POST, OPTIONS";
export const CORS_ALLOWED_HEADERS = "Authorization, Content-Type";
export const CORS_MAX_AGE_SECONDS = 86400;
// Retry-After and ETag are not readable by a page unless they are exposed.
const CORS_EXPOSED_HEADERS = "Retry-After, ETag";
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** The value itself when it is a canonical origin we would ever allow, else null. */
function canonicalOrigin(value: string): string | null {
  if (value.includes("*")) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  // url.origin drops paths, slashes, credentials, default ports and lower-cases the host:
  // anything that changes is not an exact origin.
  if (url.origin !== value) return null;
  if (url.protocol === "https:") return value;
  if (url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname)) return value;
  return null;
}

export function parseAllowedOrigins(raw: string | null | undefined): ReadonlySet<string> {
  const allowed = new Set<string>();
  for (const part of (raw ?? "").split(",")) {
    const entry = part.trim();
    if (!entry) continue;
    const origin = canonicalOrigin(entry);
    if (origin) allowed.add(origin);
  }
  return allowed;
}

/** The origin to echo back, or null when the request has none or it is not on the list. */
export function allowedOrigin(origin: string | null, allowed: ReadonlySet<string>): string | null {
  if (!origin || origin === "null") return null;
  return allowed.has(origin) ? origin : null;
}

export function corsHeaders(origin: string, preflight: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Expose-Headers": CORS_EXPOSED_HEADERS,
  };
  if (preflight) {
    headers["Access-Control-Allow-Methods"] = CORS_ALLOWED_METHODS;
    headers["Access-Control-Allow-Headers"] = CORS_ALLOWED_HEADERS;
    headers["Access-Control-Max-Age"] = String(CORS_MAX_AGE_SECONDS);
  }
  return headers;
}
