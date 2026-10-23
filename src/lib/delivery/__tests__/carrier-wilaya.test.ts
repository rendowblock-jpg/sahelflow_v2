import { describe, expect, it, vi } from "vitest";

/**
 * carrierWilayaName() is what a courier adapter receives as the wilaya. It is tested on a SMALL FIXED wilaya list
 * (with an extra row for a new wilaya, 59) so it does not depend on the real data/wilayas.json, which has no row
 * above 58 until the 69-wilaya data ships.
 */
vi.mock("../../../../data/wilayas.json", () => ({
  default: [
    { code: 3, name: "Laghouat", nameAr: "الأغواط", zone: "highPlateaux" },
    { code: 5, name: "Batna", nameAr: "باتنة", zone: "east" },
    { code: 16, name: "Alger", nameAr: "الجزائر", zone: "center" },
    { code: 17, name: "Djelfa", nameAr: "الجلفة", zone: "highPlateaux" },
    { code: 26, name: "Médéa", nameAr: "المدية", zone: "north" },
    { code: 59, name: "Aflou", nameAr: "آفلو", zone: "highPlateaux" },
  ],
}));

import { carrierWilayaName } from "../carrier-wilaya";

describe("carrierWilayaName", () => {
  it("turns a 2-digit code, padded or not, into the wilaya's French name (hosted-storefront orders store the code)", () => {
    expect(carrierWilayaName("05")).toBe("Batna");
    expect(carrierWilayaName("5")).toBe("Batna");
    expect(carrierWilayaName("16")).toBe("Alger");
    expect(carrierWilayaName(" 26 ")).toBe("Médéa");
  });

  it("leaves a recognised wilaya NAME exactly as it was typed, French or Arabic, so nothing that works today changes", () => {
    for (const typed of ["Alger", "alger", "Médéa", "Medea", "الجزائر", "باتنة"]) {
      expect(carrierWilayaName(typed)).toBe(typed);
    }
  });

  it("serves a new wilaya (59..69) under its mother wilaya's name, whether given as a code or as its own name", () => {
    expect(carrierWilayaName("59")).toBe("Laghouat");
    expect(carrierWilayaName("Aflou")).toBe("Laghouat");
    expect(carrierWilayaName("آفلو")).toBe("Laghouat");
    expect(carrierWilayaName("65")).toBe("Djelfa");
    expect(carrierWilayaName("66")).toBe("Djelfa");
  });

  it("passes unrecognised text and impossible codes through unchanged instead of guessing", () => {
    for (const odd of ["", "  ", "Atlantis", "99", "00", "0", "123", "5a", "05 Batna"]) {
      expect(carrierWilayaName(odd)).toBe(odd);
    }
  });
});
