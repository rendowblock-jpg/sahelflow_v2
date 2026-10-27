import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import communeData from "../../../../data/communes.json";
import wilayas from "../../../../data/wilayas.json";
import { safeCommune } from "../../../../src/lib/ai/location-authority";
import manifest from "../asset-manifest.generated.json";
import { foldArabic, foldLatin, searchCommunes, type CommuneIndexRow } from "./communes";

let loaded: CommuneIndexRow[] | undefined;
/** The index the browser will fetch, read from the committed build output. Read on first use so a missing file fails one test, not the whole file. */
function builtIndex(): CommuneIndexRow[] {
  loaded ??= JSON.parse(readFileSync(join(process.cwd(), "control-plane/storefront/public", manifest.communes, "all.json"), "utf8")) as CommuneIndexRow[];
  return loaded;
}
const ALL_WILAYAS = Array.from({ length: 69 }, (_, i) => String(i + 1).padStart(2, "0"));
const names = (rows: Array<{ latin: string }>) => rows.map((row) => row.latin);

describe("foldLatin", () => {
  it("drops case, accents, hyphens, apostrophes and spaces", () => {
    expect(foldLatin("Bordj Bou Arréridj")).toBe("bordjbouarreridj");
    expect(foldLatin("AÏN-DEFLA")).toBe("aindefla");
    for (const typed of ["M'Sila", "M’sila", "m sila", "MSILA", "M-sila"]) expect(foldLatin(typed)).toBe("msila");
    expect(foldLatin("  Hassi R'mel ")).toBe("hassirmel");
  });

  it("agrees with the app's location authority: a spelling it reads as the same commune folds to the same key", () => {
    const wilayaName = new Map((wilayas as Array<{ code: number; name: string }>).map((w) => [w.code, w.name]));
    let compared = 0;
    for (const commune of communeData as Array<{ wilayaCode: number; name: string }>) {
      const wilaya = wilayaName.get(commune.wilayaCode);
      if (!wilaya || safeCommune(commune.name, wilaya) !== commune.name) continue; // skip names the authority itself finds ambiguous in their wilaya
      const typed = commune.name.toUpperCase().replace(/ /g, "-").replace(/E/g, "É").replace(/'/g, "’");
      expect(safeCommune(typed, wilaya), typed).toBe(commune.name);
      expect(foldLatin(typed), typed).toBe(foldLatin(commune.name));
      compared += 1;
    }
    expect(compared).toBeGreaterThan(1400);
  });
});

describe("foldArabic", () => {
  const same = (...forms: string[]) => {
    const keys = new Set(forms.map(foldArabic));
    expect([...keys], forms.join(" | ")).toHaveLength(1);
    expect([...keys][0]).not.toBe("");
  };

  it("drops vowel marks and tatweel", () => {
    same("محمد", "مُحَمَّد");
    same("عين", "عيـــن");
  });

  it("folds every alef form to the bare alef", () => {
    same("أدرار", "ادرار", "إدرار", "آدرار", "ٱدرار");
  });

  it("folds alef-maqsura to ya and ta-marbuta to ha", () => {
    same("الدفلى", "الدفلي");
    same("بريكة", "بريكه");
  });

  it("folds hamza on waw and on ya", () => {
    same("مؤمن", "مومن");
    same("بئر الشهداء", "بير الشهداء", "بــئــر الشهداء");
  });

  it("folds the letter forms the commune list uses to the ones a phone keyboard types", () => {
    same("رڨان", "رقان");
    same("بنو ھلال", "بنو هلال");
    same("ﻟﺒﻦ", "لبن"); // presentation forms found in the list
  });

  it("ignores spaces, hyphens and the invisible direction mark", () => {
    expect(foldArabic("عين دفلة - عين الدفلى")).toBe("عيندفلهعينالدفلي");
    expect(foldArabic("\u200eباب الزوار")).toBe("بابالزوار");
  });
});

describe("searchCommunes ranking", () => {
  const index: CommuneIndexRow[] = [
    ["Abenou", "ابنو", "01"],
    ["Sidi Ben Adda", "سيدي بن عدة", "01"],
    ["Benni", "بني", "01"],
    ["Ben Badis", "ابن باديس", "01"],
    ["Ben", "بن", "01"],
  ];

  it("puts the exact name first, then names that start with the text, then names with a word that starts with it, then the rest", () => {
    expect(names(searchCommunes(index, "ben", ["01"]))).toEqual(["Ben", "Benni", "Ben Badis", "Sidi Ben Adda", "Abenou"]);
  });

  it("keeps the index order between equals, and gives the same answer twice", () => {
    const first = searchCommunes(index, "BEN", ["01"]);
    expect(searchCommunes(index, "  ben  ", ["01"])).toEqual(first);
    expect(names(searchCommunes([["B", "ب", "01"], ["A", "ا", "01"]], "", ["01"]))).toEqual([]);
    expect(names(searchCommunes([["Xb", "", "01"], ["Xa", "", "01"]], "x", ["01"]))).toEqual(["Xb", "Xa"]);
  });

  it("matches a word of the name typed after the first word, with the separators the buyer happens to use", () => {
    expect(names(searchCommunes(index, "ben-adda", ["01"]))).toEqual(["Sidi Ben Adda"]);
    expect(names(searchCommunes(index, "sidi ben", ["01"]))).toEqual(["Sidi Ben Adda"]);
  });

  it("ranks Arabic the same way and reads the Arabic spellings as one", () => {
    const arabic: CommuneIndexRow[] = [
      ["Contains", "ابنة", "01"],
      ["Word", "عين بنة", "01"],
      ["Prefix", "بنة قديمة", "01"],
      ["Exact", "بنه", "01"],
    ];
    expect(names(searchCommunes(arabic, "بنة", ["01"]))).toEqual(["Exact", "Prefix", "Word", "Contains"]);
  });

  it("returns plain rows with the two-digit wilaya code and does not change the index", () => {
    const copy = JSON.stringify(index);
    const rows = searchCommunes(index, "ben badis", ["01"]);
    expect(rows).toEqual([{ latin: "Ben Badis", arabic: "ابن باديس", wilayaCode: "01" }]);
    expect(JSON.stringify(index)).toBe(copy);
  });
});

describe("searchCommunes on the built index", () => {
  it("returns both Menaa rows, each with its own wilaya code and Arabic name", () => {
    const rows = searchCommunes(builtIndex(), "menaa", ALL_WILAYAS);
    expect(rows.map((row) => [row.latin, row.wilayaCode])).toEqual([["Menaa", "05"], ["Menaa", "68"]]);
    expect(rows[0]?.arabic).not.toBe(rows[1]?.arabic);
  });

  it("offers only communes of the wilayas the seller prices", () => {
    expect(searchCommunes(builtIndex(), "menaa", ["05"]).map((row) => row.wilayaCode)).toEqual(["05"]);
    expect(searchCommunes(builtIndex(), "menaa", ["68"]).map((row) => row.wilayaCode)).toEqual(["68"]);
    expect(searchCommunes(builtIndex(), "menaa", ["16"])).toEqual([]);
    expect(searchCommunes(builtIndex(), "menaa", [])).toEqual([]);
    const bab = searchCommunes(builtIndex(), "bab", ["16"]);
    expect(names(bab)).toContain("Bab Ezzouar");
    expect(new Set(bab.map((row) => row.wilayaCode))).toEqual(new Set(["16"]));
  });

  it("shows Barika only under wilaya 60, whatever the buyer types", () => {
    for (const typed of ["Barika", "barika", "BARIKA", "bari", "بريكة", "بريكه"]) {
      const rows = searchCommunes(builtIndex(), typed, ALL_WILAYAS);
      expect(names(rows), typed).toContain("Barika");
      expect(rows.filter((row) => row.latin === "Barika").map((row) => row.wilayaCode), typed).toEqual(["60"]);
    }
    expect(searchCommunes(builtIndex(), "barika", ["05"])).toEqual([]);
  });

  it("finds a commune by its Latin or Arabic name however it is spelled", () => {
    expect(searchCommunes(builtIndex(), "AÏN DEFLA", ALL_WILAYAS)[0]).toMatchObject({ latin: "Ain Defla", wilayaCode: "44" });
    expect(searchCommunes(builtIndex(), "أدرار", ALL_WILAYAS)[0]).toMatchObject({ latin: "Adrar", wilayaCode: "01" });
    expect(searchCommunes(builtIndex(), "ادرار", ALL_WILAYAS)[0]).toMatchObject({ latin: "Adrar", wilayaCode: "01" });
    expect(names(searchCommunes(builtIndex(), "عين الدفلى", ["44"]))).toContain("Ain Defla");
    expect(searchCommunes(builtIndex(), "قالمة", ALL_WILAYAS)[0]).toMatchObject({ latin: "Guelma", wilayaCode: "24" });
  });

  it("never returns more than the limit (8 unless told otherwise)", () => {
    expect(searchCommunes(builtIndex(), "ain", ALL_WILAYAS)).toHaveLength(8);
    expect(searchCommunes(builtIndex(), "ain", ALL_WILAYAS, 3)).toHaveLength(3);
    expect(searchCommunes(builtIndex(), "ain", ALL_WILAYAS, 0)).toEqual([]);
    expect(searchCommunes(builtIndex(), "ain", ALL_WILAYAS, -2)).toEqual([]);
    expect(searchCommunes(builtIndex(), "ain", ALL_WILAYAS, 500).length).toBeGreaterThan(8);
  });

  it("returns nothing for an empty, blank or symbol-only query, and for a name that does not exist", () => {
    for (const typed of ["", " ", "   \t", "-", "' - '", "\u200e"]) expect(searchCommunes(builtIndex(), typed, ALL_WILAYAS), JSON.stringify(typed)).toEqual([]);
    expect(searchCommunes(builtIndex(), "zzzzzz", ALL_WILAYAS)).toEqual([]);
  });

  it("keeps every namesake as its own row", () => {
    const rows = searchCommunes(builtIndex(), "ben badis", ALL_WILAYAS);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(new Set(rows.map((row) => row.wilayaCode)).size).toBe(rows.length);
  });
});
