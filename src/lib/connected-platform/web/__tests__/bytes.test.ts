// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  base64Decode,
  base64Encode,
  base64UrlDecode,
  base64UrlEncode,
  bytesToHex,
  concatBytes,
  timingSafeEqualBytes,
  utf8Decode,
  utf8Encode,
} from "../bytes";

function pattern(length: number): Uint8Array {
  const out = new Uint8Array(length);
  for (let index = 0; index < length; index += 1) out[index] = (index * 131 + 7) & 255;
  return out;
}

const SIZES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 255, 256, 257, 1024, 65535, 256 * 1024];

describe("base64 against Node's Buffer", () => {
  it.each(SIZES)("encodes %i bytes exactly like Buffer", (size) => {
    const bytes = pattern(size);
    expect(base64Encode(bytes)).toBe(Buffer.from(bytes).toString("base64"));
    expect(base64UrlEncode(bytes)).toBe(Buffer.from(bytes).toString("base64url"));
  });

  it.each(SIZES)("decodes %i bytes exactly like Buffer", (size) => {
    const bytes = pattern(size);
    expect(base64Decode(Buffer.from(bytes).toString("base64"))).toEqual(bytes);
    expect(base64UrlDecode(Buffer.from(bytes).toString("base64url"))).toEqual(bytes);
  });

  it("covers every single byte value and the +/ versus -_ alphabets", () => {
    for (let value = 0; value < 256; value += 1) {
      const bytes = new Uint8Array([value]);
      expect(base64Encode(bytes)).toBe(Buffer.from(bytes).toString("base64"));
    }
    const edge = new Uint8Array([0xfb, 0xff, 0xbf]);
    expect(base64Encode(edge)).toBe("+/+/");
    expect(base64UrlEncode(edge)).toBe("-_-_");
    expect(base64Decode("+/+/")).toEqual(edge);
    expect(base64UrlDecode("-_-_")).toEqual(edge);
    expect(base64Decode("-_-_")).toBeNull();
    expect(base64UrlDecode("+/+/")).toBeNull();
  });

  it("round-trips 256 KB", () => {
    const bytes = pattern(256 * 1024);
    expect(base64Decode(base64Encode(bytes))).toEqual(bytes);
    expect(base64UrlDecode(base64UrlEncode(bytes))).toEqual(bytes);
  });

  it.each([
    "A", "AB", "ABC", "AB=", "A===", "AA=A", "AB==", "QQ", " QQ==", "QQ==\n", "QQ==QQ==",
    "QQ=", "====", "é===", "Q Q=", "QQ==\u0000", "-_-_",
  ])("refuses the non-canonical standard base64 %j", (value) => {
    expect(base64Decode(value)).toBeNull();
  });

  it.each([
    "A", "QR", "QQ==", "QUJD=", "+/", " QQ", "QQ\n", "é", "QUJDR",
  ])("refuses the non-canonical base64url %j", (value) => {
    expect(base64UrlDecode(value)).toBeNull();
  });

  it("accepts the canonical short forms", () => {
    expect(base64Decode("")).toEqual(new Uint8Array());
    expect(base64Decode("QQ==")).toEqual(new Uint8Array([0x41]));
    expect(base64Decode("QUI=")).toEqual(new Uint8Array([0x41, 0x42]));
    expect(base64Decode("QUJD")).toEqual(new Uint8Array([0x41, 0x42, 0x43]));
    expect(base64UrlDecode("QQ")).toEqual(new Uint8Array([0x41]));
    expect(base64UrlDecode("QUI")).toEqual(new Uint8Array([0x41, 0x42]));
  });

  it("returns null, not a throw, for non-string input", () => {
    for (const value of [null, undefined, 5, {}, [], true]) {
      expect(base64Decode(value as unknown as string)).toBeNull();
      expect(base64UrlDecode(value as unknown as string)).toBeNull();
    }
  });
});

describe("utf8", () => {
  it.each(["", "a", "é", "العربية", "🙂", "\u0000", "a\u{10FFFF}", "تجربة 123 — ok"])(
    "matches Buffer for %j",
    (text) => {
      expect(utf8Encode(text)).toEqual(new Uint8Array(Buffer.from(text, "utf8")));
      expect(utf8Decode(utf8Encode(text))).toBe(text);
    },
  );

  it("returns null on invalid UTF-8 and keeps a leading BOM", () => {
    expect(utf8Decode(new Uint8Array([0xff]))).toBeNull();
    expect(utf8Decode(new Uint8Array([0xc3]))).toBeNull();
    expect(utf8Decode(new Uint8Array([0xef, 0xbb, 0xbf, 0x41]))).toBe("\ufeffA");
  });
});

describe("concat, compare and hex", () => {
  it("concatenates", () => {
    expect(concatBytes()).toEqual(new Uint8Array());
    expect(concatBytes(new Uint8Array([1]))).toEqual(new Uint8Array([1]));
    expect(concatBytes(new Uint8Array([1, 2]), new Uint8Array(), new Uint8Array([3]))).toEqual(
      new Uint8Array([1, 2, 3]),
    );
  });

  it("compares equal, different, empty and different-length inputs", () => {
    const a = pattern(32);
    expect(timingSafeEqualBytes(a, pattern(32))).toBe(true);
    expect(timingSafeEqualBytes(new Uint8Array(), new Uint8Array())).toBe(true);
    expect(timingSafeEqualBytes(a, a.slice(0, 31))).toBe(false);
    expect(timingSafeEqualBytes(a.slice(0, 31), a)).toBe(false);
    for (let index = 0; index < a.length; index += 1) {
      const other = a.slice();
      other[index] = (other[index] ?? 0) ^ 0x80;
      expect(timingSafeEqualBytes(a, other)).toBe(false);
    }
  });

  it("writes lowercase hex like Buffer", () => {
    const bytes = pattern(300);
    expect(bytesToHex(bytes)).toBe(Buffer.from(bytes).toString("hex"));
    expect(bytesToHex(new Uint8Array())).toBe("");
  });
});
