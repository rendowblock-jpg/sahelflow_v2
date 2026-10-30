// @vitest-environment node
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { canonicalConnectedAadBytes, createConnectedEnvelope, openConnectedEnvelope } from "../../envelope";
import {
  connectedAadDigest,
  encryptConnectedPayload,
  generateConnectedKeyPair,
  type ConnectedKeyPair,
} from "../../payload-crypto";
import { isConnectedEnvelope, type ConnectedEnvelope } from "../../protocol";
import { base64Decode, base64Encode, utf8Decode, utf8Encode } from "../bytes";
import { aadDigestHex, canonicalAadBytes } from "../canonical";
import { openEnvelopeWeb, sealEnvelopeWeb, type OpenFailureReason } from "../envelope-web";
import { generateDeviceKeys, type DeviceKeys, type DevicePublicKeys } from "../keys";
import {
  NOW,
  commandMetadata,
  flipBit,
  projectionMetadata,
  resign,
} from "./helpers";

const PAYLOAD = { pending: 4, title: "طلبات اليوم — ✓", nested: { ok: true, list: [1, 2, 3], none: null } };
const OTHER_DEVICE = "device_87654321";

let desktop: ConnectedKeyPair;
let phone: DeviceKeys;
let phonePublic: DevicePublicKeys;
let strangerRsa: CryptoKey;
let strangerDesktop: ConnectedKeyPair;

