export const CONNECTED_PROTOCOL_VERSION = 1 as const;
export const CONNECTED_CIPHER_ALGORITHM = "rsa-oaep-256+aes-256-gcm-v1" as const;
export const CONNECTED_SIGNATURE_ALGORITHM = "ed25519-v1" as const;

const OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;
const HEX_ID = /^[0-9a-f]{32}$/i;
const HEX_DIGEST = /^[0-9a-f]{64}$/;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const MESSAGE_TYPE = /^[a-z][a-z0-9._-]{2,95}$/;
const MAX_CIPHERTEXT_CHARS = 512 * 1024;

export type ConnectedSenderKind = "desktop" | "device";
export type ConnectedRecipientKind = "desktop" | "device";

export interface ConnectedEnvelope {
  protocolVersion: typeof CONNECTED_PROTOCOL_VERSION;
  envelopeId: string;
  idempotencyKey: string;
  workspaceId: string;
  shopId: string;
  memberId: string;
  deviceId: string;
  installationId: string;
  senderKind: ConnectedSenderKind;
  senderId: string;
  recipientKind: ConnectedRecipientKind;
  recipientId: string;
  messageType: string;
  sequence: number;
  issuedAt: string;
  expiresAt: string;
  revocationEpoch: number;
  cipherAlgorithm: typeof CONNECTED_CIPHER_ALGORITHM;
  encryptionKeyId: string;
  aadDigest: string;
  ciphertext: string;
  signatureAlgorithm: typeof CONNECTED_SIGNATURE_ALGORITHM;
  signingKeyId: string;
  signature: string;
}

function validOpaqueId(value: unknown): value is string {
  return typeof value === "string" && OPAQUE_ID.test(value);
}

function validIdentity(value: unknown): value is string {
  return typeof value === "string" && (HEX_ID.test(value) || OPAQUE_ID.test(value));
}

function validIso(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function isConnectedEnvelope(value: unknown): value is ConnectedEnvelope {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const envelope = value as Partial<ConnectedEnvelope>;
  return (
    envelope.protocolVersion === CONNECTED_PROTOCOL_VERSION &&
    validOpaqueId(envelope.envelopeId) &&
    validOpaqueId(envelope.idempotencyKey) &&
    validIdentity(envelope.workspaceId) &&
    validIdentity(envelope.shopId) &&
    validIdentity(envelope.memberId) &&
    validIdentity(envelope.deviceId) &&
    validIdentity(envelope.installationId) &&
    (envelope.senderKind === "desktop" || envelope.senderKind === "device") &&
    validIdentity(envelope.senderId) &&
    (envelope.recipientKind === "desktop" || envelope.recipientKind === "device") &&
    validIdentity(envelope.recipientId) &&
    typeof envelope.messageType === "string" &&
    MESSAGE_TYPE.test(envelope.messageType) &&
    Number.isSafeInteger(envelope.sequence) &&
    (envelope.sequence ?? -1) >= 0 &&
    validIso(envelope.issuedAt) &&
    validIso(envelope.expiresAt) &&
    Date.parse(envelope.expiresAt) > Date.parse(envelope.issuedAt) &&
    Number.isSafeInteger(envelope.revocationEpoch) &&
    (envelope.revocationEpoch ?? -1) >= 0 &&
    envelope.cipherAlgorithm === CONNECTED_CIPHER_ALGORITHM &&
    validOpaqueId(envelope.encryptionKeyId) &&
    typeof envelope.aadDigest === "string" &&
    HEX_DIGEST.test(envelope.aadDigest) &&
    typeof envelope.ciphertext === "string" &&
    envelope.ciphertext.length > 0 &&
    envelope.ciphertext.length <= MAX_CIPHERTEXT_CHARS &&
    BASE64.test(envelope.ciphertext) &&
    envelope.signatureAlgorithm === CONNECTED_SIGNATURE_ALGORITHM &&
    validOpaqueId(envelope.signingKeyId) &&
    typeof envelope.signature === "string" &&
    envelope.signature.length >= 40 &&
    envelope.signature.length <= 256 &&
    BASE64.test(envelope.signature)
  );
}

export function canonicalConnectedEnvelopeBytes(
  envelope: Omit<ConnectedEnvelope, "signature"> | ConnectedEnvelope,
): Uint8Array {
  const canonical = [
    envelope.protocolVersion,
    envelope.envelopeId,
    envelope.idempotencyKey,
    envelope.workspaceId,
    envelope.shopId,
    envelope.memberId,
    envelope.deviceId,
    envelope.installationId,
    envelope.senderKind,
    envelope.senderId,
    envelope.recipientKind,
    envelope.recipientId,
    envelope.messageType,
    envelope.sequence,
    envelope.issuedAt,
    envelope.expiresAt,
    envelope.revocationEpoch,
    envelope.cipherAlgorithm,
    envelope.encryptionKeyId,
    envelope.aadDigest,
    envelope.ciphertext,
    envelope.signatureAlgorithm,
    envelope.signingKeyId,
  ] as const;
  return new TextEncoder().encode(JSON.stringify(canonical));
}
