import { describe, expect, it } from "vitest";
import {
  CONNECTED_CIPHER_ALGORITHM,
  CONNECTED_PROTOCOL_VERSION,
  CONNECTED_SIGNATURE_ALGORITHM,
  canonicalConnectedEnvelopeBytes,
  isConnectedEnvelope,
  type ConnectedEnvelope,
} from "./protocol";

function envelope(): ConnectedEnvelope {
  return {
    protocolVersion: CONNECTED_PROTOCOL_VERSION,
    envelopeId: "env_12345678",
    idempotencyKey: "idem_12345678",
    workspaceId: "0123456789abcdef0123456789abcdef",
    shopId: "shop_12345678",
    memberId: "member_12345678",
    deviceId: "device_12345678",
    installationId: "fedcba9876543210fedcba9876543210",
    senderKind: "device",
    senderId: "device_12345678",
    recipientKind: "desktop",
    recipientId: "fedcba9876543210fedcba9876543210",
    messageType: "command.order.confirm",
    sequence: 7,
    issuedAt: "2026-08-13T18:00:00.000Z",
    expiresAt: "2026-08-13T18:10:00.000Z",
    revocationEpoch: 3,
    cipherAlgorithm: CONNECTED_CIPHER_ALGORITHM,
    encryptionKeyId: "enc_key_12345678",
    aadDigest: "a".repeat(64),
    ciphertext: "YWJjZA==",
    signatureAlgorithm: CONNECTED_SIGNATURE_ALGORITHM,
    signingKeyId: "sign_key_12345678",
    signature: "A".repeat(44),
  };
}

describe("connected platform protocol", () => {
  it("accepts the exact scoped encrypted envelope", () => {
    expect(isConnectedEnvelope(envelope())).toBe(true);
  });

  it("rejects expired-at-issue and malformed ciphertext envelopes", () => {
    const valid = envelope();
    expect(isConnectedEnvelope({ ...valid, expiresAt: valid.issuedAt })).toBe(false);
    expect(isConnectedEnvelope({ ...valid, ciphertext: "not base64!" })).toBe(false);
  });

  it("requires exact sender, recipient, identity and revocation fields", () => {
    const valid = envelope();
    expect(isConnectedEnvelope({ ...valid, senderKind: "cloud" })).toBe(false);
    expect(isConnectedEnvelope({ ...valid, workspaceId: "other" })).toBe(false);
    expect(isConnectedEnvelope({ ...valid, revocationEpoch: -1 })).toBe(false);
  });

  it("signs every authenticated field but not the signature itself", () => {
    const valid = envelope();
    const original = canonicalConnectedEnvelopeBytes(valid);
    const signatureOnly = canonicalConnectedEnvelopeBytes({
      ...valid,
      signature: "B".repeat(44),
    });
    expect(Buffer.from(signatureOnly)).toEqual(Buffer.from(original));

    const tampered = canonicalConnectedEnvelopeBytes({ ...valid, sequence: 8 });
    expect(Buffer.from(tampered)).not.toEqual(Buffer.from(original));
  });
});
