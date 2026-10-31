// @vitest-environment node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { base64Encode, base64UrlEncode } from "../bytes";
import { deviceFingerprint, formatPairingHash, pairingCode, parsePairingLink } from "../fingerprint";

function key(fill: (index: number) => number, length = 32): Uint8Array {
  return Uint8Array.from({ length }, (_, index) => fill(index));
}

describe("deviceFingerprint", () => {
  it("is the first 8 bytes of SHA-256 in four upper-case groups (frozen vector)", async () => {
    // SHA-256 of 32 zero bytes starts 66687aadf862bd77.
    expect(await deviceFingerprint(new Uint8Array(32))).toBe("6668-7AAD-F862-BD77");
  });

  it("matches Node's SHA-256 for varied keys and accepts base64 text", async () => {
    for (let seed = 0; seed < 12; seed += 1) {
      const raw = key((index) => (index * 17 + seed * 29) & 255);
      const hex = createHash("sha256").update(raw).digest("hex").slice(0, 16).toUpperCase();
      const expected = hex.match(/.{4}/g)?.join("-");
      expect(await deviceFingerprint(raw)).toBe(expected);
      expect(await deviceFingerprint(base64Encode(raw))).toBe(expected);
    }
  });

  it("changes when a single bit of the key changes", async () => {
    const raw = key((index) => index);
    const flipped = raw.slice();
    flipped[31] = (flipped[31] ?? 0) ^ 1;
    expect(await deviceFingerprint(raw)).not.toBe(await deviceFingerprint(flipped));
  });

  it("refuses anything that is not exactly 32 raw bytes, without throwing", async () => {
    for (const length of [0, 1, 31, 33, 64]) expect(await deviceFingerprint(new Uint8Array(length))).toBeNull();
    for (const bad of [null, undefined, 5, {}, "", "not base64!", base64Encode(new Uint8Array(31)), base64Encode(new Uint8Array(33))]) {
      expect(await deviceFingerprint(bad as never)).toBeNull();
    }
  });
});

const ID = `pair_${"0123456789abcdef".repeat(2)}`;
const TOKEN = base64UrlEncode(key((index) => index * 3 + 1));

describe("parsePairingLink", () => {
  it("parses the exact link the desktop builds", () => {
    expect(TOKEN).toHaveLength(43);
    expect(parsePairingLink(`#p=${ID}.${TOKEN}`)).toEqual({ pairingId: ID, pairingToken: TOKEN });
    expect(parsePairingLink(`#p=${"0123456789abcdef".repeat(2)}.${TOKEN}`)?.pairingId).toBe("0123456789abcdef".repeat(2));
    expect(formatPairingHash(ID, TOKEN)).toBe(`#p=${ID}.${TOKEN}`);
  });

  it.each([
    ["empty", ""], ["only hash", "#"], ["no value", "#p="], ["only dot", "#p=."],
    ["no hash sign", `p=${ID}.${TOKEN}`], ["upper-case key", `#P=${ID}.${TOKEN}`],
    ["missing dot", `#p=${ID}${TOKEN}`], ["two dots", `#p=${ID}.${TOKEN}.x`],
    ["extra parameter", `#p=${ID}.${TOKEN}&x=1`], ["leading space", ` #p=${ID}.${TOKEN}`],
    ["trailing newline", `#p=${ID}.${TOKEN}\n`], ["short id", `#p=pair_1.${TOKEN}`],
    ["long id", `#p=${"a".repeat(129)}.${TOKEN}`], ["id starting with underscore", `#p=_${ID}.${TOKEN}`],
    ["short token", `#p=${ID}.${TOKEN.slice(0, 42)}`], ["long token", `#p=${ID}.${TOKEN}A`],
    ["token with plus", `#p=${ID}.${TOKEN.slice(0, 42)}+`], ["token with padding", `#p=${ID}.${TOKEN.slice(0, 42)}=`],
    ["non-canonical token tail", `#p=${ID}.${TOKEN.slice(0, 42)}B`], ["percent-encoded", `#p=${ID}%2E${TOKEN}`],
    ["arabic id", `#p=معرف_12345678.${TOKEN}`], ["query style", `?p=${ID}.${TOKEN}`],
  ])("refuses %s", (_name, value) => {
    expect(parsePairingLink(value)).toBeNull();
  });

  it("never throws on hostile input and stays fast on a megabyte", () => {
    for (const value of [null, undefined, 5, {}, [], true]) expect(parsePairingLink(value as never)).toBeNull();
    const started = Date.now();
    expect(parsePairingLink(`#p=${"a".repeat(1_000_000)}`)).toBeNull();
    expect(Date.now() - started).toBeLessThan(500);
  });

  it("formatPairingHash refuses values the parser would refuse", () => {
    expect(formatPairingHash("short", TOKEN)).toBeNull();
    expect(formatPairingHash(ID, "short")).toBeNull();
  });

  it("uses the relay's own identity rules (drift guard on worker.ts)", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../../../../../control-plane/connected/worker.ts", import.meta.url)),
      "utf8",
    );
    expect(source).toContain("const OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;");
    expect(source).toContain("const HEX_ID = /^[0-9a-f]{32}$/i;");
    expect(source).toContain("function randomToken(): string {\n  const bytes = new Uint8Array(32);");
    expect(source).toContain("const pairingId = `pair_${crypto.randomUUID().replace(/-/g, \"\")}`;");
  });
});

