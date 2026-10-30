import { base64Decode, base64UrlDecode, bytesToHex, getSubtle, toArrayBuffer } from "./bytes";

// The relay's own identity rules (control-plane/connected/worker.ts validIdentity).
const OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;
const HEX_ID = /^[0-9a-f]{32}$/i;
// Pairing tokens are 32 random bytes in base64url, so exactly 43 characters.
const TOKEN_CHARS = /^[A-Za-z0-9_-]{43}$/;
const MAX_LINK_CHARS = 400;

export type PairingLink = Readonly<{ pairingId: string; pairingToken: string }>;

// Short code both screens show so the seller can compare phone and desktop:
// the first 8 bytes of SHA-256 over the raw Ed25519 public key, as "A1B2-C3D4-E5F6-7788".
// Takes the raw 32 bytes or their base64; anything else gives null.
export async function deviceFingerprint(rawEd25519PublicKey: Uint8Array | string): Promise<string | null> {
  try {
    const raw = typeof rawEd25519PublicKey === "string"
      ? base64Decode(rawEd25519PublicKey)
      : ArrayBuffer.isView(rawEd25519PublicKey)
        ? new Uint8Array(rawEd25519PublicKey.buffer, rawEd25519PublicKey.byteOffset, rawEd25519PublicKey.byteLength)
        : null;
    if (!raw || raw.byteLength !== 32) return null;
    const subtle = getSubtle();
    if (!subtle) return null;
    const digest = new Uint8Array(await subtle.digest("SHA-256", toArrayBuffer(raw)));
    const hex = bytesToHex(digest.subarray(0, 8)).toUpperCase();
    return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}`;
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
