import { describe, expect, it, vi } from "vitest";

/**
 * safeCommune() decides what commune text a remote AI model may see: a label that matches more than one
 * commune identity must fail closed (null). This file pins that rule on a SMALL FIXED data set so it never
 * depends on the real data/communes.json (which once held two "El Ogla" rows and two communes sharing one
 * Arabic label by mistake, and a test that leaned on those mistakes broke when they were fixed).
 */
vi.mock("../../../../data/communes.json", () => ({
  default: [
    { code: 1, wilayaCode: 12, name: "Twin", nameAr: "توأم", postCode: "12001" },
    { code: 2, wilayaCode: 12, name: "Twin", nameAr: "توأم ثان", postCode: "12002" },
    { code: 3, wilayaCode: 12, name: "Solo", nameAr: "منفرد", postCode: "12003" },
    { code: 4, wilayaCode: 14, name: "Alpha", nameAr: "مشترك", postCode: "14001" },
    { code: 5, wilayaCode: 14, name: "Beta", nameAr: "مشترك", postCode: "14002" },
    { code: 6, wilayaCode: 9, name: "Shared", nameAr: "مشاركة", postCode: "09001" },
    { code: 7, wilayaCode: 5, name: "Shared", nameAr: "مشاركة", postCode: "05001" },
  ],
}));

import { safeCommune } from "../location-authority";

describe("safeCommune fails closed on an ambiguous label", () => {
  it("returns the name for a label that matches exactly one commune (control)", () => {
    expect(safeCommune("Solo", "Tébessa")).toBe("Solo");
    expect(safeCommune("منفرد")).toBe("Solo");
  });

  it("returns null when one French name is shared by two communes of the SAME wilaya", () => {
    expect(safeCommune("Twin", "Tébessa")).toBeNull();
  });

  it("returns null when one Arabic label is shared by two communes of the same wilaya", () => {
    expect(safeCommune("مشترك", "Tiaret")).toBeNull();
  });

  it("returns null without a wilaya when the label matches communes of different wilayas", () => {
    expect(safeCommune("Shared")).toBeNull();
    expect(safeCommune("مشاركة")).toBeNull();
  });

  it("resolves the same shared label once a wilaya picks one of them", () => {
    expect(safeCommune("Shared", "Blida")).toBe("Shared");
    expect(safeCommune("Shared", "Batna")).toBe("Shared");
  });

  it("returns null when the wilaya is unknown or the label is unknown", () => {
    expect(safeCommune("Solo", "Atlantis")).toBeNull();
    expect(safeCommune("Nowhere", "Tébessa")).toBeNull();
  });
});