beforeAll(async () => {
  desktop = generateConnectedKeyPair();
  strangerDesktop = generateConnectedKeyPair();
  const made = await generateDeviceKeys();
  if (!made.ok) throw new Error(`keygen failed: ${made.reason}`);
  phone = made.keys;
  phonePublic = made.publicKeys;
  const stranger = (await crypto.subtle.generateKey(
    { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    false,
    ["encrypt", "decrypt"],
  )) as CryptoKeyPair;
  strangerRsa = stranger.privateKey;
}, 120_000);

afterEach(() => vi.restoreAllMocks());

function nodeProjection(over: Partial<ConnectedEnvelope> = {}, payload: unknown = PAYLOAD): ConnectedEnvelope {
  return createConnectedEnvelope(
    projectionMetadata(over),
    payload,
    phonePublic.encryptionPublicKey,
    desktop.signingPrivateKeyPkcs8,
  );
}

type Options = NonNullable<Parameters<typeof openEnvelopeWeb>[3]>;
function open(envelope: unknown, options: Options = {}, key: CryptoKey = phone.encryption.privateKey) {
  return openEnvelopeWeb(envelope, desktop.signingPublicKey, key, { now: NOW, ...options });
}
const refused = (reason: OpenFailureReason) => ({ ok: false, reason });

interface Inner { v: number; wrappedKey: string; iv: string; ciphertext: string; tag: string }
function innerOf(envelope: ConnectedEnvelope): Inner {
  return JSON.parse(utf8Decode(base64Decode(envelope.ciphertext) ?? new Uint8Array()) ?? "") as Inner;
}
function withInner(envelope: ConnectedEnvelope, inner: unknown): ConnectedEnvelope {
  const ciphertext = base64Encode(utf8Encode(typeof inner === "string" ? inner : JSON.stringify(inner)));
  return resign({ ...envelope, ciphertext }, desktop.signingPrivateKeyPkcs8);
}

describe("(a) Node seals a projection, the web port opens it", () => {
  it("opens and returns the payload and the envelope", async () => {
    const envelope = nodeProjection();
    const result = await open(envelope);
    expect(result).toEqual({ ok: true, envelope, payload: PAYLOAD });
  });

  it.each([
    ["string", "طلب جديد 🙂"], ["number", 0], ["null", null], ["array", [1, "a", null]],
    ["empty object", {}], ["200 KB text", "é".repeat(100_000)],
  ])("opens a %s payload", async (_name, payload) => {
    const result = await open(nodeProjection({}, payload));
    expect(result.ok && result.payload).toEqual(payload);
  });

  it("opens a payload of exactly 256 KB", async () => {
    const payload = "x".repeat(256 * 1024 - 2);
    const envelope = nodeProjection({}, payload);
    expect(envelope.ciphertext.length).toBeLessThanOrEqual(512 * 1024);
    const result = await open(envelope);
    expect(result.ok && result.payload).toBe(payload);
  });
});

describe("(b) the web port seals a command, Node opens it", () => {
  async function sealCommand(payload: unknown = PAYLOAD, over: Partial<ConnectedEnvelope> = {}) {
    return sealEnvelopeWeb(commandMetadata(over), payload, desktop.encryptionPublicKeyJwk, phone.signing.privateKey);
  }

  it("is opened by openConnectedEnvelope", async () => {
    const envelope = await sealCommand();
    const opened = openConnectedEnvelope<typeof PAYLOAD>(
      envelope, phonePublic.signingPublicKey, desktop.encryptionPrivateKeyPkcs8, NOW,
    );
    expect(opened.payload).toEqual(PAYLOAD);
    expect(opened.envelope.messageType).toBe("command.comments.write");
  });

  it("produces the wire format: v1 JSON, 12-byte IV, SEPARATE 16-byte tag, RSA-3072 wrap", async () => {
    const plaintext = JSON.stringify(PAYLOAD);
    const envelope = await sealCommand();
    expect(isConnectedEnvelope(envelope)).toBe(true);
    expect(envelope.signature).toHaveLength(88);
    const inner = innerOf(envelope);
    expect(Object.keys(inner)).toEqual(["v", "wrappedKey", "iv", "ciphertext", "tag"]);
    expect(inner.v).toBe(1);
    expect(base64Decode(inner.iv)?.byteLength).toBe(12);
    expect(base64Decode(inner.tag)?.byteLength).toBe(16);
    expect(base64Decode(inner.wrappedKey)?.byteLength).toBe(384);
    // GCM ciphertext has the plaintext's length only if the tag was split off.
    expect(base64Decode(inner.ciphertext)?.byteLength).toBe(utf8Encode(plaintext).byteLength);
    expect(envelope.aadDigest).toBe(connectedAadDigest(canonicalConnectedAadBytes(commandMetadata())));
  });

  it("uses a fresh key and IV every time", async () => {
    const [one, two] = [await sealCommand(), await sealCommand()];
    expect(innerOf(one).iv).not.toBe(innerOf(two).iv);
    expect(innerOf(one).wrappedKey).not.toBe(innerOf(two).wrappedKey);
    expect(one.signature).not.toBe(two.signature);
  });

  it("round-trips a 256 KB payload and an empty-string payload through Node", async () => {
    for (const payload of ["x".repeat(256 * 1024 - 2), ""]) {
      const envelope = await sealCommand(payload);
      expect(envelope.ciphertext.length).toBeLessThanOrEqual(512 * 1024);
      expect(openConnectedEnvelope(envelope, phonePublic.signingPublicKey, desktop.encryptionPrivateKeyPkcs8, NOW).payload).toBe(payload);
    }
  });

  it("is refused by Node when the metadata is tampered after sealing", async () => {
    const envelope = await sealCommand();
    expect(() => openConnectedEnvelope({ ...envelope, sequence: 10 }, phonePublic.signingPublicKey, desktop.encryptionPrivateKeyPkcs8, NOW))
      .toThrow("Connected envelope signature is invalid");
  });
});

describe("sealing refuses what Node refuses, with Node's own messages", () => {
  const nodeMessage = (run: () => unknown): string => {
    try { run(); } catch (error) { return (error as Error).message; }
    throw new Error("Node did not refuse");
  };
  const seal = (payload: unknown, jwk = desktop.encryptionPublicKeyJwk) =>
    sealEnvelopeWeb(commandMetadata(), payload, jwk, phone.signing.privateKey);

  it("refuses a payload one byte over 256 KB", async () => {
    const payload = "x".repeat(256 * 1024 - 1);
    const expected = nodeMessage(() => encryptConnectedPayload(payload, desktop.encryptionPublicKeyJwk, utf8Encode("a")));
    expect(expected).toBe("Connected payload exceeds the encrypted payload limit");
    await expect(seal(payload)).rejects.toThrow(expected);
    await expect(seal(payload)).rejects.toBeInstanceOf(RangeError);
  });

  it("refuses a payload that is not JSON", async () => {
    const expected = nodeMessage(() => encryptConnectedPayload(undefined, desktop.encryptionPublicKeyJwk, utf8Encode("a")));
    await expect(seal(undefined)).rejects.toThrow(expected);
    await expect(seal(() => 1)).rejects.toThrow(expected);
  });

  it("refuses a recipient key that is not JSON or not RSA", async () => {
    for (const jwk of ["not json", JSON.stringify({ kty: "EC", crv: "P-256", x: "a", y: "b" }), JSON.stringify({ kty: "RSA" })]) {
      const expected = nodeMessage(() => encryptConnectedPayload({}, jwk, utf8Encode("a")));
      await expect(seal({}, jwk)).rejects.toThrow(expected);
    }
  });

  it("refuses metadata the relay would refuse", async () => {
    await expect(sealEnvelopeWeb(commandMetadata({ messageType: "BAD TYPE" }), {}, desktop.encryptionPublicKeyJwk, phone.signing.privateKey))
      .rejects.toThrow("Connected envelope format is invalid");
  });
});

describe("opening: every tamper gets its own typed reason", () => {
  it("flips one signature byte -> bad_signature", async () => {
    const envelope = nodeProjection();
    for (const index of [0, 31, 63]) {
      expect(await open({ ...envelope, signature: flipBit(envelope.signature, index) })).toEqual(refused("bad_signature"));
    }
  });

  it("flips one ciphertext byte without re-signing -> bad_signature", async () => {
    const envelope = nodeProjection();
    const outer = base64Decode(envelope.ciphertext) ?? new Uint8Array();
    outer[40] = (outer[40] ?? 0) ^ 1;
    expect(await open({ ...envelope, ciphertext: base64Encode(outer) })).toEqual(refused("bad_signature"));
  });

  it.each([
    ["sequence", { sequence: 5 }],
    ["expiresAt", { expiresAt: "2026-08-13T19:00:00.001Z" }],
    ["issuedAt", { issuedAt: "2026-08-13T17:59:59.000Z" }],
    ["deviceId", { deviceId: OTHER_DEVICE }],
    ["recipientId", { recipientId: OTHER_DEVICE }],
    ["messageType", { messageType: "projection.orders" }],
    ["revocationEpoch", { revocationEpoch: 3 }],
  ] as Array<[string, Partial<ConnectedEnvelope>]>)(
    "changes %s: unsigned -> bad_signature, re-signed -> bad_aad, digest fixed too -> decrypt_failed",
    async (_name, patch) => {
      const tampered = { ...nodeProjection(), ...patch };
      expect(await open(tampered)).toEqual(refused("bad_signature"));
      const signed = resign(tampered, desktop.signingPrivateKeyPkcs8);
      const decrypt = vi.spyOn(crypto.subtle, "decrypt");
      expect(await open(signed)).toEqual(refused("bad_aad"));
      expect(decrypt).not.toHaveBeenCalled();
      const digest = await aadDigestHex(canonicalAadBytes(signed));
      const consistent = resign({ ...signed, aadDigest: digest }, desktop.signingPrivateKeyPkcs8);
      expect(await open(consistent)).toEqual(refused("decrypt_failed"));
    },
  );

  it("flips one byte inside the sealed parts (re-signed) -> decrypt_failed / wrong_key", async () => {
    const envelope = nodeProjection();
    for (const part of ["ciphertext", "tag", "iv"] as const) {
      const inner = innerOf(envelope);
      const result = await open(withInner(envelope, { ...inner, [part]: flipBit(inner[part], 3) }));
      expect(result, part).toEqual(refused("decrypt_failed"));
    }
    const inner = innerOf(envelope);
    expect(await open(withInner(envelope, { ...inner, wrappedKey: flipBit(inner.wrappedKey, 5) }))).toEqual(refused("wrong_key"));
  });

  it("refuses truncated or malformed sealed parts -> malformed_ciphertext", async () => {
    const envelope = nodeProjection();
    const inner = innerOf(envelope);
    const outer = base64Decode(envelope.ciphertext) ?? new Uint8Array();
    const cases: unknown[] = [
      base64Encode(outer.slice(0, outer.length - 10)),
      "not json at all",
      { ...inner, tag: base64Encode(new Uint8Array(15)) },
      { ...inner, iv: base64Encode(new Uint8Array(11)) },
      { ...inner, v: 2 },
      { ...inner, tag: undefined },
      { ...inner, ciphertext: 5 },
      { ...inner, wrappedKey: "!!!" },
      [],
    ];
    for (const value of cases) {
      const sealed = typeof value === "string" && value.length > 0 && value === base64Encode(outer.slice(0, outer.length - 10))
        ? resign({ ...envelope, ciphertext: value }, desktop.signingPrivateKeyPkcs8)
        : withInner(envelope, value);
      expect(await open(sealed), JSON.stringify(value)?.slice(0, 40)).toEqual(refused("malformed_ciphertext"));
    }
    const badBase64 = resign({ ...envelope, ciphertext: "QUJDR" }, desktop.signingPrivateKeyPkcs8);
    expect(await open(badBase64)).toEqual(refused("malformed_ciphertext"));
  });

  it("truncation without re-signing -> bad_signature; missing fields -> malformed", async () => {
    const envelope = nodeProjection();
    expect(await open({ ...envelope, ciphertext: envelope.ciphertext.slice(0, -4) })).toEqual(refused("bad_signature"));
    const { signature: _signature, ...unsigned } = envelope;
    expect(await open(unsigned)).toEqual(refused("malformed"));
    expect(await open({ ...envelope, signature: envelope.signature.slice(0, 20) })).toEqual(refused("malformed"));
    expect(await open({ ...envelope, ciphertext: "" })).toEqual(refused("malformed"));
  });

  it("refuses non-envelopes without throwing -> malformed", async () => {
    for (const value of [null, undefined, 0, "", "text", true, [], {}, { protocolVersion: 1 }]) {
      expect(await open(value)).toEqual(refused("malformed"));
    }
  });

  it("refuses an expired envelope exactly at the expiry instant -> expired", async () => {
    const envelope = nodeProjection();
    const expiry = Date.parse(envelope.expiresAt);
    expect(await open(envelope, { now: expiry })).toEqual(refused("expired"));
    expect(await open(envelope, { now: new Date(expiry + 1) })).toEqual(refused("expired"));
    expect((await open(envelope, { now: expiry - 1 })).ok).toBe(true);
  });

  it("refuses the wrong recipient key -> wrong_key, and the wrong sender key -> bad_signature", async () => {
    const envelope = nodeProjection();
    expect(await open(envelope, {}, strangerRsa)).toEqual(refused("wrong_key"));
    expect(await openEnvelopeWeb(envelope, strangerDesktop.signingPublicKey, phone.encryption.privateKey, { now: NOW }))
      .toEqual(refused("bad_signature"));
  });

  it("refuses a sender key that is not 32 raw bytes -> bad_signing_key", async () => {
    const envelope = nodeProjection();
    for (const key of [base64Encode(new Uint8Array(31)), base64Encode(new Uint8Array(33)), base64Encode(new Uint8Array(64)), "", "!!!", "AAAA"]) {
      expect(await openEnvelopeWeb(envelope, key, phone.encryption.privateKey, { now: NOW }), key).toEqual(refused("bad_signing_key"));
    }
  });

  it("refuses by caller expectation on an authentic envelope", async () => {
    const envelope = nodeProjection();
    expect(await open(envelope, { expect: { recipientId: OTHER_DEVICE } })).toEqual(refused("wrong_recipient"));
    expect(await open(envelope, { expect: { deviceId: OTHER_DEVICE } })).toEqual(refused("wrong_device"));
    expect(await open(envelope, { expect: { sequence: 5 } })).toEqual(refused("wrong_sequence"));
    expect(await open(envelope, { expect: { minSequence: 5 } })).toEqual(refused("stale_sequence"));
    const accepted = await open(envelope, { expect: { recipientId: "device_12345678", deviceId: "device_12345678", sequence: 4, minSequence: 4 } });
    expect(accepted.ok).toBe(true);
  });

  it("refuses an oversize ciphertext string, and accepts the size gate at exactly 512K chars", async () => {
    const envelope = nodeProjection();
    expect(await open({ ...envelope, ciphertext: "A".repeat(512 * 1024 + 1) })).toEqual(refused("oversize"));
    expect(await open({ ...envelope, ciphertext: "A".repeat(512 * 1024) })).toEqual(refused("bad_signature"));
  });

  it("refuses sealed plaintext over 256 KB before decrypting -> oversize", async () => {
    const envelope = nodeProjection();
    const inner = innerOf(envelope);
    const huge = base64Encode(new Uint8Array(256 * 1024 + 1 + 16));
    expect(await open(withInner(envelope, { ...inner, ciphertext: huge }))).toEqual(refused("oversize"));
  });

  it("verifies the signature BEFORE any decryption", async () => {
    const envelope = nodeProjection();
    const decrypt = vi.spyOn(crypto.subtle, "decrypt");
    const forged = { ...envelope, signature: flipBit(envelope.signature, 0) };
    // Wrong key AND bad signature: the signature reason must win, and nothing is decrypted.
    expect(await open(forged, {}, strangerRsa)).toEqual(refused("bad_signature"));
    expect(decrypt).not.toHaveBeenCalled();
    expect((await open(envelope)).ok).toBe(true);
    expect(decrypt).toHaveBeenCalled();
  });

  it("never throws on random junk in any field", async () => {
    const base = nodeProjection() as unknown as Record<string, unknown>;
    const junk: unknown[] = [null, undefined, 0, -1, 1e999, "", "x", [], {}, true, "é".repeat(500), Symbol.iterator.toString()];
    const fields = Object.keys(base);
    let seed = 7;
    for (let round = 0; round < 120; round += 1) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const field = fields[seed % fields.length] ?? "signature";
      const value = junk[(seed >> 8) % junk.length];
      const result = await open({ ...base, [field]: value });
      expect(result.ok, `${field}=${String(value)}`).toBe(false);
    }
  });
});
