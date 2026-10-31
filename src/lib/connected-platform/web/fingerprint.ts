import { base64Decode, base64UrlDecode, bytesToHex, concatBytes, getSubtle, toArrayBuffer, utf8Encode } from "./bytes";

// The relay's own identity rules (control-plane/connected/worker.ts validIdentity).
const OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;
const HEX_ID = /^[0-9a-f]{32}$/i;
// Pairing tokens are 32 random bytes in base64url, so exactly 43 characters.
const TOKEN_CHARS = /^[A-Za-z0-9_-]{43}$/;
const MAX_LINK_CHARS = 400;

export type PairingLink = Readonly<{ pairingId: string; pairingToken: string }>;

const BASE64URL = /^[A-Za-z0-9_-]+$/;
// Same cap the desktop puts on the relay's key string; real 3072-bit keys are ~600 characters.
const MAX_JWK_CHARS = 4096;
const MAX_N_CHARS = 2048;
const MAX_E_CHARS = 16;
const PAIRING_CODE_LABEL = "sahelflow.pairing-code.v1";

// Raw 32 Ed25519 bytes from raw bytes or base64; anything else gives null.
function rawSigningKey(value: unknown): Uint8Array | null {
  const raw = typeof value === "string"
    ? base64Decode(value)
    : ArrayBuffer.isView(value)
      ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
      : null;
  return raw && raw.byteLength === 32 ? raw : null;
}

// First 8 bytes of a digest as "A1B2-C3D4-E5F6-7788".
function groupedCode(digest: Uint8Array): string {
  const hex = bytesToHex(digest.subarray(0, 8)).toUpperCase();
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}`;
}

// Short code for the DESKTOP's own signing key (the pin in the pairing link):
// the first 8 bytes of SHA-256 over the raw Ed25519 public key.
// Takes the raw 32 bytes or their base64; anything else gives null.
export async function deviceFingerprint(rawEd25519PublicKey: Uint8Array | string): Promise<string | null> {
  try {
    const raw = rawSigningKey(rawEd25519PublicKey);
    const subtle = getSubtle();
    if (!raw || !subtle) return null;
    return groupedCode(new Uint8Array(await subtle.digest("SHA-256", toArrayBuffer(raw))));
  } catch {
    return null;
  }
}

// Only kty, n and e of an RSA public JWK matter. Text or object; null when it is not a plain RSA key.
function rsaMembers(jwk: unknown): Readonly<{ n: string; e: string }> | null {
  let value: unknown = jwk;
  if (typeof value === "string") {
    if (value.length > MAX_JWK_CHARS) return null;
    try { value = JSON.parse(value); } catch { return null; }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { kty, n, e } = value as Record<string, unknown>;
  if (kty !== "RSA" || typeof n !== "string" || typeof e !== "string") return null;
  if (n.length > MAX_N_CHARS || e.length > MAX_E_CHARS || !BASE64URL.test(n) || !BASE64URL.test(e)) return null;
  return { n, e };
}

function lengthPrefixed(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(2 + bytes.byteLength);
  out[0] = bytes.byteLength >> 8;
  out[1] = bytes.byteLength & 255;
  out.set(bytes, 2);
  return out;
}

// The code the seller compares between phone and desktop. It covers BOTH keys
// the phone sends through the (untrusted) relay: the Ed25519 signing key and
// the RSA key every reply is sealed to. SHA-256 over fixed fields, each with a
// 2-byte length in front: label, 32 signing bytes, then "RSA", n, e (nothing
// else in the JWK counts, so key_ops or member order cannot change the code).
// 8 bytes shown, like the pin. Null for any malformed input; never throws.
export async function pairingCode(rawEd25519PublicKey: Uint8Array | string, encryptionPublicKeyJwk: unknown): Promise<string | null> {
  try {
    const raw = rawSigningKey(rawEd25519PublicKey);
    const rsa = rsaMembers(encryptionPublicKeyJwk);
    const subtle = getSubtle();
    if (!raw || !rsa || !subtle) return null;
    const bytes = concatBytes(
      lengthPrefixed(utf8Encode(PAIRING_CODE_LABEL)),
      lengthPrefixed(raw),
      lengthPrefixed(utf8Encode("RSA")),
      lengthPrefixed(utf8Encode(rsa.n)),
      lengthPrefixed(utf8Encode(rsa.e)),
    );
    return groupedCode(new Uint8Array(await subtle.digest("SHA-256", toArrayBuffer(bytes))));
  } catch {
    return null;
  }
}

// Parses location.hash of the form "#p=<pairingId>.<token>". Strict: the whole
// string must be understood, otherwise null. Never throws.
export function parsePairingLink(hash: string): PairingLink | null {
  if (typeof hash !== "string" || hash.length > MAX_LINK_CHARS || !hash.startsWith("#p=")) return null;
  const body = hash.slice(3);
  const dot = body.indexOf(".");
  if (dot < 0 || body.indexOf(".", dot + 1) >= 0) return null;
  const pairingId = body.slice(0, dot);
  const pairingToken = body.slice(dot + 1);
  if (!HEX_ID.test(pairingId) && !OPAQUE_ID.test(pairingId)) return null;
  if (!TOKEN_CHARS.test(pairingToken)) return null;
  if (base64UrlDecode(pairingToken)?.byteLength !== 32) return null;
  return Object.freeze({ pairingId, pairingToken });
}

// The desktop builds the fragment with this, so it can never differ from the parser.
export function formatPairingHash(pairingId: string, pairingToken: string): string | null {
  const hash = `#p=${pairingId}.${pairingToken}`;
  return parsePairingLink(hash) ? hash : null;
}
