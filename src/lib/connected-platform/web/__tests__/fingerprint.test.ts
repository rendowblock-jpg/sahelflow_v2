// @vitest-environment node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { base64Encode, base64UrlEncode } from "../bytes";
import { deviceFingerprint, formatPairingHash, parsePairingLink } from "../fingerprint";

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
