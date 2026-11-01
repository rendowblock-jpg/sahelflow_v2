import { describe, expect, it } from "vitest";

import { APPROVAL_TEXT_CUT, describeApprovalText, sanitizeApprovalText } from "@/components/ai/approval-display-text";

describe("approval display text", () => {
  it("leaves ordinary text, Arabic and French accents untouched", () => {
    const value = "Livrer à Béjaïa - التوصيل بعد الظهر\nmerci";
    expect(describeApprovalText(value)).toEqual({ shown: value, full: value, cut: 0, marks: 0 });
  });

  it("writes direction-changing and invisible characters out instead of obeying them", () => {
    const { text, marks } = sanitizeApprovalText("ok\u202Eevil\u200B\u2066x\u2069\u0007");
    expect(marks).toBe(5);
    expect(text).toBe("ok[U+202E]evil[U+200B][U+2066]x[U+2069][U+0007]");
    for (const raw of ["\u202E", "\u200B", "\u2066", "\u2069", "\u0007"]) {
      expect(text).not.toContain(raw);
    }
  });

  it("cuts a long value at the limit and says how many characters are left out", () => {
    const long = "a".repeat(APPROVAL_TEXT_CUT + 123);
    const view = describeApprovalText(long);
    expect(view.shown).toHaveLength(APPROVAL_TEXT_CUT);
    expect(view.cut).toBe(123);
    expect(view.full).toBe(long);
  });

  it("counts characters, not UTF-16 units, so an emoji is never split", () => {
    const view = describeApprovalText("😀".repeat(10), 4);
    expect(view.shown).toBe("😀😀😀😀");
    expect(view.cut).toBe(6);
  });
});
