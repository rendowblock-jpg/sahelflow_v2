import { describe, expect, it } from "vitest";

import { base64urlDecode, base64urlEncode, endpointHash } from "../util";

describe("base64url", () => {
  it("encodes with the URL alphabet and no padding", () => {
    expect(base64urlEncode(new Uint8Array([251, 255, 254, 1, 2]))).toBe("-__-AQI");
    expect(base64urlEncode(new Uint8Array([]))).toBe("");
  });

  it("decodes what it encodes", () => {
    const bytes = Uint8Array.from({ length: 65 }, (_v, i) => (i * 37) % 256);
    const back = base64urlDecode(base64urlEncode(bytes));
    expect(back).not.toBeNull();
    expect(Buffer.from(back ?? []).equals(Buffer.from(bytes))).toBe(true);
    expect(base64urlDecode("")?.length).toBe(0);
  });

  it.each([
    ["padding", "AQI="],
    ["standard alphabet plus", "AQ+I"],
    ["standard alphabet slash", "AQ/I"],
    ["impossible length", "A"],
    ["space", "AQ I"],
    ["trailing newline", "AQI\n"],
    ["non canonical trailing bits", "AR"],
    ["non ascii", "AQé"],
  ])("refuses %s", (_label, text) => {
    expect(base64urlDecode(text)).toBeNull();
  });
});

describe("endpointHash", () => {
  it("is the first 12 hex characters of sha256", () => {
    expect(endpointHash("abc")).toBe("ba7816bf8f01");
    expect(endpointHash("abc")).toMatch(/^[0-9a-f]{12}$/);
    expect(endpointHash("abd")).not.toBe(endpointHash("abc"));
  });
});
