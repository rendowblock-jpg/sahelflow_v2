import "server-only";

import {
  decryptConnectedPayload,
  encryptConnectedPayload,
  signConnectedBytes,
  verifyConnectedBytes,
} from "./payload-crypto";
import {
  canonicalConnectedEnvelopeBytes,
  isConnectedEnvelope,
  type ConnectedEnvelope,
} from "./protocol";

export type ConnectedEnvelopeMetadata = Omit<
  ConnectedEnvelope,
  "aadDigest" | "ciphertext" | "signature"
>;

export function canonicalConnectedAadBytes(
  metadata: ConnectedEnvelopeMetadata,
): Uint8Array {
  return new TextEncoder().encode(JSON.stringify([
    metadata.protocolVersion,
    metadata.envelopeId,
    metadata.idempotencyKey,
    metadata.workspaceId,
    metadata.shopId,
    metadata.memberId,
    metadata.deviceId,
    metadata.installationId,
    metadata.senderKind,
    metadata.senderId,
    metadata.recipientKind,
    metadata.recipientId,
    metadata.messageType,
    metadata.sequence,
    metadata.issuedAt,
    metadata.expiresAt,
    metadata.revocationEpoch,
    metadata.cipherAlgorithm,
    metadata.encryptionKeyId,
    metadata.signatureAlgorithm,
    metadata.signingKeyId,
  ]));
}

function envelopeMetadata(envelope: ConnectedEnvelope): ConnectedEnvelopeMetadata {
  return {
    protocolVersion: envelope.protocolVersion,
    envelopeId: envelope.envelopeId,
    idempotencyKey: envelope.idempotencyKey,
    workspaceId: envelope.workspaceId,
    shopId: envelope.shopId,
    memberId: envelope.memberId,
    deviceId: envelope.deviceId,
    installationId: envelope.installationId,
    senderKind: envelope.senderKind,
    senderId: envelope.senderId,
    recipientKind: envelope.recipientKind,
    recipientId: envelope.recipientId,
    messageType: envelope.messageType,
    sequence: envelope.sequence,
    issuedAt: envelope.issuedAt,
    expiresAt: envelope.expiresAt,
    revocationEpoch: envelope.revocationEpoch,
    cipherAlgorithm: envelope.cipherAlgorithm,
    encryptionKeyId: envelope.encryptionKeyId,
    signatureAlgorithm: envelope.signatureAlgorithm,
    signingKeyId: envelope.signingKeyId,
  };
}

export function createConnectedEnvelope(
  metadata: ConnectedEnvelopeMetadata,
  payload: unknown,
  recipientEncryptionPublicKeyJwk: string,
  senderSigningPrivateKeyPkcs8: string,
): ConnectedEnvelope {
  const sealed = encryptConnectedPayload(
    payload,
    recipientEncryptionPublicKeyJwk,
    canonicalConnectedAadBytes(metadata),
  );
  const unsigned: Omit<ConnectedEnvelope, "signature"> = {
    ...metadata,
    aadDigest: sealed.aadDigest,
    ciphertext: sealed.ciphertext,
  };
  return {
    ...unsigned,
    signature: signConnectedBytes(
      senderSigningPrivateKeyPkcs8,
      canonicalConnectedEnvelopeBytes(unsigned),
    ),
  };
}

export function openConnectedEnvelope<T>(
  value: unknown,
  senderSigningPublicKey: string,
  recipientEncryptionPrivateKeyPkcs8: string,
  now = new Date(),
): Readonly<{ envelope: ConnectedEnvelope; payload: T }> {
  if (!isConnectedEnvelope(value)) throw new Error("Connected envelope format is invalid");
  const envelope = value;
  if (Date.parse(envelope.expiresAt) <= now.getTime()) {
    throw new Error("Connected envelope has expired");
  }
  if (!verifyConnectedBytes(
    senderSigningPublicKey,
    envelope.signature,
    canonicalConnectedEnvelopeBytes(envelope),
  )) {
    throw new Error("Connected envelope signature is invalid");
  }
  const metadata = envelopeMetadata(envelope);
  const payload = decryptConnectedPayload<T>(
    envelope.ciphertext,
    recipientEncryptionPrivateKeyPkcs8,
    canonicalConnectedAadBytes(metadata),
    envelope.aadDigest,
  );
  return Object.freeze({ envelope, payload });
}
