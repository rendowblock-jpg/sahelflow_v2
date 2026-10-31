// Web Push payload encryption: RFC 8291 (message encryption) over the
// RFC 8188 aes128gcm content coding. node:crypto only, no network, no state.
import { createCipheriv, createECDH, hkdfSync, randomBytes } from "node:crypto";

export const RECORD_SIZE = 4096;
export const MAX_BODY_BYTES = 4096;
// The record plaintext (data, 0x02 delimiter, zero padding) is always this
// long, so the push service cannot tell one kind of message from another.
export const PADDED_RECORD_BYTES = 256;

const SALT_BYTES = 16;
const TAG_BYTES = 16;
const PUBLIC_KEY_BYTES = 65;
const PRIVATE_KEY_BYTES = 32;
const AUTH_SECRET_BYTES = 16;
export const HEADER_BYTES = SALT_BYTES + 4 + 1 + PUBLIC_KEY_BYTES;

export type EncryptErrorCode =
  | "bad_public_key"
  | "bad_private_key"
  | "bad_auth_secret"
  | "bad_salt"
  | "bad_option"
  | "too_large";

// Messages are fixed text on purpose: they never carry key material.
export class EncryptError extends Error {
  readonly code: EncryptErrorCode;

  constructor(code: EncryptErrorCode, message: string) {
    super(message);
    this.name = "EncryptError";
    this.code = code;
  }
}

export type ContentKeyInput = {
  asPrivate: Uint8Array;
  uaPublic: Uint8Array;
  authSecret: Uint8Array;
  salt: Uint8Array;
};

export type ContentKeys = {
  asPublic: Buffer;
  ecdhSecret: Buffer;
  ikm: Buffer;
  cek: Buffer;
  nonce: Buffer;
};

export type EncryptInput = {
  plaintext: Uint8Array;
  /** The browser's p256dh: 65-byte uncompressed P-256 point. */
  uaPublic: Uint8Array;
  /** The browser's auth secret: 16 bytes. */
  authSecret: Uint8Array;
  /** Test hook: the RFC vector's ephemeral key. Production leaves it out. */
  asKeyPair?: { privateKey: Uint8Array };
  /** Test hook: the RFC vector's salt. Production leaves it out. */
  salt?: Uint8Array;
  /**
   * Length of data + 0x02 delimiter + zero padding. Default 256.
   * 0 switches padding off (only the RFC vector needs that).
   */
  padTo?: number;
};

function asBuffer(bytes: Uint8Array): Buffer {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function hkdf(ikm: Buffer, salt: Buffer, info: Buffer, length: number): Buffer {
  return Buffer.from(hkdfSync("sha256", ikm, salt, info, length));
}

// Exported so the RFC appendix A intermediate values can be checked.
export function deriveContentKeys(input: ContentKeyInput): ContentKeys {
  if (input.uaPublic.length !== PUBLIC_KEY_BYTES || input.uaPublic[0] !== 0x04) {
    throw new EncryptError("bad_public_key", "Browser public key must be a 65-byte uncompressed P-256 point.");
  }
  if (input.authSecret.length !== AUTH_SECRET_BYTES) {
    throw new EncryptError("bad_auth_secret", "Auth secret must be 16 bytes.");
  }
  if (input.salt.length !== SALT_BYTES) {
    throw new EncryptError("bad_salt", "Salt must be 16 bytes.");
  }
  if (input.asPrivate.length !== PRIVATE_KEY_BYTES) {
    throw new EncryptError("bad_private_key", "Sender private key must be 32 bytes.");
  }
  const uaPublic = asBuffer(input.uaPublic);
  const authSecret = asBuffer(input.authSecret);
  const salt = asBuffer(input.salt);

  const ecdh = createECDH("prime256v1");
  try {
    ecdh.setPrivateKey(asBuffer(input.asPrivate));
  } catch {
    throw new EncryptError("bad_private_key", "Sender private key is not valid for P-256.");
  }
  const asPublic = ecdh.getPublicKey();
  let ecdhSecret: Buffer;
  try {
    ecdhSecret = ecdh.computeSecret(uaPublic);
  } catch {
    throw new EncryptError("bad_public_key", "Browser public key is not a point on P-256.");
  }

  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0", "latin1"), uaPublic, asPublic]);
  const ikm = hkdf(ecdhSecret, authSecret, keyInfo, 32);
  const cek = hkdf(ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0", "latin1"), 16);
  const nonce = hkdf(ikm, salt, Buffer.from("Content-Encoding: nonce\0", "latin1"), 12);
  return { asPublic, ecdhSecret, ikm, cek, nonce };
}

function newEphemeralPrivateKey(): Buffer {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const raw = ecdh.getPrivateKey();
  // Left-pad in case a runtime drops leading zero bytes.
  return raw.length === PRIVATE_KEY_BYTES
    ? raw
    : Buffer.concat([Buffer.alloc(PRIVATE_KEY_BYTES - raw.length), raw]);
}

/** Returns the request body: 86-byte header, then one encrypted record. */
export function encryptPayload(input: EncryptInput): Buffer {
  const padTo = input.padTo === undefined ? PADDED_RECORD_BYTES : input.padTo;
  if (!Number.isInteger(padTo) || padTo < 0) {
    throw new EncryptError("bad_option", "padTo must be a whole number of bytes, 0 or more.");
  }
  const data = input.plaintext;
  const blockLength = padTo === 0 ? data.length + 1 : padTo;
  if (
    data.length + 1 > blockLength ||
    HEADER_BYTES + blockLength + TAG_BYTES > MAX_BODY_BYTES
  ) {
    throw new EncryptError("too_large", "Payload does not fit one push record.");
  }

  const salt = input.salt ?? randomBytes(SALT_BYTES);
  const asPrivate = input.asKeyPair ? input.asKeyPair.privateKey : newEphemeralPrivateKey();
  const keys = deriveContentKeys({
    asPrivate,
    uaPublic: input.uaPublic,
    authSecret: input.authSecret,
    salt,
  });

  // RFC 8188: data, then 0x02 (last record), then zeros. Buffer.alloc zero-fills.
  const block = Buffer.alloc(blockLength);
  block.set(data, 0);
  block[data.length] = 0x02;

  const cipher = createCipheriv("aes-128-gcm", keys.cek, keys.nonce, {
    authTagLength: TAG_BYTES,
  });
  const encrypted = Buffer.concat([cipher.update(block), cipher.final(), cipher.getAuthTag()]);

  const header = Buffer.alloc(HEADER_BYTES);
  header.set(salt, 0);
  header.writeUInt32BE(RECORD_SIZE, SALT_BYTES);
  header[SALT_BYTES + 4] = PUBLIC_KEY_BYTES;
  header.set(keys.asPublic, SALT_BYTES + 5);
  return Buffer.concat([header, encrypted]);
}
