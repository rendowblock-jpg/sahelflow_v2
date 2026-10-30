import { isConnectedEnvelope, type ConnectedEnvelope } from "../protocol";
import {
  base64Decode,
  base64Encode,
  base64UrlDecode,
  concatBytes,
  getSubtle,
  randomBytes,
  timingSafeEqualBytes,
  toArrayBuffer,
  utf8Decode,
  utf8Encode,
} from "./bytes";
import {
  aadDigestHex,
  canonicalAadBytes,
  canonicalEnvelopeBytes,
  envelopeMetadata,
  type EnvelopeMetadata,
} from "./canonical";
import { importSigningPublicKey } from "./keys";

const PAYLOAD_FORMAT = 1;
const AES_KEY_BYTES = 32;
const GCM_IV_BYTES = 12;
const GCM_TAG_BYTES = 16;
const MAX_PLAINTEXT_BYTES = 256 * 1024;
const MAX_CIPHERTEXT_CHARS = 512 * 1024;
const MIN_RSA_MODULUS_BITS = 2048;

function requireSubtle(): SubtleCrypto {
  const subtle = getSubtle();
  if (!subtle) throw new Error("WebCrypto is not available");
  return subtle;
}

async function importRecipientKey(subtle: SubtleCrypto, jwkJson: string): Promise<CryptoKey> {
  let parsed: { kty?: unknown; n?: unknown; e?: unknown };
  try {
    parsed = JSON.parse(jwkJson) as typeof parsed;
  } catch {
    throw new TypeError("Recipient encryption key is not valid JSON");
  }
  if (!parsed || parsed.kty !== "RSA" || typeof parsed.n !== "string" || !parsed.n || typeof parsed.e !== "string" || !parsed.e) {
    throw new TypeError("Recipient encryption key is not RSA");
  }
  // The desktop makes 3072-bit keys; refuse a weak key a tampered relay could hand us.
  if (((base64UrlDecode(parsed.n)?.byteLength ?? 0) * 8) < MIN_RSA_MODULUS_BITS) {
    throw new TypeError("Recipient encryption key is too short");
  }
  return subtle.importKey(
    "jwk",
    { kty: "RSA", n: parsed.n, e: parsed.e },
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"],
  );
}

// Phone -> desktop. Mirrors createConnectedEnvelope: AES-256-GCM over the JSON
// payload with the 21-field AAD, the key wrapped with RSA-OAEP-256, then an
// Ed25519 signature over the 23 canonical fields. WebCrypto returns ciphertext
// with the tag appended; the wire format keeps the tag in its own field.
export async function sealEnvelopeWeb(
  metadata: EnvelopeMetadata,
  payload: unknown,
  recipientEncryptionPublicKeyJwk: string,
  senderSigningPrivateKey: CryptoKey,
): Promise<ConnectedEnvelope> {
  const serialized = JSON.stringify(payload);
  if (serialized === undefined) throw new TypeError("Connected payload is not JSON serializable");
  const plaintext = utf8Encode(serialized);
  if (plaintext.byteLength > MAX_PLAINTEXT_BYTES) {
    throw new RangeError("Connected payload exceeds the encrypted payload limit");
  }
  const subtle = requireSubtle();
  const recipient = await importRecipientKey(subtle, recipientEncryptionPublicKeyJwk);
  const cleanMetadata = envelopeMetadata(metadata);
  const aad = canonicalAadBytes(cleanMetadata);
  const contentKeyBytes = randomBytes(AES_KEY_BYTES);
  const iv = randomBytes(GCM_IV_BYTES);
  try {
    const contentKey = await subtle.importKey("raw", toArrayBuffer(contentKeyBytes), { name: "AES-GCM" }, false, ["encrypt"]);
    const sealed = new Uint8Array(await subtle.encrypt(
      { name: "AES-GCM", iv: toArrayBuffer(iv), additionalData: toArrayBuffer(aad), tagLength: GCM_TAG_BYTES * 8 },
      contentKey,
      toArrayBuffer(plaintext),
    ));
    const ciphertext = sealed.subarray(0, sealed.length - GCM_TAG_BYTES);
    const tag = sealed.subarray(sealed.length - GCM_TAG_BYTES);
    const wrappedKey = new Uint8Array(await subtle.encrypt({ name: "RSA-OAEP" }, recipient, toArrayBuffer(contentKeyBytes)));
    const inner = JSON.stringify({
      v: PAYLOAD_FORMAT,
      wrappedKey: base64Encode(wrappedKey),
      iv: base64Encode(iv),
      ciphertext: base64Encode(ciphertext),
      tag: base64Encode(tag),
    });
    const unsigned: Omit<ConnectedEnvelope, "signature"> = {
      ...cleanMetadata,
      aadDigest: await aadDigestHex(aad),
      ciphertext: base64Encode(utf8Encode(inner)),
    };
    const signature = base64Encode(new Uint8Array(await subtle.sign(
      { name: "Ed25519" },
      senderSigningPrivateKey,
      toArrayBuffer(canonicalEnvelopeBytes(unsigned)),
    )));
    const envelope: ConnectedEnvelope = { ...unsigned, signature };
    if (!isConnectedEnvelope(envelope)) throw new Error("Connected envelope format is invalid");
    return envelope;
  } finally {
    contentKeyBytes.fill(0);
    plaintext.fill(0);
  }
}

