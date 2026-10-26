/** Token budget helper: an ESTIMATE (no tokenizer ships with the app), good enough to compare request sizes. */
import { describe, expect, it } from "vitest";

import { estimateTokens } from "../budget";

describe("estimateTokens (an estimate: chars/4 for Latin text, chars/2.2 for Arabic script)", () => {
  it("is 0 for empty text", () => {
    expect(estimateTokens("")).toBe(0);
  });
  it("counts Latin text at 4 characters per token, rounding up", () => {
    expect(estimateTokens("a".repeat(400))).toBe(100);
    expect(estimateTokens("abc")).toBe(1);
  });
  it("counts Arabic script at 2.2 characters per token", () => {
    expect(estimateTokens("ع".repeat(220))).toBe(100);
  });
  it("splits a mixed text by script and adds the two parts", () => {
    expect(estimateTokens("a".repeat(40) + "ع".repeat(22))).toBe(20);
  });
  it("treats Arabic presentation forms and Arabic-Indic digits as Arabic script", () => {
    expect(estimateTokens("\uFE8D".repeat(22))).toBe(10);
    expect(estimateTokens("٠١٢٣٤٥٦٧٨٩".repeat(2) + "ع".repeat(2))).toBe(10);
  });
});
