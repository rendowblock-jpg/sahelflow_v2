import "server-only";

import {
  constants,
  createCipheriv,
  createDecipheriv,
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  privateDecrypt,
  publicEncrypt,
  randomBytes,
  sign,
  verify,
  type JsonWebKey as NodeJsonWebKey,
} from "node:crypto";

const PAYLOAD_FORMAT = 1 as const;
const AES_KEY_BYTES = 32;
const GCM_IV_BYTES = 12;
const GCM_TAG_BYTES = 16;
const MAX_PLAINTEXT_BYTES = 256 * 1024;

export type ConnectedKeyPair = Readonly<{
  signingPublicKey: string;
  signingPrivateKeyPkcs8: string;
  encryptionPublicKeyJwk: string;
  encryptionPrivateKeyPkcs8: string;
}>;

type SealedPayload = Readonly<{
  v: typeof PAYLOAD_FORMAT;
  wrappedKey: string;
  iv: string;
  ciphertext: string;
  tag: string;
}>;

function base64UrlToBase64(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
}

function exactJson(value: unknown): string {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new TypeError("Connected payload is not JSON serializable");
  return serialized;
}

export function generateConnectedKeyPair(): ConnectedKeyPair {
  const signing = generateKeyPairSync("ed25519");
  const signingJwk = signing.publicKey.export({ format: "jwk" });
  if (signingJwk.kty !== "OKP" || signingJwk.crv !== "Ed25519" || !signingJwk.x) {
    throw new Error("Generated Ed25519 public key is invalid");
  }
  const encryption = generateKeyPairSync("rsa", {
    modulusLength: 3072,
    publicExponent: 0x10001,
  });
  return Object.freeze({
    signingPublicKey: base64UrlToBase64(signingJwk.x),
    signingPrivateKeyPkcs8: signing.privateKey
      .export({ format: "der", type: "pkcs8" })
      .toString("base64"),
    encryptionPublicKeyJwk: JSON.stringify(
      encryption.publicKey.export({ format: "jwk" }),
    ),
    encryptionPrivateKeyPkcs8: encryption.privateKey
      .export({ format: "der", type: "pkcs8" })
      .toString("base64"),
  });
}

export function connectedAadDigest(aad: Uint8Array): string {
  return createHash("sha256").update(aad).digest("hex");
}

export function encryptConnectedPayload(
  payload: unknown,
  recipientPublicKeyJwk: string,
  aad: Uint8Array,
): Readonly<{ ciphertext: string; aadDigest: string }> {
  const plaintext = Buffer.from(exactJson(payload), "utf8");
  if (plaintext.byteLength > MAX_PLAINTEXT_BYTES) {
    throw new RangeError("Connected payload exceeds the encrypted payload limit");
  }
  let parsedJwk: NodeJsonWebKey;
  try {
    parsedJwk = JSON.parse(recipientPublicKeyJwk) as NodeJsonWebKey;
  } catch {
    throw new TypeError("Recipient encryption key is not valid JSON");
  }
  if (parsedJwk.kty !== "RSA" || !parsedJwk.n || !parsedJwk.e) {
    throw new TypeError("Recipient encryption key is not RSA");
  }
  const recipient = createPublicKey({ key: parsedJwk, format: "jwk" });
  const contentKey = randomBytes(AES_KEY_BYTES);
  const iv = randomBytes(GCM_IV_BYTES);
  try {
    const cipher = createCipheriv("aes-256-gcm", contentKey, iv, {
      authTagLength: GCM_TAG_BYTES,
    });
    cipher.setAAD(Buffer.from(aad));
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    const wrappedKey = publicEncrypt(
      {
        key: recipient,
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256",
      },
      contentKey,
    );
    const sealed: SealedPayload = {
      v: PAYLOAD_FORMAT,
      wrappedKey: wrappedKey.toString("base64"),
      iv: iv.toString("base64"),
      ciphertext: encrypted.toString("base64"),
      tag: tag.toString("base64"),
    };
    return Object.freeze({
      ciphertext: Buffer.from(JSON.stringify(sealed), "utf8").toString("base64"),
      aadDigest: connectedAadDigest(aad),
    });
  } finally {
    contentKey.fill(0);
    plaintext.fill(0);
  }
}

export function decryptConnectedPayload<T>(
  ciphertext: string,
  recipientPrivateKeyPkcs8: string,
  aad: Uint8Array,
  expectedAadDigest: string,
): T {
  if (connectedAadDigest(aad) !== expectedAadDigest) {
    throw new Error("Connected payload associated-data digest does not match");
  }
  let sealed: SealedPayload;
  try {
    sealed = JSON.parse(Buffer.from(ciphertext, "base64").toString("utf8")) as SealedPayload;
  } catch {
    throw new Error("Connected ciphertext envelope is invalid");
  }
  if (
    sealed.v !== PAYLOAD_FORMAT ||
    typeof sealed.wrappedKey !== "string" ||
    typeof sealed.iv !== "string" ||
    typeof sealed.ciphertext !== "string" ||
    typeof sealed.tag !== "string"
  ) {
    throw new Error("Connected ciphertext envelope is invalid");
  }
  const privateKey = createPrivateKey({
    key: Buffer.from(recipientPrivateKeyPkcs8, "base64"),
    format: "der",
    type: "pkcs8",
  });
  const contentKey = privateDecrypt(
    {
      key: privateKey,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    Buffer.from(sealed.wrappedKey, "base64"),
  );
  try {
    if (contentKey.byteLength !== AES_KEY_BYTES) {
      throw new Error("Connected content key is invalid");
    }
    const iv = Buffer.from(sealed.iv, "base64");
    const tag = Buffer.from(sealed.tag, "base64");
    if (iv.byteLength !== GCM_IV_BYTES || tag.byteLength !== GCM_TAG_BYTES) {
      throw new Error("Connected ciphertext parameters are invalid");
    }
    const decipher = createDecipheriv("aes-256-gcm", contentKey, iv, {
      authTagLength: GCM_TAG_BYTES,
    });
    decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(sealed.ciphertext, "base64")),
      decipher.final(),
    ]);
    try {
      return JSON.parse(plaintext.toString("utf8")) as T;
    } finally {
      plaintext.fill(0);
    }
  } finally {
    contentKey.fill(0);
  }
}

export function signConnectedBytes(
  privateKeyPkcs8: string,
  message: Uint8Array,
): string {
  const privateKey = createPrivateKey({
    key: Buffer.from(privateKeyPkcs8, "base64"),
    format: "der",
    type: "pkcs8",
  });
  return sign(null, Buffer.from(message), privateKey).toString("base64");
}

export function verifyConnectedBytes(
  publicKeyRawBase64: string,
  signature: string,
  message: Uint8Array,
): boolean {
  const raw = Buffer.from(publicKeyRawBase64, "base64");
  if (raw.byteLength !== 32) return false;
  const spkiPrefix = Buffer.from("302a300506032b6570032100", "hex");
  const publicKey = createPublicKey({
    key: Buffer.concat([spkiPrefix, raw]),
    format: "der",
    type: "spki",
  });
  return verify(null, Buffer.from(message), publicKey, Buffer.from(signature, "base64"));
}