export type OpenFailureReason =
  | "oversize"
  | "malformed"
  | "expired"
  | "bad_signing_key"
  | "bad_signature"
  | "wrong_recipient"
  | "wrong_device"
  | "wrong_sequence"
  | "stale_sequence"
  | "bad_aad"
  | "malformed_ciphertext"
  | "wrong_key"
  | "decrypt_failed"
  | "bad_payload"
  | "unavailable";

export type OpenEnvelopeResult<T> =
  | Readonly<{ ok: true; envelope: ConnectedEnvelope; payload: T }>
  | Readonly<{ ok: false; reason: OpenFailureReason }>;

// Checked after the signature, so they are about an authentic envelope.
// sequence is exact; minSequence is the lowest sequence still acceptable
// (last accepted + 1), which is the replay floor.
export type OpenExpectations = Readonly<{
  recipientId?: string;
  deviceId?: string;
  sequence?: number;
  minSequence?: number;
}>;

export type OpenOptions = Readonly<{ now?: Date | number; expect?: OpenExpectations }>;

const refuse = (reason: OpenFailureReason): OpenEnvelopeResult<never> => ({ ok: false, reason });

type SealedParts = Readonly<{ wrappedKey: Uint8Array; iv: Uint8Array; ciphertext: Uint8Array; tag: Uint8Array }>;

function parseSealed(ciphertext: string): SealedParts | null {
  const outer = base64Decode(ciphertext);
  const text = outer ? utf8Decode(outer) : null;
  if (text === null) return null;
  let sealed: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    sealed = parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  if (sealed.v !== PAYLOAD_FORMAT) return null;
  const decoded = [sealed.wrappedKey, sealed.iv, sealed.ciphertext, sealed.tag].map(
    (part) => (typeof part === "string" ? base64Decode(part) : null),
  );
  const [wrappedKey, iv, body, tag] = decoded;
  if (!wrappedKey || !iv || !body || !tag) return null;
  if (iv.byteLength !== GCM_IV_BYTES || tag.byteLength !== GCM_TAG_BYTES) return null;
  return { wrappedKey, iv, ciphertext: body, tag };
}

function unmetExpectation(envelope: ConnectedEnvelope, expect: OpenExpectations | undefined): OpenFailureReason | null {
  if (!expect) return null;
  if (expect.recipientId !== undefined && envelope.recipientId !== expect.recipientId) return "wrong_recipient";
  if (expect.deviceId !== undefined && envelope.deviceId !== expect.deviceId) return "wrong_device";
  if (expect.sequence !== undefined && envelope.sequence !== expect.sequence) return "wrong_sequence";
  if (expect.minSequence !== undefined && envelope.sequence < expect.minSequence) return "stale_sequence";
  return null;
}

async function signatureIsValid(subtle: SubtleCrypto, key: CryptoKey, signature: string, message: Uint8Array): Promise<boolean> {
  const bytes = base64Decode(signature);
  if (!bytes) return false;
  try {
    return (await subtle.verify({ name: "Ed25519" }, key, toArrayBuffer(bytes), toArrayBuffer(message))) === true;
  } catch {
    return false;
  }
}

