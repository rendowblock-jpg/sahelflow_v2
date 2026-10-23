import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * NEW-COMMUNE-WILAYA-WRONG: data/communes.json is what a buyer, the order form, the courier lookup and the
 * address reader use to know which commune is in which wilaya. Before this test it held 21 rows with the wrong
 * wilaya and 8 rows that carried a NAMESAKE commune's name, Arabic name and wilaya (the real commune was missing).
 *
 * Sources (read, saved in audit/research-out/w69/):
 *  - Loi 19-12 of Dec 2019, JO n.78 (art. 52 bis .. 52 bis 9): the communes of wilayas 49..58.
 *  - Loi 26-06 of 4 Apr 2026, JO n.25 and the arrete of 5 May 2026, JO n.58 (annex, French and Arabic): the commune
 *    lists of the 10 mother wilayas and the 11 new ones, with one code per commune.
 *
 * This file pins the 58-wilaya map as it is TODAY. The 69-wilaya reform (wilayas 59..69) is a separate change.
 */

type Commune = {
  code: number;
  wilayaCode: number;
  name: string;
  nameAr: string;
  postCode: string;
};
type Wilaya = { code: number; name: string; nameAr: string; zone: string };

const ROOT = join(__dirname, "..", "..", "..");
const communes = JSON.parse(readFileSync(join(ROOT, "data", "communes.json"), "utf8")) as Commune[];
const wilayas = JSON.parse(readFileSync(join(ROOT, "data", "wilayas.json"), "utf8")) as Wilaya[];
const byCode = new Map(communes.map((c) => [c.code, c]));

/** The wilaya a commune belonged to BEFORE 2019 = the first digits of its postCode (WW + 3 digits). */
const prefix = (c: Commune) => Number(c.postCode.slice(0, -3));

/** Loi 19-12: new wilaya -> the wilaya it was carved from (that is the postCode prefix of its communes). */
const MOTHER_2019: Record<number, number> = {
  49: 1, 50: 1, 51: 7, 52: 8, 53: 11, 54: 11, 55: 30, 56: 33, 57: 39, 58: 47,
};
/** Loi 19-12: number of communes of each new wilaya (JO n.78). */
const COUNT_2019: Record<number, number> = {
  49: 10, 50: 2, 51: 6, 52: 10, 53: 3, 54: 2, 55: 14, 56: 2, 57: 8, 58: 3,
};
/**
 * Number of communes of each wilaya that the 2026 reform cut up, BEFORE the cut (annex of JO n.58: the commune
 * list that remains, plus the communes that moved to wilayas 59..69).
 */
const COUNT_BEFORE_2026: Record<number, number> = {
  3: 24, 5: 61, 7: 27, 12: 28, 13: 53, 14: 42, 17: 36, 26: 64, 28: 47, 32: 22,
};
/** The communes whose NAME was a namesake's. Values are the annex (French and Arabic) of JO n.58. */
const CORRECTED: Array<{ code: number; postCode: string; wilayaCode: number; name: string; nameAr: string }> = [
  { code: 439, postCode: "13048", wilayaCode: 13, name: "Beni Khellad", nameAr: "بني خلاد" },
  { code: 443, postCode: "13052", wilayaCode: 13, name: "Beni Semiel", nameAr: "بنى صميل" },
  { code: 402, postCode: "13011", wilayaCode: 13, name: "Oued Lakhdar", nameAr: "وادي الأخضر" },
  { code: 463, postCode: "14019", wilayaCode: 14, name: "Djebilet Rosfa", nameAr: "جبيلة الرصفاء" },
  { code: 911, postCode: "26013", wilayaCode: 26, name: "Tizi Mahdi", nameAr: "تيزي مهدي" },
  { code: 378, postCode: "12015", wilayaCode: 12, name: "El Ogla El Melha", nameAr: "العقلة المالحة" },
  { code: 1028, postCode: "28034", wilayaCode: 28, name: "Mouhamed Boudiaf", nameAr: "محمد بوضياف" },
  { code: 1033, postCode: "28039", wilayaCode: 28, name: "Menaa", nameAr: "مناعة" },
];
/** Rows whose name was right but whose wilaya was a namesake's, with the wilaya the law gives them. */
const WILAYA_ONLY: Record<number, number> = {
  17: 49, 27: 49, 236: 51, 237: 51, 239: 51, 292: 9, 351: 10, 482: 14, 484: 14, 737: 20, 824: 22,
  851: 23, 871: 24, 879: 24, 1098: 55, 1109: 55, 1156: 32, 1346: 41,
};

