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
