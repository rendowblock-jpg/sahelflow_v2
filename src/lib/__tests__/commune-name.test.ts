import { describe, expect, it } from "vitest";

import communeData from "../../../data/communes.json";
import wilayas from "../../../data/wilayas.json";
import { safeCommune } from "../ai/location-authority";
import { resolveCommuneName } from "../commune-name";

type Row = { code: number; wilayaCode: number; name: string; nameAr: string };
const ALL = communeData as Row[];
const wilayaNameOf = new Map((wilayas as Array<{ code: number; name: string }>).map((w) => [w.code, w.name]));
const listOf = (code: number) => ALL.filter((c) => c.wilayaCode === code);

describe("resolveCommuneName", () => {
  const msila = listOf(28);
  const tipaza = listOf(42);

  it("M'Sila (what a customer card stores) resolves to the list's M'sila", () => {
    expect(resolveCommuneName("M'Sila", "M'Sila", msila)).toBe("M'sila");
  });

  it("Koléa and Kolea resolve to Kolea", () => {
    expect(resolveCommuneName("Tipaza", "Koléa", tipaza)).toBe("Kolea");
    expect(resolveCommuneName("Tipaza", "Kolea", tipaza)).toBe("Kolea");
    expect(resolveCommuneName("Tipaza", "KOLÉA", tipaza)).toBe("Kolea");
  });

  it("ignores case, every apostrophe variant, repeated spaces and hyphen/space differences", () => {
    for (const typed of ["m'sila", "M\u2019SILA", "M\u02BCsila", "M\u2018Sila", "M`sila", "M\u00B4sila", "msila", "M sila", "M-sila", "  M'Sila  ", "M ' sila"]) {
      expect(resolveCommuneName("M'Sila", typed, msila), JSON.stringify(typed)).toBe("M'sila");
    }
    const oran = listOf(31);
    expect(resolveCommuneName("Oran", "Es  Sénia", oran)).toBe("Es Senia");
    expect(resolveCommuneName("Oran", "es-senia", oran)).toBe("Es Senia");
    expect(resolveCommuneName("Oran", "Bir El Djir", oran)).toBe("Bir El Djir");
  });

  it("matches the accented French spellings the demo used (Sétif, Béjaïa)", () => {
    expect(resolveCommuneName("Sétif", "Sétif", listOf(19))).toBe("Setif");
    expect(resolveCommuneName("Béjaïa", "Béjaïa", listOf(6))).toBe("Bejaia");
  });

  it("matches the Arabic name too", () => {
    expect(resolveCommuneName("M'Sila", "المسيلة", msila)).toBe("M'sila");
    expect(resolveCommuneName("Tipaza", "القليعة", tipaza)).toBe("Kolea");
  });

  it("returns the canonical name unchanged when raw already equals it", () => {
    expect(resolveCommuneName("M'Sila", "M'sila", msila)).toBe("M'sila");
  });

  it("returns raw unchanged when nothing matches (unknown commune, a commune of another wilaya, empty)", () => {
    expect(resolveCommuneName("M'Sila", "Nowhereville", msila)).toBe("Nowhereville");
    expect(resolveCommuneName("Tipaza", "M'Sila", tipaza)).toBe("M'Sila");
    expect(resolveCommuneName("M'Sila", "", msila)).toBe("");
    expect(resolveCommuneName("M'Sila", "   ", msila)).toBe("   ");
    expect(resolveCommuneName("", "M'Sila", [])).toBe("M'Sila");
  });

  it("never matches on a fragment (prefix/substring is not a match)", () => {
    expect(resolveCommuneName("M'Sila", "M'si", msila)).toBe("M'si");
    expect(resolveCommuneName("M'Sila", "Maad", msila)).toBe("Maad");
  });

  it("ambiguous input stays unchanged: two rows with the same key", () => {
    const rows = [
      { name: "Sidi Ali", nameAr: "سيدي علي" },
      { name: "Sidi-Ali", nameAr: "سيدي  علي" },
      { name: "Ain Defla", nameAr: "عين الدفلى" },
    ];
    expect(resolveCommuneName("X", "sidi ali", rows)).toBe("sidi ali");
    expect(resolveCommuneName("X", "ain-defla", rows)).toBe("Ain Defla");
  });

  it("ambiguous input stays unchanged: the Latin name of one row is the Arabic name of another", () => {
    const rows = [
      { name: "Foo", nameAr: "bar" },
      { name: "Bar", nameAr: "baz" },
    ];
    expect(resolveCommuneName("X", "BAR", rows)).toBe("BAR");
  });

  it("an exact name wins even when its folded key is shared", () => {
    const rows = [{ name: "Sidi Ali" }, { name: "Sidi-Ali" }];
    expect(resolveCommuneName("X", "Sidi Ali", rows)).toBe("Sidi Ali");
    expect(resolveCommuneName("X", "Sidi-Ali", rows)).toBe("Sidi-Ali");
  });

  it("uses the wilaya name to tell apart rows of a mixed list, when rows carry one", () => {
    const rows = [
      { name: "Sidi Ali", wilayaName: "Mostaganem" },
      { name: "Sidi-Ali", wilayaName: "Tlemcen" },
    ];
    expect(resolveCommuneName("Mostaganem", "sidi ali", rows)).toBe("Sidi Ali");
    expect(resolveCommuneName("Tlemcen", "SIDI ALI", rows)).toBe("Sidi-Ali");
    expect(resolveCommuneName("", "sidi ali", rows)).toBe("sidi ali");
  });

  it("agrees with the app's location authority on every commune of every wilaya (a typed variant resolves to what safeCommune returns)", () => {
    let compared = 0;
    for (const commune of ALL) {
      const wilaya = wilayaNameOf.get(commune.wilayaCode) ?? "";
      if (safeCommune(commune.name, wilaya) !== commune.name) continue; // the authority itself finds this name ambiguous
      const typed = commune.name.toUpperCase().replace(/ /g, "-").replace(/E/g, "\u00C9").replace(/'/g, "\u2019");
      expect(resolveCommuneName(wilaya, typed, listOf(commune.wilayaCode)), typed).toBe(commune.name);
      expect(resolveCommuneName(wilaya, commune.nameAr, listOf(commune.wilayaCode)), commune.nameAr).toBe(safeCommune(commune.nameAr, wilaya) ?? commune.nameAr);
      compared += 1;
    }
    expect(compared).toBeGreaterThan(1400);
  });
});