describe("data/communes.json integrity (58 wilayas)", () => {
  it("has 1541 communes with contiguous codes and unique postCodes", () => {
    expect(communes).toHaveLength(1541);
    expect(communes.map((c) => c.code)).toEqual(Array.from({ length: 1541 }, (_, i) => i + 1));
    expect(new Set(communes.map((c) => c.postCode)).size).toBe(1541);
  });

  it("gives every commune a wilaya that exists, and every wilaya at least one commune", () => {
    const known = new Set(wilayas.map((w) => w.code));
    expect(communes.filter((c) => !known.has(c.wilayaCode)).map((c) => c.code)).toEqual([]);
    const used = new Set(communes.map((c) => c.wilayaCode));
    expect([...known].filter((code) => !used.has(code))).toEqual([]);
  });

  it("keeps every commune in the wilaya its postCode names, or in the 2019 wilaya carved out of it", () => {
    const wrong = communes
      .filter((c) => c.wilayaCode !== prefix(c) && MOTHER_2019[c.wilayaCode] !== prefix(c))
      .map((c) => `${c.code} ${c.name} (post ${c.postCode}) is in wilaya ${c.wilayaCode}`);
    expect(wrong).toEqual([]);
  });

  it("gives each 2019 wilaya exactly the number of communes Loi 19-12 lists", () => {
    const counts: Record<number, number> = {};
    for (const c of communes) if (c.wilayaCode >= 49) counts[c.wilayaCode] = (counts[c.wilayaCode] ?? 0) + 1;
    expect(counts).toEqual(COUNT_2019);
  });

  it("gives each wilaya cut by the 2026 reform the number of communes it had before the cut", () => {
    const counts: Record<number, number> = {};
    for (const code of Object.keys(COUNT_BEFORE_2026)) counts[Number(code)] = 0;
    for (const c of communes) if (c.wilayaCode in counts) counts[c.wilayaCode] += 1;
    expect(counts).toEqual(COUNT_BEFORE_2026);
  });

  it("carries the annex name, Arabic name and wilaya for the eight communes that held a namesake", () => {
    for (const want of CORRECTED) {
      const row = byCode.get(want.code);
      expect(row, `commune ${want.code} exists`).toBeDefined();
      expect({ postCode: row!.postCode, wilayaCode: row!.wilayaCode, name: row!.name, nameAr: row!.nameAr }).toEqual({
        postCode: want.postCode,
        wilayaCode: want.wilayaCode,
        name: want.name,
        nameAr: want.nameAr,
      });
    }
  });

  it("puts the eighteen communes that had a namesake's wilaya in the wilaya the law gives them", () => {
    const got = Object.fromEntries(Object.keys(WILAYA_ONLY).map((code) => [code, byCode.get(Number(code))!.wilayaCode]));
    expect(got).toEqual(Object.fromEntries(Object.entries(WILAYA_ONLY).map(([code, w]) => [code, w])));
  });

  it("lists no (wilaya, name) twice, except the two Mascara rows still to be checked", () => {
    const seen = new Map<string, number[]>();
    for (const c of communes) {
      const key = `${c.wilayaCode}|${c.name.trim().toLowerCase()}`;
      seen.set(key, [...(seen.get(key) ?? []), c.code]);
    }
    const repeated = [...seen.entries()].filter(([, codes]) => codes.length > 1);
    // 1052 and 1065 are both "Ain Ferah" in Mascara (29): one is probably Ain Fekan. Neither law covers Mascara,
    // so it stays open as NEW-COMMUNE-WILAYA-WRONG instead of being guessed.
    expect(repeated).toEqual([["29|ain ferah", [1052, 1065]]]);
  });
});
