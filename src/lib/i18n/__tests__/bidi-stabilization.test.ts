import { describe, expect, it } from "vitest";

import { stabilizeBidiText } from "@/lib/i18n";
import arTranslations from "@/lib/i18n/locales/ar.json";

const LRI = "\u2066";
const PDI = "\u2069";

describe("Arabic bidi stabilization", () => {
  it("isolates the analytics benchmark ranges that were visually reversed in RTL", () => {
    const raw = arTranslations["analytics.returnRateHint"];
    const stabilized = stabilizeBidiText(raw, "ar");

    expect(stabilized).toContain(`${LRI}25-40%${PDI}`);
    expect(stabilized).toContain(`${LRI}8-15%${PDI}`);
    expect(stabilized).not.toContain("%40-25");
    expect(stabilized).not.toContain("%15-8");
  });

  it("isolates Latin technical identifiers without changing the source value", () => {
    expect(stabilizeBidiText("الطلب SF-00012 جاهز", "ar")).toBe(
      `الطلب ${LRI}SF-00012${PDI} جاهز`,
    );
  });

  it("does not add directional controls to LTR locales", () => {
    const value = "Industry average 25-40%, best 8-15%.";
    expect(stabilizeBidiText(value, "en")).toBe(value);
    expect(stabilizeBidiText(value, "fr")).toBe(value);
  });
});
