import { base64Decode, base64Encode, getSubtle, toArrayBuffer } from "./bytes";

export type DeviceKeys = Readonly<{ signing: CryptoKeyPair; encryption: CryptoKeyPair }>;

// Field names are the ones POST /v1/pairings/exchange reads.
export type DevicePublicKeys = Readonly<{ signingPublicKey: string; encryptionPublicKey: string }>;

export type KeygenFailureReason = "webcrypto_unavailable" | "ed25519_unsupported" | "keygen_failed";

export type GenerateDeviceKeysResult =
  | Readonly<{ ok: true; keys: DeviceKeys; publicKeys: DevicePublicKeys }>
  | Readonly<{ ok: false; reason: KeygenFailureReason }>;

// `subtle` is injectable for tests; null means "no WebCrypto at all".
export type KeyOptions = Readonly<{ subtle?: SubtleCrypto | null }>;

const ED25519 = { name: "Ed25519" } as const;
const RSA_PUBLIC_EXPONENT = new Uint8Array([1, 0, 1]);

function resolveSubtle(subtle: SubtleCrypto | null | undefined): SubtleCrypto | null {
  return subtle === undefined ? getSubtle() : subtle;
}

// True only when Ed25519 really generates, signs and verifies. Older Android
// WebViews lack it: the caller shows an "unsupported" state (a JS fallback would
// need a dependency and is not built). Never throws.
export async function supportsEd25519(subtle?: SubtleCrypto | null): Promise<boolean> {
  try {
    const crypto = resolveSubtle(subtle);
    if (!crypto) return false;
    const pair = (await crypto.generateKey(ED25519, false, ["sign", "verify"])) as CryptoKeyPair;
    const message = new Uint8Array([1, 2, 3]);
    const signature = await crypto.sign(ED25519, pair.privateKey, message);
    return (await crypto.verify(ED25519, pair.publicKey, signature, message)) === true;
  } catch {
    return false;
  }
}

// Public halves exactly as the relay stores them: raw 32-byte Ed25519 key in
// base64, and the RSA key as a JSON string holding only kty, n and e.
export async function exportPublicKeys(keys: DeviceKeys, options: KeyOptions = {}): Promise<DevicePublicKeys> {
  const subtle = resolveSubtle(options.subtle);
  if (!subtle) throw new Error("WebCrypto is not available");
  const raw = new Uint8Array(await subtle.exportKey("raw", keys.signing.publicKey));
  const jwk = await subtle.exportKey("jwk", keys.encryption.publicKey);
  if (jwk.kty !== "RSA" || !jwk.n || !jwk.e) throw new Error("Generated RSA public key is invalid");
  return Object.freeze({
    signingPublicKey: base64Encode(raw),
    encryptionPublicKey: JSON.stringify({ kty: "RSA", n: jwk.n, e: jwk.e }),
  });
}

// Private keys are created with extractable=false: the browser can use them but
// no script can read them out. Where they are stored is another slice.
export async function generateDeviceKeys(options: KeyOptions = {}): Promise<GenerateDeviceKeysResult> {
  const subtle = resolveSubtle(options.subtle);
  if (!subtle) return { ok: false, reason: "webcrypto_unavailable" };
  if (!(await supportsEd25519(subtle))) return { ok: false, reason: "ed25519_unsupported" };
  try {
    const signing = (await subtle.generateKey(ED25519, false, ["sign", "verify"])) as CryptoKeyPair;
    const encryption = (await subtle.generateKey(
      { name: "RSA-OAEP", modulusLength: 3072, publicExponent: RSA_PUBLIC_EXPONENT, hash: "SHA-256" },
      false,
      ["encrypt", "decrypt"],
    )) as CryptoKeyPair;
    const keys: DeviceKeys = Object.freeze({ signing, encryption });
    return { ok: true, keys, publicKeys: await exportPublicKeys(keys, { subtle }) };
  } catch {
    return { ok: false, reason: "keygen_failed" };
  }
}

export function buildPairingExchangeBody(pairingId: string, pairingToken: string, publicKeys: DevicePublicKeys) {
  return {
    pairingId,
    pairingToken,
    signingPublicKey: publicKeys.signingPublicKey,
    encryptionPublicKey: publicKeys.encryptionPublicKey,
  };
}

// Raw Ed25519 public key (base64) -> verify-only key. null unless it is exactly 32 bytes.
export async function importSigningPublicKey(rawBase64: string, options: KeyOptions = {}): Promise<CryptoKey | null> {
  try {
    const subtle = resolveSubtle(options.subtle);
    const raw = base64Decode(rawBase64);
    if (!subtle || !raw || raw.byteLength !== 32) return null;
    return await subtle.importKey("raw", toArrayBuffer(raw), ED25519, false, ["verify"]);
  } catch {
    return null;
  }
}
