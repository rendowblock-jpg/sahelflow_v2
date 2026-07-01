/**
 * Auth crypto helpers — Web Crypto API (works in Edge middleware + Node API routes).
 * Zero dependency. Uses HMAC-SHA256 for session tokens, PBKDF2 for PIN hashing.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Convert a Uint8Array to a BufferSource that TypeScript accepts.
 * Workaround for TS 5.7+ strictness on Uint8Array<ArrayBufferLike>.
 */
function toBufferSource(bytes: Uint8Array): BufferSource {
  // Copy into a fresh ArrayBuffer to satisfy the BufferSource type
  const buf = new ArrayBuffer(bytes.byteLength);
  const view = new Uint8Array(buf);
  view.set(bytes);
  return view;
}

/** Encode a string to a BufferSource (for Web Crypto API). */
function encode(str: string): BufferSource {
  return toBufferSource(encoder.encode(str));
}

/** Base64url encode (URL-safe, no padding). */
function base64urlEncode(bytes: Uint8Array): string {
  const b64 = btoa(String.fromCharCode(...bytes));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Base64url decode. */
function base64urlDecode(str: string): Uint8Array {
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Import an HMAC-SHA256 key from a secret string. */
async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** Session token payload. */
export interface SessionPayload {
  exp: number;
  iat: number;
  sid?: string; // session ID for revocation (SEC-004)
}

/**
 * Create a signed session token.
 * Format: base64url(payload).base64url(hmac-signature)
 */
export async function createSessionToken(
  secret: string,
  ttlMs: number = 7 * 24 * 60 * 60 * 1000,
  sessionId?: string,
): Promise<string> {
  const payload: SessionPayload = {
    iat: Date.now(),
    exp: Date.now() + ttlMs,
    ...(sessionId ? { sid: sessionId } : {}),
  };
  const payloadStr = JSON.stringify(payload);
  const payloadB64 = base64urlEncode(encoder.encode(payloadStr));
  const key = await importHmacKey(secret);
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    encode(payloadB64),
  );
  const sigB64 = base64urlEncode(new Uint8Array(sig));
  return `${payloadB64}.${sigB64}`;
}

/**
 * Verify a signed session token. Returns true if valid + not expired.
 * Returns false if the secret is not set (setup mode — allow all).
 */
export async function verifySessionToken(
  token: string | undefined | null,
  secret: string | undefined,
): Promise<boolean> {
  if (!secret) return true; // setup mode — no secret yet, allow
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payloadB64, sigB64] = parts as [string, string];
  let key: CryptoKey;
  try {
    key = await importHmacKey(secret);
  } catch {
    return false;
  }
  let sigBytes: Uint8Array;
  try {
    sigBytes = base64urlDecode(sigB64);
  } catch {
    return false;
  }
  let valid: boolean;
  try {
    valid = await crypto.subtle.verify(
      "HMAC",
      key,
      toBufferSource(sigBytes),
      encode(payloadB64),
    );
  } catch {
    return false;
  }
  if (!valid) return false;
  // Check expiry
  try {
    const payloadJson = decoder.decode(base64urlDecode(payloadB64));
    const payload = JSON.parse(payloadJson) as SessionPayload;
    return Date.now() < payload.exp;
  } catch {
    return false;
  }
}

/**
 * Extract the session ID from a token (without verifying the signature —
 * caller must have already called verifySessionToken). Returns null for
 * legacy tokens without `sid` or for malformed tokens.
 */
export function getSessionIdFromToken(token: string | undefined | null): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  try {
    const payloadJson = decoder.decode(base64urlDecode(parts[0]!));
    const payload = JSON.parse(payloadJson) as SessionPayload;
    return payload.sid ?? null;
  } catch {
    return null;
  }
}

// ─── PIN hashing (PBKDF2-SHA256) ─────────────────────────────────────────────

/**
 * PBKDF2 iteration counts.
 *
 * CURRENT (600,000) — OWASP 2023 recommendation for PBKDF2-SHA256.
 * LEGACY (100,000) — the original v3.0 count. Old PIN hashes use this;
 * verifyPin detects them and the login flow re-hashes to CURRENT on next
 * successful login (transparent upgrade, no forced reset).
 *
 * SEC-001: raised from 100k to 600k. At ~0.3ms/iteration on modern hardware,
 * 600k ≈ 180ms per verify — acceptable for single-user desktop login, while
 * raising brute-force cost 6× (a 4-char numeric PIN now takes ~50 min to
 * exhaust at 1 attempt/180ms, before rate limiting; with rate limiting +
 * lockout, brute-force is impractical).
 */
