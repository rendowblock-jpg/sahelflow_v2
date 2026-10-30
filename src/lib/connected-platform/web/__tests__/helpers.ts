// Shared fixtures for the web-port tests (not a test file itself).
import { signConnectedBytes } from "../../payload-crypto";
import {
  CONNECTED_CIPHER_ALGORITHM,
  CONNECTED_PROTOCOL_VERSION,
  CONNECTED_SIGNATURE_ALGORITHM,
  canonicalConnectedEnvelopeBytes,
  type ConnectedEnvelope,
} from "../../protocol";
import type { EnvelopeMetadata } from "../canonical";

export const WORKSPACE_ID = "0123456789abcdef0123456789abcdef";
export const INSTALLATION_ID = "fedcba9876543210fedcba9876543210";
export const DEVICE_ID = "device_12345678";
export const NOW = new Date("2026-08-13T18:30:00.000Z");

export function projectionMetadata(over: Partial<EnvelopeMetadata> = {}): EnvelopeMetadata {
  return {
    protocolVersion: CONNECTED_PROTOCOL_VERSION,
    envelopeId: "env_12345678",
    idempotencyKey: "idem_12345678",
    workspaceId: WORKSPACE_ID,
    shopId: "shop_12345678",
    memberId: "member_12345678",
    deviceId: DEVICE_ID,
    installationId: INSTALLATION_ID,
    senderKind: "desktop",
    senderId: INSTALLATION_ID,
    recipientKind: "device",
    recipientId: DEVICE_ID,
    messageType: "projection.dashboard",
    sequence: 4,
    issuedAt: "2026-08-13T18:00:00.000Z",
    expiresAt: "2026-08-13T19:00:00.000Z",
    revocationEpoch: 2,
    cipherAlgorithm: CONNECTED_CIPHER_ALGORITHM,
    encryptionKeyId: "enc_key_12345678",
    signatureAlgorithm: CONNECTED_SIGNATURE_ALGORITHM,
    signingKeyId: "sign_key_12345678",
    ...over,
  };
}

export function commandMetadata(over: Partial<EnvelopeMetadata> = {}): EnvelopeMetadata {
  return projectionMetadata({
    envelopeId: "env_cmd_12345678",
    idempotencyKey: "idem_cmd_12345678",
    senderKind: "device",
    senderId: DEVICE_ID,
    recipientKind: "desktop",
    recipientId: INSTALLATION_ID,
    messageType: "command.comments.write",
    sequence: 9,
    ...over,
  });
}

function plainBytes(base64: string): Uint8Array {
  return new Uint8Array(Buffer.from(base64, "base64"));
}

export async function importPkcs8Signing(pkcs8Base64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("pkcs8", plainBytes(pkcs8Base64), { name: "Ed25519" }, false, ["sign"]);
}

export async function importPkcs8Encryption(pkcs8Base64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "pkcs8",
    plainBytes(pkcs8Base64),
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["decrypt"],
  );
}

// Signs with the NODE implementation so tampered envelopes can carry a valid signature.
export function resign(envelope: ConnectedEnvelope, signerPkcs8Base64: string): ConnectedEnvelope {
  return {
    ...envelope,
    signature: signConnectedBytes(signerPkcs8Base64, canonicalConnectedEnvelopeBytes(envelope)),
  };
}

export function flipBit(base64: string, byteIndex: number): string {
  const raw = Buffer.from(base64, "base64");
  raw[byteIndex] = (raw[byteIndex] ?? 0) ^ 1;
  return raw.toString("base64");
}