async function openChecked<T>(
  value: unknown,
  senderSigningPublicKey: string,
  recipientKey: CryptoKey,
  options: OpenOptions,
): Promise<OpenEnvelopeResult<T>> {
  const claimed = value && typeof value === "object" ? (value as { ciphertext?: unknown }).ciphertext : undefined;
  if (typeof claimed === "string" && claimed.length > MAX_CIPHERTEXT_CHARS) return refuse("oversize");
  if (!isConnectedEnvelope(value)) return refuse("malformed");
  const envelope = value;
  const given = options.now instanceof Date ? options.now.getTime() : options.now;
  const nowMs = typeof given === "number" && Number.isFinite(given) ? given : Date.now();
  if (Date.parse(envelope.expiresAt) <= nowMs) return refuse("expired");

  const subtle = requireSubtle();
  const verifyKey = await importSigningPublicKey(senderSigningPublicKey, { subtle });
  if (!verifyKey) return refuse("bad_signing_key");
  // The signature is checked before anything is decrypted.
  if (!(await signatureIsValid(subtle, verifyKey, envelope.signature, canonicalEnvelopeBytes(envelope)))) {
    return refuse("bad_signature");
  }
  const unmet = unmetExpectation(envelope, options.expect);
  if (unmet) return refuse(unmet);

  const aad = canonicalAadBytes(envelopeMetadata(envelope));
  const digest = await aadDigestHex(aad);
  if (!timingSafeEqualBytes(utf8Encode(digest), utf8Encode(envelope.aadDigest))) return refuse("bad_aad");

  const sealed = parseSealed(envelope.ciphertext);
  if (!sealed) return refuse("malformed_ciphertext");
  if (sealed.ciphertext.byteLength > MAX_PLAINTEXT_BYTES) return refuse("oversize");

  let contentKeyBytes: Uint8Array;
  try {
    contentKeyBytes = new Uint8Array(await subtle.decrypt({ name: "RSA-OAEP" }, recipientKey, toArrayBuffer(sealed.wrappedKey)));
  } catch {
    return refuse("wrong_key");
  }
  try {
    if (contentKeyBytes.byteLength !== AES_KEY_BYTES) return refuse("malformed_ciphertext");
    let plaintext: Uint8Array;
    try {
      const contentKey = await subtle.importKey("raw", toArrayBuffer(contentKeyBytes), { name: "AES-GCM" }, false, ["decrypt"]);
      plaintext = new Uint8Array(await subtle.decrypt(
        { name: "AES-GCM", iv: toArrayBuffer(sealed.iv), additionalData: toArrayBuffer(aad), tagLength: GCM_TAG_BYTES * 8 },
        contentKey,
        toArrayBuffer(concatBytes(sealed.ciphertext, sealed.tag)),
      ));
    } catch {
      return refuse("decrypt_failed");
    }
    try {
      if (plaintext.byteLength > MAX_PLAINTEXT_BYTES) return refuse("oversize");
      const text = utf8Decode(plaintext);
      if (text === null) return refuse("bad_payload");
      try {
        return { ok: true, envelope, payload: JSON.parse(text) as T };
      } catch {
        return refuse("bad_payload");
      }
    } finally {
      plaintext.fill(0);
    }
  } finally {
    contentKeyBytes.fill(0);
  }
}

// Phone opens a message sealed to its own RSA key. Never throws on bad input:
// every refusal is a typed reason. Order: size, format, expiry, signature,
// caller expectations, AAD digest, sealed parts, key unwrap, AES-GCM, payload.
export async function openEnvelopeWeb<T = unknown>(
  value: unknown,
  senderSigningPublicKey: string,
  recipientEncryptionPrivateKey: CryptoKey,
  options: OpenOptions = {},
): Promise<OpenEnvelopeResult<T>> {
  try {
    return await openChecked<T>(value, senderSigningPublicKey, recipientEncryptionPrivateKey, options);
  } catch {
    return refuse("unavailable");
  }
}
