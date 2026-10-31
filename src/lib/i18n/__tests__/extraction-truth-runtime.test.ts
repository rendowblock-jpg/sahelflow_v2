import { describe, expect, it } from "vitest";
import { getExtractionTruthRuntimeTranslation as get } from "@/lib/i18n/extraction-truth-runtime";

describe("extraction truth runtime copy", () => {
  it("has both labels in en, fr and ar", () => {
    for (const locale of ["en", "fr", "ar"] as const) {
      for (const key of ["analytics.extraction.notMeasured", "analytics.extraction.selfReported"]) {
        expect((get(locale, key) ?? "").length, `${locale} ${key}`).toBeGreaterThan(3);
      }
    }
    expect(get("en", "analytics.extraction.notMeasured")).toBe("not measured");
    expect(get("fr", "analytics.extraction.selfReported")).toBe("déclaré par le modèle");
    expect(get("ar", "analytics.extraction.notMeasured")).toMatch(/\p{Script=Arabic}/u);
    expect(get("en", "analytics.extraction.nothing")).toBeUndefined();
  });
});
