import { describe, expect, it } from "vitest";

import { wilayaStoredSpellings } from "@/lib/wilaya-display";

/**
 * NEW-ORDER-WILAYA-FILTER: an order keeps the wilaya as it was written. A manual order holds the French name
 * ("Batna"), a hosted-storefront order holds the 2-digit code ("05"), and an Arabic spelling is possible too.
 * The orders list filters by wilaya code, so it must match every one of those spellings.
 */
describe("wilayaStoredSpellings", () => {
  it("lists the French name, the Arabic name and the code, padded and not", () => {
    expect(wilayaStoredSpellings(5)).toEqual(["Batna", "باتنة", "5", "05"]);
  });

  it("does not repeat the code when it needs no padding", () => {
    expect(wilayaStoredSpellings(16)).toEqual(["Alger", "الجزائر", "16"]);
  });

  it("answers null for a number that is not a wilaya", () => {
    for (const bad of [0, -1, 999, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(wilayaStoredSpellings(bad)).toBeNull();
    }
  });
});
