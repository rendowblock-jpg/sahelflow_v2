import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * NEW-COMMUNE-ARABIC-NAMES: the Arabic name of six communes was another place's name. Found by comparing every
 * commune the annex of the arrete of 5 May 2026 (JO n.58, Arabic edition) lists (404 of them) with data/communes.json:
 * 351 match, 47 differ only in spelling (left as they are), and these six are different words.
 *  - Nadorah held Mellakou's name, and El Bayadh's Sidi Amar held M'Sila's Sidi Ameur (copies of another row);
 *  - Souahlia and Beni Ouarsous held the name of their seat (Tounane, Bordj Arima) instead of their own;
 *  - El Haouita and Lioua held an unrelated word.
 */
type Commune = { code: number; wilayaCode: number; name: string; nameAr: string; postCode: string };
const communes = JSON.parse(readFileSync(join(__dirname, "..", "..", "..", "data", "communes.json"), "utf8")) as Commune[];
const byCode = new Map(communes.map((c) => [c.code, c]));

const CORRECTED: Array<{ code: number; name: string; nameAr: string }> = [
  { code: 475, name: "Nadorah", nameAr: "الناظورة" },
  { code: 1153, name: "Sidi Amar", nameAr: "سيدي عمر" },
  { code: 420, name: "Souahlia", nameAr: "السواحلية" },
  { code: 427, name: "Beni Ouarsous", nameAr: "بني ورسوس" },
  { code: 86, name: "El Haouaita", nameAr: "الحويطة" },
  { code: 251, name: "Lioua", nameAr: "ليوة" },
];

describe("Arabic names of communes (annex of JO n.58)", () => {
  it("gives the six communes that held another place's name the name the annex lists", () => {
    for (const want of CORRECTED) {
      const row = byCode.get(want.code);
      expect(row, `commune ${want.code} exists`).toBeDefined();
      expect({ name: row!.name, nameAr: row!.nameAr }).toEqual({ name: want.name, nameAr: want.nameAr });
    }
  });

  it("never gives two communes of one wilaya the same Arabic name", () => {
    const seen = new Map<string, number[]>();
    for (const c of communes) {
      const key = `${c.wilayaCode}|${c.nameAr.normalize("NFKC").trim()}`;
      seen.set(key, [...(seen.get(key) ?? []), c.code]);
    }
    expect([...seen.entries()].filter(([, codes]) => codes.length > 1)).toEqual([]);
  });
});
