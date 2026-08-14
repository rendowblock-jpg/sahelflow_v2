import { describe, expect, it } from "vitest";
import { createConnectedEnvelope, openConnectedEnvelope } from "./envelope";
import { generateConnectedKeyPair } from "./payload-crypto";
import {
  CONNECTED_CIPHER_ALGORITHM,
  CONNECTED_PROTOCOL_VERSION,
  CONNECTED_SIGNATURE_ALGORITHM,
} from "./protocol";

function metadata() {
  return {
    protocolVersion: CONNECTED_PROTOCOL_VERSION,
    envelopeId: "env_12345678",
    idempotencyKey: "idem_12345678",
    workspaceId: "0123456789abcdef0123456789abcdef",
    shopId: "shop_12345678",
    memberId: "member_12345678",
    deviceId: "device_12345678",
    installationId: "fedcba9876543210fedcba9876543210",
    senderKind: "desktop" as const,
    senderId: "fedcba9876543210fedcba9876543210",
    recipientKind: "device" as const,
    recipientId: "device_12345678",
    messageType: "projection.dashboard",
    sequence: 4,
    issuedAt: "2026-08-13T18:00:00.000Z",
    expiresAt: "2026-08-13T19:00:00.000Z",
    revocationEpoch: 2,
    cipherAlgorithm: CONNECTED_CIPHER_ALGORITHM,
    encryptionKeyId: "enc_key_12345678",
    signatureAlgorithm: CONNECTED_SIGNATURE_ALGORITHM,
    signingKeyId: "sign_key_12345678",
  };
}

describe("connected encrypted envelopes", () => {
  it("round-trips a projection with signed and encrypted scope", () => {
    const sender = generateConnectedKeyPair();
    const recipient = generateConnectedKeyPair();
    const envelope = createConnectedEnvelope(
      metadata(),
      { pending: 4 },
      recipient.encryptionPublicKeyJwk,
      sender.signingPrivateKeyPkcs8,
    );
    expect(openConnectedEnvelope<{ pending: number }>(
      envelope,
      sender.signingPublicKey,
      recipient.encryptionPrivateKeyPkcs8,
      new Date("2026-08-13T18:30:00.000Z"),
    ).payload.pending).toBe(4);
  });

  it("rejects signed-scope tampering", () => {
    const sender = generateConnectedKeyPair();
    const recipient = generateConnectedKeyPair();
    const envelope = createConnectedEnvelope(metadata(), { ok: true }, recipient.encryptionPublicKeyJwk, sender.signingPrivateKeyPkcs8);
    expect(() => openConnectedEnvelope(
      { ...envelope, sequence: envelope.sequence + 1 },
      sender.signingPublicKey,
      recipient.encryptionPrivateKeyPkcs8,
      new Date("2026-08-13T18:30:00.000Z"),
    )).toThrow(/signature/i);
  });

  it("rejects expired envelopes", () => {
    const sender = generateConnectedKeyPair();
    const recipient = generateConnectedKeyPair();
    const envelope = createConnectedEnvelope(metadata(), { ok: true }, recipient.encryptionPublicKeyJwk, sender.signingPrivateKeyPkcs8);
    expect(() => openConnectedEnvelope(
      envelope,
      sender.signingPublicKey,
      recipient.encryptionPrivateKeyPkcs8,
      new Date("2026-08-13T20:00:00.000Z"),
    )).toThrow(/expired/i);
  });
});
