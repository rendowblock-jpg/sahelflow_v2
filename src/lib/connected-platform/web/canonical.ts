import type { ConnectedEnvelope } from "../protocol";
import { bytesToHex, getSubtle, toArrayBuffer, utf8Encode } from "./bytes";

export type EnvelopeMetadata = Omit<ConnectedEnvelope, "aadDigest" | "ciphertext" | "signature">;
export type UnsignedEnvelope = Omit<ConnectedEnvelope, "signature">;

// Port of canonicalConnectedEnvelopeBytes (protocol.ts): the 23 signed fields in
// this fixed order. Changing the order or the list breaks every signature.
export function canonicalEnvelopeBytes(envelope: UnsignedEnvelope | ConnectedEnvelope): Uint8Array {
  return utf8Encode(JSON.stringify([
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
  ]));
}

// Port of canonicalConnectedAadBytes (envelope.ts): the 21 metadata fields, i.e.
// the signed list without aadDigest and ciphertext.
export function canonicalAadBytes(metadata: EnvelopeMetadata): Uint8Array {
  return utf8Encode(JSON.stringify([
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

// Copies exactly the 21 AAD fields, dropping anything else on the object.
export function envelopeMetadata(envelope: EnvelopeMetadata): EnvelopeMetadata {
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

// Same as connectedAadDigest: lower-case hex SHA-256 of the AAD bytes.
export async function aadDigestHex(aad: Uint8Array): Promise<string> {
  const subtle = getSubtle();
  if (!subtle) throw new Error("WebCrypto is not available");
  return bytesToHex(new Uint8Array(await subtle.digest("SHA-256", toArrayBuffer(aad))));
}
