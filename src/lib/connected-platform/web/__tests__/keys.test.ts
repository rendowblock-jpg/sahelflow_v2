// @vitest-environment node
import { readFileSync } from "node:fs";
import { createPublicKey } from "node:crypto";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { encryptConnectedPayload, verifyConnectedBytes } from "../../payload-crypto";
import { base64Decode, base64UrlDecode, utf8Encode } from "../bytes";
import {
  buildPairingExchangeBody,
  generateDeviceKeys,
  supportsEd25519,
  type GenerateDeviceKeysResult,
} from "../keys";

// Copies of the relay's pairing validators (control-plane/connected/worker.ts).
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const MAX_JWK_CHARS = 4096;
function relayAcceptsRsaJwk(value: unknown): boolean {
  if (typeof value !== "string" || value.length < 32 || value.length > MAX_JWK_CHARS) return false;
  try {
    const jwk = JSON.parse(value) as Record<string, unknown>;
    return jwk.kty === "RSA" && typeof jwk.n === "string" && typeof jwk.e === "string";
  } catch {
    return false;
  }
}

let made: Extract<GenerateDeviceKeysResult, { ok: true }>;

beforeAll(async () => {
  const result = await generateDeviceKeys();
  if (!result.ok) throw new Error(`keygen failed: ${result.reason}`);
  made = result;
}, 120_000);

describe("generateDeviceKeys", () => {
  it("makes non-extractable private keys", async () => {
    const { signing, encryption } = made.keys;
    expect(signing.privateKey.extractable).toBe(false);
    expect(encryption.privateKey.extractable).toBe(false);
    expect(signing.privateKey.algorithm.name).toBe("Ed25519");
    expect(encryption.privateKey.algorithm).toMatchObject({ name: "RSA-OAEP", modulusLength: 3072 });
    await expect(crypto.subtle.exportKey("pkcs8", signing.privateKey)).rejects.toThrow();
    await expect(crypto.subtle.exportKey("pkcs8", encryption.privateKey)).rejects.toThrow();
    await expect(crypto.subtle.exportKey("jwk", encryption.privateKey)).rejects.toThrow();
  });

  it("exports exactly what POST /v1/pairings/exchange expects", () => {
    expect(Object.keys(made.publicKeys)).toEqual(["signingPublicKey", "encryptionPublicKey"]);
    const { signingPublicKey, encryptionPublicKey } = made.publicKeys;
    expect(BASE64.test(signingPublicKey)).toBe(true);
    expect(base64Decode(signingPublicKey)?.byteLength).toBe(32);
    expect(relayAcceptsRsaJwk(encryptionPublicKey)).toBe(true);
    expect(encryptionPublicKey.length).toBeLessThanOrEqual(MAX_JWK_CHARS);
    const jwk = JSON.parse(encryptionPublicKey) as Record<string, string>;
    expect(Object.keys(jwk).sort()).toEqual(["e", "kty", "n"]);
    expect(jwk.e).toBe("AQAB");
    expect(base64UrlDecode(jwk.n ?? "")?.byteLength).toBe(384);
  });

  it("builds the exchange body with the relay's four field names", () => {
    const body = buildPairingExchangeBody("pair_0123456789abcdef", "token-value", made.publicKeys);
    expect(Object.keys(body)).toEqual(["pairingId", "pairingToken", "signingPublicKey", "encryptionPublicKey"]);
    expect(body.signingPublicKey).toBe(made.publicKeys.signingPublicKey);
  });

  it("is accepted by the Node side: JWK imports, Ed25519 verifies, Node can seal to it", async () => {
    const jwk = JSON.parse(made.publicKeys.encryptionPublicKey) as Parameters<typeof createPublicKey>[0];
    expect(() => createPublicKey({ key: jwk as never, format: "jwk" })).not.toThrow();
    expect(() => encryptConnectedPayload({ a: 1 }, made.publicKeys.encryptionPublicKey, utf8Encode("aad"))).not.toThrow();
    const message = utf8Encode("hello phone");
    const signature = new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, made.keys.signing.privateKey, message));
    expect(signature.byteLength).toBe(64);
    expect(verifyConnectedBytes(made.publicKeys.signingPublicKey, Buffer.from(signature).toString("base64"), message)).toBe(true);
  });

  it("returns typed states instead of throwing", async () => {
    expect(await generateDeviceKeys({ subtle: null })).toEqual({ ok: false, reason: "webcrypto_unavailable" });
    const noEd = { generateKey: async () => { throw new DOMException("no", "NotSupportedError"); } } as unknown as SubtleCrypto;
    expect(await generateDeviceKeys({ subtle: noEd })).toEqual({ ok: false, reason: "ed25519_unsupported" });
    const real = crypto.subtle;
    const rsaFails = {
      generateKey: async (...args: Parameters<SubtleCrypto["generateKey"]>) => {
        if ((args[0] as { name: string }).name === "RSA-OAEP") throw new Error("quota");
        return real.generateKey(...args);
      },
      sign: real.sign.bind(real),
      verify: real.verify.bind(real),
    } as unknown as SubtleCrypto;
    expect(await generateDeviceKeys({ subtle: rsaFails })).toEqual({ ok: false, reason: "keygen_failed" });
  });
});

describe("supportsEd25519", () => {
  it("is true where WebCrypto has Ed25519", async () => {
    expect(await supportsEd25519()).toBe(true);
  });

  it("is false, never a throw, for every kind of missing or broken support", async () => {
    const pair = { privateKey: {}, publicKey: {} };
    const broken: unknown[] = [
      null,
      {},
      { generateKey: async () => { throw new DOMException("no", "NotSupportedError"); } },
      { generateKey: () => { throw "plain string"; } },
      { generateKey: async () => undefined },
      { generateKey: async () => pair, sign: async () => { throw new Error("sign"); } },
      { generateKey: async () => pair, sign: async () => new ArrayBuffer(64), verify: async () => false },
    ];
    for (const subtle of broken) {
      expect(await supportsEd25519(subtle as SubtleCrypto | null)).toBe(false);
    }
  });
});

describe("relay drift guard", () => {
  it("worker.ts still reads these exchange fields and limits", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../../../../../control-plane/connected/worker.ts", import.meta.url)),
      "utf8",
    );
    for (const text of [
      "const MAX_JWK_CHARS = 4096;",
      "pairingId?: unknown;",
      "pairingToken?: unknown;",
      "signingPublicKey?: unknown;",
      "encryptionPublicKey?: unknown;",
      "base64Bytes(input.signingPublicKey).byteLength !== 32",
    ]) expect(source).toContain(text);
  });
});
