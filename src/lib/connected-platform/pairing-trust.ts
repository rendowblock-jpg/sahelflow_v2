// Closes the pairing trust gap on the desktop side (and is isomorphic, so the
// phone slice imports the same code to verify). The desktop signs its RSA
// encryption public key with its Ed25519 signing key; the phone pins the
// signing key's fingerprint from the link (which never touches a server) and
// refuses any RSA key whose signature does not verify against that pin.
// Pure and never throws: every refusal is a typed reason.
import {
  base64Decode,
  base64Encode,
  concatBytes,
  getSubtle,
  timingSafeEqualBytes,
  toArrayBuffer,
  utf8Encode,
} from "./web/bytes";
import { deviceFingerprint } from "./web/fingerprint";

export const DESKTOP_KEY_CONTEXT = "sahelflow.pairing.rsa-key.v1";

const MAX_JWK_CHARS = 4096;
const MAX_CONTEXT_CHARS = 80;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const PIN = /^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/;

type Options = Readonly<{ subtle?: SubtleCrypto | null }>;

export type SignDesktopKeyResult =
  | Readonly<{ ok: true; rsaPublicJwk: string; signature: string; context: string }>
  | Readonly<{ ok: false; reason: "malformed" | "unavailable" | "sign_failed" }>;

export type VerifyDesktopKeyReason =
  | "malformed"
  | "wrong_context"
  | "key_mismatch_with_pin"
  | "bad_signature"
  | "unavailable";

export type VerifyDesktopKeyResult =
  | Readonly<{ ok: true; rsaPublicJwk: string; signingFingerprint: string }>
  | Readonly<{ ok: false; reason: VerifyDesktopKeyReason }>;

export type VerifyDesktopKeyInput = Readonly<{
  /** The RSA key exactly as the relay handed it over. */
  rsaPublicJwk: string;
  /** Base64 of the 64-byte Ed25519 signature. */
  signature: string;
  /** The context the publisher says it signed under. */
  context: string;
  /** Raw 32-byte Ed25519 key in base64, as the relay handed it over. */
  desktopSigningPublicKey: string;
  /** "A1B2-C3D4-E5F6-7788" from the link fragment. */
  pinnedFingerprint: string;
}>;

/**
 * RFC 8785 style bytes of an RSA public JWK: only the members e, kty and n
 * (extras such as alg, ext, key_ops are not part of the identity), keys in
 * code-unit order, no whitespace. Null when the key is not a plain RSA public JWK.
 */
export function canonicalRsaJwkBytes(rsaPublicJwk: unknown): Uint8Array | null {
  if (typeof rsaPublicJwk !== "string" || rsaPublicJwk.length < 32 || rsaPublicJwk.length > MAX_JWK_CHARS) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rsaPublicJwk);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const { e, kty, n } = parsed as Record<string, unknown>;
  if (kty !== "RSA" || typeof n !== "string" || typeof e !== "string") return null;
  if (!BASE64URL.test(n) || !BASE64URL.test(e)) return null;
  return utf8Encode(JSON.stringify({ e, kty, n }));
}

function validContext(context: unknown): context is string {
  return typeof context === "string" && context.length > 0 && context.length <= MAX_CONTEXT_CHARS && !context.includes("\u0000");
}

// The context goes in front of the key bytes with a NUL between, so a
// signature made for another purpose can never verify as a key signature.
function signedBytes(context: string, canonical: Uint8Array): Uint8Array {
  return concatBytes(utf8Encode(context), new Uint8Array([0]), canonical);
}

/** Imports the desktop's Ed25519 private key (PKCS8 base64). Null when it cannot be used. */
export async function importDesktopSigningPrivateKey(
  pkcs8Base64: string,
  options: Options = {},
): Promise<CryptoKey | null> {
  try {
    const subtle = options.subtle === undefined ? getSubtle() : options.subtle;
    const der = typeof pkcs8Base64 === "string" ? base64Decode(pkcs8Base64) : null;
    if (!subtle || !der || der.byteLength === 0) return null;
    return await subtle.importKey("pkcs8", toArrayBuffer(der), { name: "Ed25519" }, false, ["sign"]);
  } catch {
    return null;
  }
}

export async function signDesktopEncryptionKey(
  rsaPublicJwk: string,
  ed25519PrivateKey: CryptoKey,
  options: Options & Readonly<{ context?: string }> = {},
): Promise<SignDesktopKeyResult> {
  const context = options.context ?? DESKTOP_KEY_CONTEXT;
  const canonical = canonicalRsaJwkBytes(rsaPublicJwk);
  if (!canonical || !validContext(context)) return { ok: false, reason: "malformed" };
  const subtle = options.subtle === undefined ? getSubtle() : options.subtle;
  if (!subtle) return { ok: false, reason: "unavailable" };
  try {
    const bytes = signedBytes(context, canonical);
    const signature = new Uint8Array(await subtle.sign({ name: "Ed25519" }, ed25519PrivateKey, toArrayBuffer(bytes)));
    if (signature.byteLength !== 64) return { ok: false, reason: "sign_failed" };
    return {
      ok: true,
      rsaPublicJwk: new TextDecoder().decode(canonical),
      signature: base64Encode(signature),
      context,
    };
  } catch {
    return { ok: false, reason: "sign_failed" };
  }
}

