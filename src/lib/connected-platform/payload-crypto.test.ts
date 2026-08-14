import { describe, expect, it } from "vitest";
import {
  decryptConnectedPayload,
  encryptConnectedPayload,
  generateConnectedKeyPair,
  signConnectedBytes,
  verifyConnectedBytes,
} from "./payload-crypto";

describe("connected platform payload cryptography", () => {
  it("round-trips encrypted JSON only for the intended recipient and AAD", () => {
    const recipient = generateConnectedKeyPair();
    const aad = new TextEncoder().encode("workspace/shop/member/device/sequence");
    const sealed = encryptConnectedPayload(
      { command: "order.confirm", orderId: "order_12345678" },
      recipient.encryptionPublicKeyJwk,
      aad,
    );
    expect(decryptConnectedPayload(
      sealed.ciphertext,
      recipient.encryptionPrivateKeyPkcs8,
      aad,
      sealed.aadDigest,
    )).toEqual({ command: "order.confirm", orderId: "order_12345678" });
  });

  it("fails closed when associated metadata is changed", () => {
    const recipient = generateConnectedKeyPair();
    const aad = new TextEncoder().encode("scope:v1");
    const sealed = encryptConnectedPayload({ value: 1 }, recipient.encryptionPublicKeyJwk, aad);
    expect(() => decryptConnectedPayload(
      sealed.ciphertext,
      recipient.encryptionPrivateKeyPkcs8,
      new TextEncoder().encode("scope:v2"),
      sealed.aadDigest,
    )).toThrow(/associated-data digest/i);
  });

  it("cannot decrypt a payload with another device private key", () => {
    const recipient = generateConnectedKeyPair();
    const other = generateConnectedKeyPair();
    const aad = new TextEncoder().encode("same-aad");
    const sealed = encryptConnectedPayload({ value: 1 }, recipient.encryptionPublicKeyJwk, aad);
    expect(() => decryptConnectedPayload(
      sealed.ciphertext,
      other.encryptionPrivateKeyPkcs8,
      aad,
      sealed.aadDigest,
    )).toThrow();
  });

  it("signs exact bytes and rejects tampering", () => {
    const pair = generateConnectedKeyPair();
    const message = new TextEncoder().encode("canonical-envelope-v1");
    const signature = signConnectedBytes(pair.signingPrivateKeyPkcs8, message);
    expect(verifyConnectedBytes(pair.signingPublicKey, signature, message)).toBe(true);
    expect(verifyConnectedBytes(
      pair.signingPublicKey,
      signature,
      new TextEncoder().encode("canonical-envelope-v2"),
    )).toBe(false);
  });
});