describe("pairingCode (covers the signing key AND the RSA encryption key)", () => {
  const SIGNING = key((index) => index + 1);
  const N = base64UrlEncode(key((index) => (index * 7 + 3) & 255, 384));
  const E = "AQAB";
  const jwk = (extra: Record<string, unknown> = {}) => JSON.stringify({ kty: "RSA", n: N, e: E, ...extra });
  const FORMAT = /^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/;

  // The documented layout, written out again with Node's own SHA-256: every
  // field has a 2-byte big-endian length in front.
  function expected(signing: Uint8Array, n: string, e: string): string {
    const field = (bytes: Uint8Array) => Buffer.concat([Buffer.from([bytes.length >> 8, bytes.length & 255]), bytes]);
    const text = (value: string) => field(Buffer.from(value, "utf8"));
    const hash = createHash("sha256")
      .update(Buffer.concat([text("sahelflow.pairing-code.v1"), field(signing), text("RSA"), text(n), text(e)]))
      .digest("hex").slice(0, 16).toUpperCase();
    return (hash.match(/.{4}/g) ?? []).join("-");
  }

  it("is deterministic, in the display format, and equals the documented SHA-256 layout", async () => {
    const code = await pairingCode(SIGNING, jwk());
    expect(code).toMatch(FORMAT);
    expect(await pairingCode(SIGNING, jwk())).toBe(code);
    expect(code).toBe(expected(SIGNING, N, E));
  });

  it("known answer (pinned so a later change is noticed)", async () => {
    const n = base64UrlEncode(Uint8Array.from({ length: 128 }, (_, index) => (index * 5 + 11) & 255));
    expect(await pairingCode(new Uint8Array(32), JSON.stringify({ kty: "RSA", n, e: "AQAB" }))).toBe("81E7-069D-4C73-C53E");
  });

  it("changes when the RSA modulus or exponent changes, or the signing key changes", async () => {
    const base = await pairingCode(SIGNING, jwk());
    const otherN = base64UrlEncode(key((index) => (index * 7 + 4) & 255, 384));
    expect(await pairingCode(SIGNING, jwk({ n: otherN }))).not.toBe(base);
    expect(await pairingCode(SIGNING, jwk({ e: "Aw" }))).not.toBe(base);
    const flipped = SIGNING.slice();
    flipped[0] = (flipped[0] ?? 0) ^ 1;
    expect(await pairingCode(flipped, jwk())).not.toBe(base);
  });

  it("does not change for extra members, another member order, key_ops, whitespace, or an object instead of text", async () => {
    const base = await pairingCode(SIGNING, jwk());
    expect(await pairingCode(SIGNING, jwk({ key_ops: ["encrypt"], ext: true, alg: "RSA-OAEP-256", kid: "x" }))).toBe(base);
    expect(await pairingCode(SIGNING, JSON.stringify({ e: E, n: N, kty: "RSA" }))).toBe(base);
    expect(await pairingCode(SIGNING, `  { "kty" : "RSA",\n "n":"${N}", "e": "${E}" }\n`)).toBe(base);
    expect(await pairingCode(SIGNING, { e: E, kty: "RSA", n: N, key_ops: ["encrypt"] } as never)).toBe(base);
  });

  it("takes the signing key as raw bytes or as base64", async () => {
    expect(await pairingCode(base64Encode(SIGNING), jwk())).toBe(await pairingCode(SIGNING, jwk()));
  });

  it("gives null, never an exception, for a malformed key of either kind", async () => {
    const badJwks: unknown[] = [
      JSON.stringify({ kty: "RSA", e: E }), // no n
      JSON.stringify({ kty: "RSA", n: N }), // no e
      JSON.stringify({ kty: "RSA", n: N, e: 65537 }), // e not a string
      JSON.stringify({ kty: "RSA", n: "not base64url!", e: E }),
      JSON.stringify({ kty: "RSA", n: "", e: E }),
      JSON.stringify({ kty: "EC", n: N, e: E }),
      JSON.stringify({ n: N, e: E }),
      JSON.stringify({ kty: "RSA", n: "A".repeat(5_000), e: E }), // too big
      { kty: "RSA", n: "A".repeat(5_000), e: E },
      { kty: "RSA", n: N },
      "x".repeat(5_000), "garbage".repeat(800), "", "{", "null", "[]", "5", '"RSA"',
      [], null, undefined, 42, true,
    ];
    for (const bad of badJwks) expect(await pairingCode(SIGNING, bad as never), JSON.stringify(bad)?.slice(0, 40)).toBeNull();
    for (const length of [0, 1, 31, 33, 64]) expect(await pairingCode(new Uint8Array(length), jwk())).toBeNull();
    for (const bad of [null, undefined, 5, {}, "", "not base64!", base64Encode(new Uint8Array(31)), base64Encode(new Uint8Array(33))]) {
      expect(await pairingCode(bad as never, jwk())).toBeNull();
    }
  });
});