export async function verifyDesktopEncryptionKey(input: VerifyDesktopKeyInput, options: Options = {}): Promise<VerifyDesktopKeyResult> {
  try {
    if (!input || typeof input !== "object") return { ok: false, reason: "malformed" };
    const canonical = canonicalRsaJwkBytes(input.rsaPublicJwk);
    const signature = typeof input.signature === "string" ? base64Decode(input.signature) : null;
    const signingKey = typeof input.desktopSigningPublicKey === "string" ? base64Decode(input.desktopSigningPublicKey) : null;
    const pin = typeof input.pinnedFingerprint === "string" ? input.pinnedFingerprint.toUpperCase() : "";
    if (!canonical || !validContext(input.context) || !PIN.test(pin)) return { ok: false, reason: "malformed" };
    if (!signature || signature.byteLength !== 64 || !signingKey || signingKey.byteLength !== 32) {
      return { ok: false, reason: "malformed" };
    }
    if (input.context !== DESKTOP_KEY_CONTEXT) return { ok: false, reason: "wrong_context" };
    // The pin comes before the signature: a relay that swaps the signing key
    // can sign anything with its own key, so a good signature proves nothing
    // until the key itself matches what the seller's link carried.
    const actual = await deviceFingerprint(signingKey);
    if (!actual) return { ok: false, reason: "unavailable" };
    if (!timingSafeEqualBytes(utf8Encode(actual), utf8Encode(pin))) {
      return { ok: false, reason: "key_mismatch_with_pin" };
    }
    const subtle = options.subtle === undefined ? getSubtle() : options.subtle;
    if (!subtle) return { ok: false, reason: "unavailable" };
    let publicKey: CryptoKey;
    try {
      publicKey = await subtle.importKey("raw", toArrayBuffer(signingKey), { name: "Ed25519" }, false, ["verify"]);
    } catch {
      return { ok: false, reason: "unavailable" };
    }
    const good = await subtle.verify(
      { name: "Ed25519" },
      publicKey,
      toArrayBuffer(signature),
      toArrayBuffer(signedBytes(input.context, canonical)),
    );
    if (!good) return { ok: false, reason: "bad_signature" };
    return { ok: true, rsaPublicJwk: new TextDecoder().decode(canonical), signingFingerprint: actual };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

// ---------------------------------------------------------------------------
// The proof as it travels through the relay: ONE string "<signature>.<context>".
// The relay (control-plane/connected/key-proof.ts) checks only this FORMAT and
// stores it next to the pairing; the phone judges it. The same shape is
// enforced on both sides so a proof the relay accepts is a proof the phone can
// parse, and a missing proof is its own typed refusal (an old desktop, or a
// relay that strips it, must never look like "all good").
// ---------------------------------------------------------------------------

/** Longest proof string the relay accepts (mirrors MAX_KEY_PROOF_CHARS there). */
export const MAX_DESKTOP_KEY_PROOF_CHARS = 512;
// Signature: base64 or base64url (no "."), then "." and the context (letters, digits, "." "_" "-").
const DESKTOP_KEY_PROOF = /^[A-Za-z0-9+/_-]{16,500}={0,2}\.[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;

export type DesktopKeyProofParts = Readonly<{ signature: string; context: string }>;

/** "<signature>.<context>", or null when the pieces would not survive the relay's format check. */
export function encodeDesktopKeyProof(signature: unknown, context: unknown): string | null {
  if (typeof signature !== "string" || typeof context !== "string") return null;
  const proof = `${signature}.${context}`;
  return parseDesktopKeyProof(proof) ? proof : null;
}

/** Splits a proof at its first "." (a signature never holds one, a context may). Null when malformed. */
export function parseDesktopKeyProof(value: unknown): DesktopKeyProofParts | null {
  if (typeof value !== "string" || value.length > MAX_DESKTOP_KEY_PROOF_CHARS || !DESKTOP_KEY_PROOF.test(value)) {
    return null;
  }
  const dot = value.indexOf(".");
  return { signature: value.slice(0, dot), context: value.slice(dot + 1) };
}

export type VerifyDesktopKeyProofReason = VerifyDesktopKeyReason | "proof_missing";

export type VerifyDesktopKeyProofResult =
  | Extract<VerifyDesktopKeyResult, { ok: true }>
  | Readonly<{ ok: false; reason: VerifyDesktopKeyProofReason }>;

export type VerifyDesktopKeyProofInput = Readonly<{
  /** The RSA key exactly as the relay handed it over. */
  rsaPublicJwk: string;
  /** The proof string from the exchange response: null/undefined/"" when the desktop sent none or the relay stripped it. */
  desktopKeyProof: string | null | undefined;
  /** Raw 32-byte Ed25519 key in base64, as the relay handed it over. */
  desktopSigningPublicKey: string;
  /** "A1B2-C3D4-E5F6-7788" from the link fragment. */
  pinnedFingerprint: string;
}>;

/**
 * What the phone calls after the exchange. proof_missing comes first (nothing to judge), then malformed, then the
 * checks of verifyDesktopEncryptionKey in their fixed order: wrong_context, key_mismatch_with_pin, bad_signature.
 * Never throws.
 */
export async function verifyDesktopKeyProof(
  input: VerifyDesktopKeyProofInput,
  options: Options = {},
): Promise<VerifyDesktopKeyProofResult> {
  try {
    if (!input || typeof input !== "object") return { ok: false, reason: "malformed" };
    const proof = input.desktopKeyProof;
    if (proof === null || proof === undefined || proof === "") return { ok: false, reason: "proof_missing" };
    const parts = parseDesktopKeyProof(proof);
    if (!parts) return { ok: false, reason: "malformed" };
    return await verifyDesktopEncryptionKey(
      {
        rsaPublicJwk: input.rsaPublicJwk,
        signature: parts.signature,
        context: parts.context,
        desktopSigningPublicKey: input.desktopSigningPublicKey,
        pinnedFingerprint: input.pinnedFingerprint,
      },
      options,
    );
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
