import { describe, expect, it } from "vitest";

import { interpolateTranslation } from "@/lib/i18n";

describe("translation interpolation", () => {
  it("supports canonical double-brace placeholders", () => {
    expect(
      interpolateTranslation("{{count}} conversations", { count: 3 }),
    ).toBe("3 conversations");
  });

  it("supports retained single-brace placeholders without leaking template syntax", () => {
    expect(interpolateTranslation("{count} تصنيفات", { count: 4 })).toBe(
      "4 تصنيفات",
    );
    expect(interpolateTranslation("تم التعيين لـ {name}", { name: "سمير" })).toBe(
      "تم التعيين لـ سمير",
    );
  });
});
