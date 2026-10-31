import { beforeAll, describe, expect, it } from "vitest";

import {
  DESKTOP_KEY_CONTEXT,
  canonicalRsaJwkBytes,
  encodeDesktopKeyProof,
  importDesktopSigningPrivateKey,
  parseDesktopKeyProof,
  signDesktopEncryptionKey,
  verifyDesktopEncryptionKey,
  verifyDesktopKeyProof,
  type VerifyDesktopKeyInput,
} from "./pairing-trust";
import { base64Decode, base64Encode } from "./web/bytes";
import { deviceFingerprint } from "./web/fingerprint";

const subtle = globalThis.crypto.subtle;

type Ed = { pair: CryptoKeyPair; raw: string; fp: string };
async function ed(): Promise<Ed> {
  const pair = (await subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const raw = base64Encode(new Uint8Array(await subtle.exportKey("raw", pair.publicKey)));
  return { pair, raw, fp: (await deviceFingerprint(raw)) as string };
}
async function rsaJwk(): Promise<string> {
  const pair = (await subtle.generateKey(
    { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["encrypt", "decrypt"],
  )) as CryptoKeyPair;
  const jwk = await subtle.exportKey("jwk", pair.publicKey);
  return JSON.stringify({ kty: jwk.kty, n: jwk.n, e: jwk.e });
}
const flipSignature = (signature: string, index: number) => {
  const bytes = base64Decode(signature) as Uint8Array;
  bytes[index] = (bytes[index] ?? 0) ^ 1;
  return base64Encode(bytes);
};

let desktop: Ed;
let relay: Ed;
let rsa: string;
let otherRsa: string;
let published: { rsaPublicJwk: string; signature: string; context: string };

beforeAll(async () => {
  desktop = await ed();
  relay = await ed();
  rsa = await rsaJwk();
  otherRsa = await rsaJwk();
  const signed = await signDesktopEncryptionKey(rsa, desktop.pair.privateKey);
  if (!signed.ok) throw new Error("setup");
  published = signed;
});

const input = (over: Partial<VerifyDesktopKeyInput> = {}): VerifyDesktopKeyInput => ({
  rsaPublicJwk: published.rsaPublicJwk,
  signature: published.signature,
  context: published.context,
  desktopSigningPublicKey: desktop.raw,
  pinnedFingerprint: desktop.fp,
  ...over,
});
const reasonOf = async (over: Partial<VerifyDesktopKeyInput>) => {
  const result = await verifyDesktopEncryptionKey(input(over));
  return result.ok ? "ok" : result.reason;
};

describe("canonicalRsaJwkBytes", () => {
  it("orders e, kty, n with no whitespace and ignores extra members", () => {
    const parsed = JSON.parse(rsa) as { n: string; e: string };
    const shuffled = JSON.stringify({ n: parsed.n, alg: "RSA-OAEP-256", ext: true, kty: "RSA", key_ops: ["encrypt"], e: parsed.e });
    const text = new TextDecoder().decode(canonicalRsaJwkBytes(shuffled) as Uint8Array);
    expect(text).toBe(`{"e":"${parsed.e}","kty":"RSA","n":"${parsed.n}"}`);
  });

  it.each([
    ["not json", "x".repeat(40)],
    ["an array", JSON.stringify(["RSA", "a".repeat(40)])],
    ["a number", 42 as unknown as string],
    ["wrong kty", JSON.stringify({ kty: "EC", n: "a".repeat(40), e: "AQAB" })],
    ["no n", JSON.stringify({ kty: "RSA", e: "AQAB", x: "a".repeat(40) })],
    ["n outside base64url", JSON.stringify({ kty: "RSA", n: "a+b/".repeat(12), e: "AQAB" })],
    ["too short", "{}"],
    ["too long", JSON.stringify({ kty: "RSA", n: "a".repeat(5000), e: "AQAB" })],
  ])("refuses %s", (_name, value) => {
    expect(canonicalRsaJwkBytes(value)).toBeNull();
  });
});

describe("signDesktopEncryptionKey", () => {
  it("returns the canonical key, a 64-byte signature and the context", () => {
    expect(published.context).toBe(DESKTOP_KEY_CONTEXT);
    expect((base64Decode(published.signature) as Uint8Array).byteLength).toBe(64);
    expect(published.rsaPublicJwk).toBe(new TextDecoder().decode(canonicalRsaJwkBytes(rsa) as Uint8Array));
  });

  it("is deterministic and independent of member order", async () => {
    const parsed = JSON.parse(rsa) as { n: string; e: string };
    const again = await signDesktopEncryptionKey(JSON.stringify({ e: parsed.e, n: parsed.n, kty: "RSA", alg: "x" }), desktop.pair.privateKey);
    expect(again).toEqual({ ok: true, ...published });
  });

  it("refuses a malformed key, a bad context, a public key and a missing WebCrypto", async () => {
    expect(await signDesktopEncryptionKey("nope", desktop.pair.privateKey)).toEqual({ ok: false, reason: "malformed" });
    expect(await signDesktopEncryptionKey(rsa, desktop.pair.privateKey, { context: "a\u0000b" })).toEqual({ ok: false, reason: "malformed" });
    expect(await signDesktopEncryptionKey(rsa, desktop.pair.publicKey)).toEqual({ ok: false, reason: "sign_failed" });
    expect(await signDesktopEncryptionKey(rsa, desktop.pair.privateKey, { subtle: null })).toEqual({ ok: false, reason: "unavailable" });
  });

  it("imports the PKCS8 private key the desktop stores", async () => {
    const pkcs8 = base64Encode(new Uint8Array(await subtle.exportKey("pkcs8", desktop.pair.privateKey)));
    const key = await importDesktopSigningPrivateKey(pkcs8);
    expect(key).not.toBeNull();
    expect(await signDesktopEncryptionKey(rsa, key as CryptoKey)).toEqual({ ok: true, ...published });
    expect(await importDesktopSigningPrivateKey("###")).toBeNull();
    expect(await importDesktopSigningPrivateKey(base64Encode(new Uint8Array(10)))).toBeNull();
  });
});

describe("verifyDesktopEncryptionKey", () => {
  it("accepts the genuine key and returns the canonical text and the fingerprint", async () => {
    const result = await verifyDesktopEncryptionKey(input());
    expect(result).toEqual({ ok: true, rsaPublicJwk: published.rsaPublicJwk, signingFingerprint: desktop.fp });
  });

  it("accepts a lower-case pin and a re-ordered but equal key", async () => {
    const parsed = JSON.parse(rsa) as { n: string; e: string };
    expect(await reasonOf({ pinnedFingerprint: desktop.fp.toLowerCase() })).toBe("ok");
    expect(await reasonOf({ rsaPublicJwk: JSON.stringify({ n: parsed.n, kty: "RSA", e: parsed.e }) })).toBe("ok");
  });

  it("relay swaps the RSA key: bad_signature", async () => {
    expect(await reasonOf({ rsaPublicJwk: otherRsa })).toBe("bad_signature");
  });

  it("relay swaps one character of n or the exponent: bad_signature", async () => {
    const parsed = JSON.parse(rsa) as { n: string; e: string };
    const first = parsed.n.charAt(0) === "A" ? "B" : "A";
    expect(await reasonOf({ rsaPublicJwk: JSON.stringify({ ...parsed, n: first + parsed.n.slice(1) }) })).toBe("bad_signature");
    expect(await reasonOf({ rsaPublicJwk: JSON.stringify({ ...parsed, e: "AAAB" }) })).toBe("bad_signature");
  });

  it("relay swaps the signing key, keeping the real signature: key_mismatch_with_pin", async () => {
    expect(await reasonOf({ desktopSigningPublicKey: relay.raw })).toBe("key_mismatch_with_pin");
  });

  it("relay swaps both keys and signs with its own key: key_mismatch_with_pin", async () => {
    const forged = await signDesktopEncryptionKey(otherRsa, relay.pair.privateKey);
    if (!forged.ok) throw new Error("setup");
    expect(await reasonOf({ rsaPublicJwk: forged.rsaPublicJwk, signature: forged.signature, desktopSigningPublicKey: relay.raw })).toBe("key_mismatch_with_pin");
  });

  it("the genuine signing key with the relay's signature: bad_signature", async () => {
    const forged = await signDesktopEncryptionKey(otherRsa, relay.pair.privateKey);
    if (!forged.ok) throw new Error("setup");
    expect(await reasonOf({ rsaPublicJwk: forged.rsaPublicJwk, signature: forged.signature })).toBe("bad_signature");
  });

  it("a signature made for another context: wrong_context when it says so, bad_signature when it lies", async () => {
    const other = await signDesktopEncryptionKey(rsa, desktop.pair.privateKey, { context: "sahelflow.backup.key.v1" });
    if (!other.ok) throw new Error("setup");
    expect(await reasonOf({ signature: other.signature, context: other.context })).toBe("wrong_context");
    expect(await reasonOf({ signature: other.signature })).toBe("bad_signature");
    expect(await reasonOf({ context: "sahelflow.pairing.rsa-key.v2" })).toBe("wrong_context");
  });

  it.each([0, 1, 31, 32, 62, 63])("a flipped signature byte %i: bad_signature", async (index) => {
    expect(await reasonOf({ signature: flipSignature(published.signature, index) })).toBe("bad_signature");
  });

  it.each([
    ["empty signature", { signature: "" }],
    ["signature not base64", { signature: "***" }],
    ["signature 63 bytes", { signature: base64Encode(new Uint8Array(63)) }],
    ["signature 65 bytes", { signature: base64Encode(new Uint8Array(65)) }],
    ["signing key 31 bytes", { desktopSigningPublicKey: base64Encode(new Uint8Array(31)) }],
    ["signing key not base64", { desktopSigningPublicKey: "!!" }],
    ["pin too short", { pinnedFingerprint: "A1B2-C3D4" }],
    ["pin with spaces", { pinnedFingerprint: "A1B2 C3D4 E5F6 7788" }],
    ["pin not hex", { pinnedFingerprint: "ZZZZ-C3D4-E5F6-7788" }],
    ["empty context", { context: "" }],
    ["key not an RSA JWK", { rsaPublicJwk: "{}" }],
  ])("%s: malformed", async (_name, over) => {
    expect(await reasonOf(over)).toBe("malformed");
  });

  it("never throws on junk", async () => {
    for (const junk of [null, undefined, 7, {}, [], "x"]) {
      const result = await verifyDesktopEncryptionKey(junk as unknown as VerifyDesktopKeyInput);
      expect(result.ok).toBe(false);
      const fields = await verifyDesktopEncryptionKey({
        rsaPublicJwk: junk, signature: junk, context: junk, desktopSigningPublicKey: junk, pinnedFingerprint: junk,
      } as unknown as VerifyDesktopKeyInput);
      expect(fields).toEqual({ ok: false, reason: "malformed" });
    }
  });

  it("reports unavailable when WebCrypto cannot do Ed25519", async () => {
    const broken = { importKey: async () => { throw new Error("no ed25519"); } } as unknown as SubtleCrypto;
    expect(await verifyDesktopEncryptionKey(input(), { subtle: broken })).toEqual({ ok: false, reason: "unavailable" });
    expect(await verifyDesktopEncryptionKey(input(), { subtle: null })).toEqual({ ok: false, reason: "unavailable" });
  });
});

describe("desktop key proof as one string (what travels through the relay)", () => {
  const proofInput = (over: Record<string, unknown> = {}) => ({
    rsaPublicJwk: published.rsaPublicJwk,
    desktopKeyProof: encodeDesktopKeyProof(published.signature, published.context),
    desktopSigningPublicKey: desktop.raw,
    pinnedFingerprint: desktop.fp,
    ...over,
  });
  const verdict = async (over: Record<string, unknown> = {}) => {
    const result = await verifyDesktopKeyProof(proofInput(over) as Parameters<typeof verifyDesktopKeyProof>[0]);
    return result.ok ? "ok" : result.reason;
  };

  it("encodes <signature>.<context> and parses it back at the first dot", () => {
    const proof = encodeDesktopKeyProof(published.signature, published.context);
    expect(proof).toBe(`${published.signature}.${published.context}`);
    expect(parseDesktopKeyProof(proof)).toEqual({ signature: published.signature, context: published.context });
  });

  it("refuses to encode or parse what the relay would refuse", () => {
    expect(encodeDesktopKeyProof("short", published.context)).toBeNull();
    expect(encodeDesktopKeyProof(published.signature, "")).toBeNull();
    expect(encodeDesktopKeyProof(published.signature, "bad context")).toBeNull();
    expect(encodeDesktopKeyProof(null, published.context)).toBeNull();
    expect(parseDesktopKeyProof(undefined)).toBeNull();
    expect(parseDesktopKeyProof("no-dot-at-all-but-long-enough-xx")).toBeNull();
    expect(parseDesktopKeyProof(`${published.signature}.${published.context}`.padEnd(513, "x"))).toBeNull();
  });

  it("accepts the genuine proof", async () => {
    expect(await verifyDesktopKeyProof(proofInput() as Parameters<typeof verifyDesktopKeyProof>[0])).toMatchObject({
      ok: true,
      signingFingerprint: desktop.fp,
    });
  });

  it("proof_missing for null, undefined and empty: an old desktop or a stripping relay never looks fine", async () => {
    expect(await verdict({ desktopKeyProof: null })).toBe("proof_missing");
    expect(await verdict({ desktopKeyProof: undefined })).toBe("proof_missing");
    expect(await verdict({ desktopKeyProof: "" })).toBe("proof_missing");
  });

  it("malformed for a proof string that is not <signature>.<context>", async () => {
    expect(await verdict({ desktopKeyProof: "garbage" })).toBe("malformed");
    expect(await verdict({ desktopKeyProof: 42 })).toBe("malformed");
  });

  it("keeps the order of the underlying checks: context, then pin, then signature", async () => {
    expect(await verdict({ desktopKeyProof: `${published.signature}.other.context.v1` })).toBe("wrong_context");
    expect(await verdict({ desktopSigningPublicKey: relay.raw })).toBe("key_mismatch_with_pin");
    expect(await verdict({ rsaPublicJwk: otherRsa })).toBe("bad_signature");
  });

  it("never throws on a hostile input", async () => {
    expect(await verifyDesktopKeyProof(null as unknown as Parameters<typeof verifyDesktopKeyProof>[0])).toEqual({
      ok: false,
      reason: "malformed",
    });
  });
});
