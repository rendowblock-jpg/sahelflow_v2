// @vitest-environment node
import { describe, expect, it } from "vitest";
import { canonicalConnectedAadBytes } from "../../envelope";
import { connectedAadDigest } from "../../payload-crypto";
import { canonicalConnectedEnvelopeBytes, type ConnectedEnvelope } from "../../protocol";
import { utf8Decode } from "../bytes";
import { aadDigestHex, canonicalAadBytes, canonicalEnvelopeBytes } from "../canonical";
import { projectionMetadata } from "./helpers";

const DIGEST = "ab".repeat(32);

function fixture(): Omit<ConnectedEnvelope, "signature"> {
  return { ...projectionMetadata(), aadDigest: DIGEST, ciphertext: "QUJD" };
}

const COMMON = [
  '1,"env_12345678","idem_12345678","0123456789abcdef0123456789abcdef","shop_12345678"',
  '"member_12345678","device_12345678","fedcba9876543210fedcba9876543210","desktop"',
  '"fedcba9876543210fedcba9876543210","device","device_12345678","projection.dashboard",4',
  '"2026-08-13T18:00:00.000Z","2026-08-13T19:00:00.000Z",2,"rsa-oaep-256+aes-256-gcm-v1"',
  '"enc_key_12345678"',
];

describe("frozen canonical text", () => {
  it("signs the 23 fields in the fixed order", () => {
    const expected = `[${COMMON.join(",")},"${DIGEST}","QUJD","ed25519-v1","sign_key_12345678"]`;
    expect(utf8Decode(canonicalEnvelopeBytes(fixture()))).toBe(expected);
    expect(JSON.parse(expected)).toHaveLength(23);
  });

  it("authenticates the 21 metadata fields as AAD (no digest, no ciphertext)", () => {
    const expected = `[${COMMON.join(",")},"ed25519-v1","sign_key_12345678"]`;
    expect(utf8Decode(canonicalAadBytes(projectionMetadata()))).toBe(expected);
    expect(JSON.parse(expected)).toHaveLength(21);
  });

  it("ignores the signature and any extra property", () => {
    const withExtras = { ...fixture(), signature: "x".repeat(88), injected: "evil" } as ConnectedEnvelope;
    expect(canonicalEnvelopeBytes(withExtras)).toEqual(canonicalEnvelopeBytes(fixture()));
    expect(canonicalAadBytes({ ...projectionMetadata(), injected: 1 } as never)).toEqual(
      canonicalAadBytes(projectionMetadata()),
    );
  });
});

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STRINGS: unknown[] = [
  "", "a", "env_12345678", "é", "العربية 123", "🙂 emoji", 'quote"back\\slash', "line\nbreak\ttab",
  "\u2028\u2029", "\ud800", "\u0000ctl", "</script>", "x".repeat(300), null, undefined,
];
const NUMBERS: unknown[] = [
  0, 1, 4, 255, 2 ** 31, 2 ** 32 + 1, Number.MAX_SAFE_INTEGER, 2 ** 53, 1e21, -0, -1, 1.5, NaN,
  Infinity, null, undefined, "7",
];

function generated(seed: number): ConnectedEnvelope {
  const random = mulberry32(seed);
  const text = () => STRINGS[Math.floor(random() * STRINGS.length)];
  const num = () => NUMBERS[Math.floor(random() * NUMBERS.length)];
  return {
    protocolVersion: 1,
    envelopeId: text(), idempotencyKey: text(), workspaceId: text(), shopId: text(), memberId: text(),
    deviceId: text(), installationId: text(), senderKind: text(), senderId: text(), recipientKind: text(),
    recipientId: text(), messageType: text(), sequence: num(), issuedAt: text(), expiresAt: text(),
    revocationEpoch: num(), cipherAlgorithm: text(), encryptionKeyId: text(), aadDigest: text(),
    ciphertext: text(), signatureAlgorithm: text(), signingKeyId: text(), signature: text(),
  } as unknown as ConnectedEnvelope;
}

describe("byte parity with the Node implementation", () => {
  it("matches canonicalConnectedEnvelopeBytes and the AAD for 60 generated envelopes", () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const envelope = generated(seed);
      const node = Buffer.from(canonicalConnectedEnvelopeBytes(envelope));
      expect(Buffer.from(canonicalEnvelopeBytes(envelope)).equals(node), `canonical seed ${seed}`).toBe(true);
      const nodeAad = Buffer.from(canonicalConnectedAadBytes(envelope));
      expect(Buffer.from(canonicalAadBytes(envelope)).equals(nodeAad), `aad seed ${seed}`).toBe(true);
    }
  });

  it("matches for large sequence numbers and unicode in every position", () => {
    for (const sequence of [0, 1, 2 ** 31 - 1, 2 ** 32, Number.MAX_SAFE_INTEGER]) {
      const envelope = { ...fixture(), sequence, messageType: "projection.é🙂", shopId: "متجر_12345678" };
      expect(Buffer.from(canonicalEnvelopeBytes(envelope as ConnectedEnvelope)).equals(
        Buffer.from(canonicalConnectedEnvelopeBytes(envelope as ConnectedEnvelope)),
      )).toBe(true);
    }
  });

  it("computes the same AAD digest as connectedAadDigest", async () => {
    for (const aad of [new Uint8Array(), canonicalAadBytes(projectionMetadata()), new Uint8Array(70000).fill(7)]) {
      expect(await aadDigestHex(aad)).toBe(connectedAadDigest(aad));
    }
  });
});
