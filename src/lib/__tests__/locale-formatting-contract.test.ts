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

  it("uses the platform's Algerian Arabic number conventions with the local DZD suffix", () => {
    const expectedNumber = new Intl.NumberFormat("ar-DZ", {
      style: "decimal",
      maximumFractionDigits: 0,
    }).format(1_893_500);

    expect(formatDZD(1_893_500, "ar")).toBe(`${expectedNumber} دج`);
  });

  it("delegates relative-time grammar to Intl instead of concatenating translated fragments", () => {
    const now = new Date("2026-08-14T12:00:00.000Z");
    const thirtyMinutesAgo = new Date("2026-08-14T11:30:00.000Z");

    for (const [locale, localeTag] of [
      ["ar", "ar-DZ"],
      ["fr", "fr-DZ"],
      ["en", "en-GB"],
    ] as const) {
      const expected = new Intl.RelativeTimeFormat(localeTag, {
        numeric: "auto",
        style: "long",
      }).format(-30, "minute");
      expect(formatRelative(thirtyMinutesAgo, locale, now)).toBe(expected);
    }
  });
});
