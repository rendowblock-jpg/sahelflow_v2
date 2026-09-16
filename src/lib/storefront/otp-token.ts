import "server-only";

/**
 * OTP verification tokens — stateless proof of a verified (or bypassed)
 * phone (FD-061 EX-4, slice 6).
 *
 * Contract transcribed from the live-proven CodFlow engine
 * (cod-server/src/endpoints/store-otp/token.ts @ 00f18fa, Apache-2.0),
 * re-expressed with node:crypto because SahelFlow runs on the desktop
 * runtime, not Cloudflare Workers:
 *
 * After a customer verifies their WhatsApp code, the server mints a
 * compact HMAC-SHA256 token binding the normalized E.164 phone to an
 * expiry. `POST /api/storefront/submit` verifies it without any
 * server-side session state — the shop database stays untouched by the
 * OTP flow.
 *
 * Token shape (b64url): `{v,p,e,t}.{sig}`
 *   v = payload version ("1" — future format changes bump this and old
 *       tokens simply stop verifying)
 *   p = phone (E.164, normalized BEFORE signing)
 *   e = expiry (unix seconds)
 *   t = type: "v" = phone verified via WhatsApp code,
 *            "b" = bypass — dzverify could not serve the send (quota
 *                 exhausted / provider down). Server-attested so it cannot
 *                 be forged; the order proceeds unverified per the
 *                 fail-open contract.
 *
 * The signing key derives from the storefront's dzverify API key
 * (SHA-256(api_key + "sahelflow-otp-v1")) — rotating the merchant's key
 * invalidates outstanding tokens, and no new platform secret exists to
 * manage. A token minted under one storefront's key never verifies under
 * another's.
 *
 * Comparison is constant-time over fixed-length digests.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_VERSION = 1;
const TOKEN_TTL_SECONDS = 15 * 60;
const KEY_CONTEXT = "sahelflow-otp-v1";

export type OtpTokenType = "v" | "b";

export interface OtpTokenPayload {
  phone: string;
  /** Unix seconds. */
  expiresAt: number;
  type: OtpTokenType;
}

function b64urlEncode(bytes: Buffer): string {
  return bytes
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64urlDecode(text: string): Buffer | null {
  try {
    const padded = text.replace(/-/g, "+").replace(/_/g, "/");
    return Buffer.from(padded + "=".repeat((4 - (padded.length % 4)) % 4), "base64");
  } catch {
    return null;
  }
}

function encodeJson(value: unknown): string {
  return b64urlEncode(Buffer.from(JSON.stringify(value), "utf8"));
}

function decodeJson<T>(text: string): T | null {
  const bytes = b64urlDecode(text);
  if (!bytes) return null;
  try {
    return JSON.parse(bytes.toString("utf8")) as T;
  } catch {
    return null;
  }
}

function signature(apiKey: string, payload: object): string {
  // Signing key = SHA-256(api_key + context) — a plain digest of the
  // merchant key and the domain-separation context (the transcribed
  // contract; rotating the key invalidates outstanding tokens).
  const seed = createHash("sha256").update(`${apiKey}${KEY_CONTEXT}`).digest();
  return b64urlEncode(createHmac("sha256", seed).update(JSON.stringify(payload)).digest());
}

/** Constant-time equality for equal-length signature strings. */
export function timingSafeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
  } catch {
    return false;
  }
}

/**
 * Mint a token. `type` "v" for a verified phone, "b" for a fail-open
 * bypass (only minted when dzverify itself could not serve the send).
 */
export function signOtpToken(
  apiKey: string,
  phone: string,
  type: OtpTokenType,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): string {
  const payload = {
    v: TOKEN_VERSION,
    p: phone,
    e: nowSeconds + TOKEN_TTL_SECONDS,
    t: type,
  };
  return `${encodeJson(payload)}.${signature(apiKey, payload)}`;
}

/**
 * Verify a token. Returns the payload, or null for ANY of: malformed
 * input, wrong version, bad signature, expiry, unknown type. Callers only
 * learn "valid until e for phone p" — never why it failed (no oracle).
 */
export function verifyOtpToken(
  apiKey: string,
  token: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): OtpTokenPayload | null {
  if (typeof token !== "string" || token.length > 1024) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const payloadPart = token.slice(0, dot);
  const signaturePart = token.slice(dot + 1);

  const payload = decodeJson<{ v?: number; p?: string; e?: number; t?: string }>(
    payloadPart,
  );
  if (
    payload == null ||
    payload.v !== TOKEN_VERSION ||
    typeof payload.p !== "string" ||
    typeof payload.e !== "number" ||
    (payload.t !== "v" && payload.t !== "b")
  ) {
    return null;
  }

  const expected = signature(apiKey, {
    v: payload.v,
    p: payload.p,
    e: payload.e,
    t: payload.t,
  });
  if (!timingSafeStringEqual(signaturePart, expected)) return null;

  if (payload.e <= nowSeconds) return null;

  return { phone: payload.p, expiresAt: payload.e, type: payload.t };
}
