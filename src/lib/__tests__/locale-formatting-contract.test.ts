import { describe, expect, it } from "vitest";

import {
  formatDZD,
  formatRelative,
  intlLocale,
} from "@/lib/utils";

describe("seller-facing locale formatting", () => {
  it("uses the Algeria-aware locale map consistently", () => {
    expect(intlLocale("ar")).toBe("ar-DZ");
    expect(intlLocale("fr")).toBe("fr-DZ");
    expect(intlLocale("en")).toBe("en-GB");
  });

  it("shapes Arabic currency digits and keeps the local DZD suffix", () => {
    const formatted = formatDZD(1893500, "ar");
    expect(formatted).toContain("دج");
    expect(formatted).toMatch(/[٠-٩]/);
  });

  it("uses Intl relative-time grammar instead of concatenating raw JS numbers", () => {
    const now = new Date("2026-08-14T12:00:00.000Z");
    const thirtyMinutesAgo = new Date("2026-08-14T11:30:00.000Z");

    const ar = formatRelative(thirtyMinutesAgo, "ar", now);
    const fr = formatRelative(thirtyMinutesAgo, "fr", now);
    const en = formatRelative(thirtyMinutesAgo, "en", now);

    expect(ar).toMatch(/[٠-٩]/);
    expect(ar).not.toContain("30 دقيقة");
    expect(fr.toLowerCase()).toContain("minute");
    expect(en.toLowerCase()).toContain("minute");
  });
});
