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
 * STORE-WILAYA69 step B: the map has 69 wilayas. The 108 communes of the eleven wilayas created by Loi 26-06 are the
 * annex of JO n.58, matched to this file's rows (the pairing is the table MOVED_2026 below).
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
  { code: 378, postCode: "12015", wilayaCode: 62, name: "El Ogla El Melha", nameAr: "العقلة المالحة" },
  { code: 1028, postCode: "28034", wilayaCode: 68, name: "Mouhamed Boudiaf", nameAr: "محمد بوضياف" },
  { code: 1033, postCode: "28039", wilayaCode: 68, name: "Menaa", nameAr: "مناعة" },  // Mascara: Wikipedia (ONS 2911 Aïn Ferah, ONS 2924 Aïn Fares) -- a secondary source, NOT a Journal Officiel.
  { code: 1065, postCode: "29024", wilayaCode: 29, name: "Ain Fares", nameAr: "عين فارس" },
];
/** Rows whose name was right but whose wilaya was a namesake's, with the wilaya the law gives them. */
const WILAYA_ONLY: Record<number, number> = {
  17: 49, 27: 49, 236: 51, 237: 51, 239: 51, 292: 9, 351: 10, 482: 14, 484: 64, 737: 20, 824: 22,
  851: 23, 871: 24, 879: 24, 1098: 55, 1109: 55, 1156: 32, 1346: 41,
};

/** Loi 26-06 / JO n.58: wilaya created in 2026 -> the wilaya it was cut from (= the postCode prefix of its communes). */
const MOTHER_2026: Record<number, number> = {
  59: 3, 60: 5, 61: 7, 62: 12, 63: 13, 64: 14, 65: 17, 66: 17, 67: 26, 68: 28, 69: 32,
};
/** JO n.58 annex, French and Arabic: name of each new wilaya and the data row of its seat (chef-lieu). */
const NEW_WILAYAS_2026: Array<{ code: number; name: string; nameAr: string; seat: number }> = [
  { code: 59, name: "Aflou", nameAr: "آفلو", seat: 82 },
  { code: 60, name: "Barika", nameAr: "بريكة", seat: 158 },
  { code: 61, name: "El Kantara", nameAr: "القنطرة", seat: 246 },
  { code: 62, name: "Bir El Ater", nameAr: "بئر العاتر", seat: 365 },
  { code: 63, name: "El Aricha", nameAr: "العريشة", seat: 423 },
  { code: 64, name: "Ksar Chellala", nameAr: "قصر الشلالة", seat: 473 },
  { code: 65, name: "Aïn Ouessara", nameAr: "عين وسارة", seat: 641 },
  { code: 66, name: "Messaad", nameAr: "مسعد", seat: 627 },
  { code: 67, name: "Ksar El Boukhari", nameAr: "قصر البخاري", seat: 933 },
  { code: 68, name: "Bou Saada", nameAr: "بوسعادة", seat: 1014 },
  { code: 69, name: "El Abiodh Sidi Cheikh", nameAr: "الأبيض سيدي الشيخ", seat: 1142 },
];
/** The communes the annex of JO n.58 lists for each new wilaya, as data/communes.json codes (108 in all). */
const MOVED_2026: Record<number, number[]> = {
  59: [73, 74, 75, 76, 77, 78, 79, 80, 82, 84, 85, 87],
  60: [130, 131, 134, 145, 158, 159, 171, 172],
  61: [232, 246, 247, 248, 249],
  62: [365, 372, 378, 391],
  63: [401, 423, 432, 434],
  64: [453, 473, 474, 479, 483, 484],
  65: [618, 619, 621, 629, 630, 631, 641, 642, 643, 645],
  66: [616, 617, 627, 628, 632, 634, 639, 644],
  67: [901, 902, 906, 908, 915, 916, 920, 921, 923, 929, 930, 933, 936, 938, 939, 940, 947, 949, 955, 956, 962],
  68: [1001, 1002, 1014, 1015, 1016, 1017, 1018, 1019, 1020, 1021, 1027, 1028, 1029, 1030, 1031, 1032, 1033, 1035, 1036, 1037, 1038, 1040, 1041],
  69: [1142, 1143, 1144, 1148, 1149, 1151, 1154],
};
/** What the annex says each of the ten cut wilayas keeps. */
const COUNT_AFTER_2026: Record<number, number> = {
  3: 12, 5: 53, 7: 22, 12: 24, 13: 49, 14: 36, 17: 18, 26: 43, 28: 24, 32: 15,
};
const ZONES = ["north", "east", "west", "center", "highPlateaux", "south"];

