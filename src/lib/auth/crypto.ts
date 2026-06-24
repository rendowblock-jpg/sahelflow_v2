/**
 * Auth crypto helpers — Web Crypto API (works in Edge middleware + Node API routes).
 * Zero dependencies. Uses HMAC-SHA256 for session tokens, PBKDF2 for PIN hashing.
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
  exp: number; // expiry timestamp (ms)
  iat: number; // issued-at timestamp (ms)
}

/**
 * Create a signed session token.
 * Format: base64url(payload).base64url(hmac-signature)
 */
export async function createSessionToken(
  secret: string,
  ttlMs: number = 7 * 24 * 60 * 60 * 1000, // 7 days
): Promise<string> {
  const payload: SessionPayload = {
    iat: Date.now(),
    exp: Date.now() + ttlMs,
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
 * Hash a PIN using PBKDF2-SHA256 (100k iterations).
 * Returns "salt:hash" in base64url.
 */
export async function hashPin(pin: string): Promise<string> {
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
      iterations: 100_000,
      hash: "SHA-256",
    },
    keyMaterial,
    256,
  );
  return `${base64urlEncode(salt)}:${base64urlEncode(new Uint8Array(hash))}`;
}

/**
 * Verify a PIN against a "salt:hash" string.
 */
export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const [saltB64, hashB64] = stored.split(":");
  if (!saltB64 || !hashB64) return false;
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
      iterations: 100_000,
      hash: "SHA-256",
    },
    keyMaterial,
    256,
  );
  const expected = base64urlDecode(hashB64);
  const actual = new Uint8Array(hash);
  // Constant-time comparison
  if (expected.length !== actual.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected[i]! ^ actual[i]!;
  }
  return diff === 0;
}

/** Generate a random 32-byte secret (base64url). */
export function generateSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return base64urlEncode(bytes);
}