export const CURRENT_PBKDF2_ITERATIONS = 600_000;
export const LEGACY_PBKDF2_ITERATIONS = 100_000;

/**
 * Hash format versions:
 *   NEW (v2):  `pbkdf2_sha256$<iterations>$<salt_b64>$<hash_b64>`
 *   LEGACY:    `<salt_b64>:<hash_b64>`  (100k iterations implied)
 *
 * The NEW format embeds the iteration count so future increases don't
 * require another format change — verifyPin reads the count from the hash.
 */
const HASH_FORMAT_PREFIX = "pbkdf2_sha256$";

/**
 * Hash a PIN using PBKDF2-SHA256 at CURRENT_PBKDF2_ITERATIONS.
 * Returns `pbkdf2_sha256$<iterations>$<salt_b64>$<hash_b64>`.
 */
export async function hashPin(
  pin: string,
  iterations: number = CURRENT_PBKDF2_ITERATIONS,
): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const hash = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: toBufferSource(salt),
      iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    256,
  );
  return `${HASH_FORMAT_PREFIX}${iterations}$${base64urlEncode(salt)}$${base64urlEncode(new Uint8Array(hash))}`;
}

/** Parse a stored PIN hash into { iterations, salt, hash } or null if malformed. */
function parsePinHash(stored: string): { iterations: number; saltB64: string; hashB64: string } | null {
  if (stored.startsWith(HASH_FORMAT_PREFIX)) {
    // NEW format: pbkdf2_sha256$iterations$salt$hash
    const parts = stored.slice(HASH_FORMAT_PREFIX.length).split("$");
    if (parts.length !== 3) return null;
    const [iterStr, saltB64, hashB64] = parts as [string, string, string];
    const iterations = parseInt(iterStr, 10);
    if (!Number.isFinite(iterations) || iterations < 1) return null;
    if (!saltB64 || !hashB64) return null;
    return { iterations, saltB64, hashB64 };
  }
  // LEGACY format: salt:hash (100k iterations implied)
  const colonIdx = stored.indexOf(":");
  if (colonIdx === -1) return null;
  const saltB64 = stored.slice(0, colonIdx);
  const hashB64 = stored.slice(colonIdx + 1);
  if (!saltB64 || !hashB64) return null;
  return { iterations: LEGACY_PBKDF2_ITERATIONS, saltB64, hashB64 };
}

/** Run PBKDF2 derivation with a given iteration count (internal helper). */
async function derivePinHash(pin: string, saltB64: string, iterations: number): Promise<Uint8Array> {
  const salt = base64urlDecode(saltB64);
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const hash = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: toBufferSource(salt),
      iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    256,
  );
  return new Uint8Array(hash);
}

/** Constant-time comparison of two byte arrays. */
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i]! ^ b[i]!;
  }
  return diff === 0;
}

/**
 * Verify a PIN against a stored hash (supports both NEW + LEGACY formats).
 * Returns true if the PIN matches. For rehash detection, use verifyPinDetailed.
 */
export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const parsed = parsePinHash(stored);
  if (!parsed) return false;
  const actual = await derivePinHash(pin, parsed.saltB64, parsed.iterations);
  const expected = base64urlDecode(parsed.hashB64);
  return constantTimeEqual(expected, actual);
}

/**
 * Verify a PIN + report whether the stored hash should be re-hashed to the
 * current iteration count (LEGACY format or older NEW-format with < CURRENT
 * iterations). The login flow calls this and, on success + needsRehash,
 * re-hashes the PIN transparently on next successful login.
 */
export async function verifyPinDetailed(
  pin: string,
  stored: string,
): Promise<{ valid: boolean; needsRehash: boolean; iterations: number }> {
  const parsed = parsePinHash(stored);
  if (!parsed) return { valid: false, needsRehash: false, iterations: 0 };
  const actual = await derivePinHash(pin, parsed.saltB64, parsed.iterations);
  const expected = base64urlDecode(parsed.hashB64);
  const valid = constantTimeEqual(expected, actual);
  return {
    valid,
    needsRehash: valid && parsed.iterations < CURRENT_PBKDF2_ITERATIONS,
    iterations: parsed.iterations,
  };
}

/** True if the stored hash uses fewer than CURRENT iterations (needs upgrade). */
export function pinHashNeedsRehash(stored: string): boolean {
  const parsed = parsePinHash(stored);
  if (!parsed) return false;
  return parsed.iterations < CURRENT_PBKDF2_ITERATIONS;
}

/** Generate a random 32-byte secret (base64url). */
export function generateSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return base64urlEncode(bytes);
}