describe("data/communes.json and data/wilayas.json integrity (69 wilayas)", () => {
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

  it("keeps every commune in the wilaya its postCode names, or in the 2019 or 2026 wilaya carved out of it", () => {
    const wrong = communes
      .filter((c) => c.wilayaCode !== prefix(c) && MOTHER_2019[c.wilayaCode] !== prefix(c) && MOTHER_2026[c.wilayaCode] !== prefix(c))
      .map((c) => `${c.code} ${c.name} (post ${c.postCode}) is in wilaya ${c.wilayaCode}`);
    expect(wrong).toEqual([]);
  });

  it("gives each 2019 wilaya exactly the number of communes Loi 19-12 lists", () => {
    const counts: Record<number, number> = {};
    for (const c of communes) if (c.wilayaCode >= 49 && c.wilayaCode <= 58) counts[c.wilayaCode] = (counts[c.wilayaCode] ?? 0) + 1;
    expect(counts).toEqual(COUNT_2019);
  });

  it("gives each wilaya cut by the 2026 reform, together with its new wilayas, the communes it had before the cut", () => {
    const total: Record<number, number> = {};
    for (const code of Object.keys(COUNT_BEFORE_2026)) total[Number(code)] = 0;
    for (const c of communes) {
      const root = MOTHER_2026[c.wilayaCode] ?? c.wilayaCode;
      if (root in total) total[root] = (total[root] ?? 0) + 1;
    }
    expect(total).toEqual(COUNT_BEFORE_2026);
  });

  it("carries the corrected name, Arabic name and wilaya for the nine communes that held a namesake", () => {
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

  it("lists no (wilaya, name) twice", () => {
    const seen = new Map<string, number[]>();
    for (const c of communes) {
      const key = `${c.wilayaCode}|${c.name.trim().toLowerCase()}`;
      seen.set(key, [...(seen.get(key) ?? []), c.code]);
    }
    expect([...seen.entries()].filter(([, codes]) => codes.length > 1)).toEqual([]);
  });

  it("lists 69 wilayas with contiguous codes, a French and an Arabic name each and a zone the risk engine knows", () => {
    expect(wilayas.map((w) => w.code)).toEqual(Array.from({ length: 69 }, (_, i) => i + 1));
    expect(wilayas.filter((w) => !w.name.trim() || !w.nameAr.trim() || !ZONES.includes(w.zone)).map((w) => w.code)).toEqual([]);
  });

  it("names the eleven wilayas of Loi 26-06 as the annex of JO n.58 does, in the zone of the wilaya they were cut from", () => {
    for (const want of NEW_WILAYAS_2026) {
      const row = wilayas.find((w) => w.code === want.code);
      expect(row, `wilaya ${want.code} exists`).toBeDefined();
      expect({ name: row!.name, nameAr: row!.nameAr }).toEqual({ name: want.name, nameAr: want.nameAr });
      // INFERRED choice: the zone only seeds the delivery-risk profile; a new wilaya starts on its mother's.
      expect(row!.zone).toBe(wilayas.find((w) => w.code === MOTHER_2026[want.code])!.zone);
    }
  });

  it("gives each new wilaya exactly the communes the annex of JO n.58 lists for it", () => {
    const got: Record<number, number[]> = {};
    for (const c of communes) if (c.wilayaCode >= 59) (got[c.wilayaCode] ??= []).push(c.code);
    expect(got).toEqual(MOVED_2026);
    expect(Object.values(MOVED_2026).flat()).toHaveLength(108);
  });

  it("leaves each cut wilaya the communes the annex says it keeps", () => {
    const counts: Record<number, number> = {};
    for (const code of Object.keys(COUNT_AFTER_2026)) counts[Number(code)] = 0;
    for (const c of communes) if (c.wilayaCode in counts) counts[c.wilayaCode] = (counts[c.wilayaCode] ?? 0) + 1;
    expect(counts).toEqual(COUNT_AFTER_2026);
  });

  it("puts the seat of each new wilaya inside it", () => {
    for (const want of NEW_WILAYAS_2026) expect(byCode.get(want.seat)!.wilayaCode).toBe(want.code);
  });
});
