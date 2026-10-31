import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import communeData from "../../../../data/communes.json";
import wilayaData from "../../../../data/wilayas.json";
import { MOTHER_OF_NEW_WILAYA } from "../../wilaya-fallback";
import manifest from "../asset-manifest.generated.json";
import { COMMUNE_ALIAS_ROWS } from "./commune-aliases";
import { buildReform } from "./commune-reform";
import { aliasTargets, findCommunes, foldLatin, formerWilayaOf, searchCommunes, type CommuneIndexRow, type Reform } from "./communes";

const pad = (code: number): string => String(code).padStart(2, "0");
const INDEX: CommuneIndexRow[] = (communeData as Array<{ name: string; nameAr: string; wilayaCode: number }>).map((row) => [row.name, row.nameAr, pad(row.wilayaCode)]);
const ALL = Array.from({ length: 69 }, (_, i) => pad(i + 1));
const WILAYAS = wilayaData as Array<{ code: number; name: string; nameAr: string }>;
const REFORM = buildReform(WILAYAS);
const BUILT = JSON.parse(readFileSync(join(process.cwd(), "control-plane/storefront/public", manifest.communes, "reform.json"), "utf8")) as Reform;

describe("reform data: built from the repo's own sources, shipped as reform.json", () => {
  it("has one entry per new wilaya 59..69: the mother code of wilaya-fallback.ts with that wilaya's real names", () => {
    expect(Object.keys(REFORM.moved).sort()).toEqual(Object.keys(MOTHER_OF_NEW_WILAYA).sort());
    expect(Object.keys(REFORM.moved)).toHaveLength(11);
    for (const [child, mother] of Object.entries(MOTHER_OF_NEW_WILAYA)) {
      const real = WILAYAS.find((w) => pad(w.code) === mother);
      expect(REFORM.moved[child]).toEqual([mother, real?.name, real?.nameAr]);
    }
    expect(REFORM.moved["60"]).toEqual(["05", "Batna", "باتنة"]);
    expect(REFORM.aliases).toBe(COMMUNE_ALIAS_ROWS);
    expect(() => buildReform([])).toThrow(/missing from data\/wilayas.json/);
  });

  it("is what the committed reform.json says (the build is current) and stays small", () => {
    expect(BUILT).toEqual(JSON.parse(JSON.stringify(REFORM)));
    const gzip = gzipSync(readFileSync(join(process.cwd(), "control-plane/storefront/public", manifest.communes, "reform.json"))).length;
    console.warn(`[weight] communes/reform.json ${gzip} gzip`);
    expect(gzip).toBeLessThan(2_000);
  });
});

describe("formerWilayaOf: the old wilaya of a commune the 2025 reform moved", () => {
  it("names the mother wilaya for 59..69 and is null for every other code, and without reform data", () => {
    expect(formerWilayaOf(REFORM, "60")).toEqual({ code: "05", latin: "Batna", arabic: "باتنة" });
    expect(formerWilayaOf(REFORM, "65")?.latin).toBe("Djelfa");
    expect(formerWilayaOf(REFORM, "66")?.latin).toBe("Djelfa");
    expect(formerWilayaOf(REFORM, "59")?.code).toBe("03");
    expect(formerWilayaOf(REFORM, "69")?.code).toBe("32");
    for (const code of ["05", "49", "58", "70", "", "6", "toString", "constructor", "__proto__"]) expect(formerWilayaOf(REFORM, code), code).toBeNull();
    expect(formerWilayaOf(null, "60")).toBeNull();
    expect(formerWilayaOf(undefined, "60")).toBeNull();
  });

  it("marks exactly the 108 communes of wilayas 59..69 in data/, none of an older wilaya (Charouine moved in 2019, not 2025)", () => {
    let hinted = 0;
    for (const [latin, , code] of INDEX) {
      const hit = findCommunes(INDEX, latin, ALL, 100, REFORM).find((h) => h.latin === latin && h.wilayaCode === code);
      expect(hit, `${latin} ${code}`).toBeDefined();
      if (hit?.former) hinted += 1;
      expect(hit?.former?.code ?? null).toBe(MOTHER_OF_NEW_WILAYA[code] ?? null);
    }
    expect(hinted).toBe(108);
    expect(findCommunes(INDEX, "Charouine", ALL, 8, REFORM)[0]).toMatchObject({ latin: "Charouine", wilayaCode: "49", delivers: true, former: null });
  });

  it("without reform data the search still works and shows no hint and no alias", () => {
    expect(findCommunes(INDEX, "Barika", ALL)[0]).toMatchObject({ latin: "Barika", wilayaCode: "60", former: null });
    expect(findCommunes(INDEX, "Berika", ALL).map((h) => h.latin)).not.toContain("Barika");
    expect(findCommunes(INDEX, "Berika", ALL, 8, { aliases: [], moved: {} })).toEqual([]);
  });
});

describe("findCommunes: a commune of a wilaya the shop does not deliver to is shown, not hidden", () => {
  it("keeps Barika under 60 and flags it when only Batna (05) is delivered", () => {
    const rows = findCommunes(INDEX, "Barika", ["05"], 8, REFORM);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ latin: "Barika", wilayaCode: "60", delivers: false, former: { code: "05", latin: "Batna" } });
    expect(searchCommunes(INDEX, "Barika", ["05"])).toEqual([]);
    expect(findCommunes(INDEX, "Barika", ["60"], 8, REFORM)[0]).toMatchObject({ latin: "Barika", delivers: true });
    expect(findCommunes(INDEX, "Barika", new Set<string>(), 8, REFORM)[0]).toMatchObject({ delivers: false });
  });

  it("at equal rank a deliverable row comes first, then the index order; a better rank still wins", () => {
    const tiny: CommuneIndexRow[] = [["Alpha", "", "01"], ["Alpha", "", "02"], ["Alphabet", "", "03"], ["Alpha", "", "04"]];
    expect(findCommunes(tiny, "alpha", ["04", "02"]).map((h) => `${h.wilayaCode}:${h.delivers}`)).toEqual(["02:true", "04:true", "01:false", "03:false"]);
    expect(findCommunes(tiny, "alpha", ["03"]).map((h) => h.wilayaCode)).toEqual(["01", "02", "04", "03"]);
  });

  it("caps at the limit (8 by default) and agrees with searchCommunes on the rows the shop delivers to", () => {
    expect(findCommunes(INDEX, "a", ALL, 5)).toHaveLength(5);
    expect(findCommunes(INDEX, "a", ALL)).toHaveLength(8);
    expect(findCommunes(INDEX, "a", ALL, 0)).toEqual([]);
    expect(findCommunes(INDEX, "   ", ALL)).toEqual([]);
    const delivered = findCommunes(INDEX, "ain", ["04", "05"], 5000).filter((h) => h.delivers);
    expect(delivered.length).toBeGreaterThan(0);
    expect(delivered.map((h) => h.latin)).toEqual(searchCommunes(INDEX, "ain", ["04", "05"], 5000).map((h) => h.latin));
  });

  it("namesakes stay separate rows: every commune name that exists in two wilayas gives one row per wilaya, never a guess", () => {
    const groups = new Map<string, CommuneIndexRow[]>();
    for (const row of INDEX) groups.set(foldLatin(row[0]), [...(groups.get(foldLatin(row[0])) ?? []), row]);
    const namesakes = [...groups.values()].filter((rows) => rows.length > 1);
    expect(namesakes.length).toBe(43);
    for (const rows of namesakes) {
      const top = findCommunes(INDEX, rows[0]?.[0] ?? "", ALL, rows.length, REFORM).map((h) => `${h.latin}@${h.wilayaCode}`);
      expect(top.sort()).toEqual(rows.map((r) => `${r[0]}@${r[2]}`).sort());
    }
  });
});

describe("aliases: the spellings a buyer really types", () => {
  const typed: Array<[string, string, string]> = [
    ["Berika", "Barika", "60"], ["Beriqa", "Barika", "60"], ["Bone", "Annaba", "23"], ["Alger", "Alger Centre", "16"],
    ["Algiers", "Alger Centre", "16"], ["Dzayer", "Alger Centre", "16"], ["Djazair", "Alger Centre", "16"], ["Wahran", "Oran", "31"],
    ["Qacentina", "Constantine", "25"], ["Tamanghasset", "Tamanrasset", "11"], ["Tamenrasset", "Tamanrasset", "11"],
    ["Tamanrasset", "Tamanrasset", "11"], ["Setif", "Setif", "19"], ["Sétif", "Setif", "19"], ["Bejaia", "Bejaia", "06"],
    ["Béjaïa", "Bejaia", "06"], ["Bgayet", "Bejaia", "06"], ["SBA", "Sidi Bel Abbes", "22"], ["Wargla", "Ouargla", "30"],
    ["Tbessa", "Tebessa", "12"], ["El Golea", "El Meniaa", "58"], ["Ain Salah", "In Salah", "53"], ["El Meghaier", "El M'ghair", "57"],
  ];
  it.each(typed)("%s finds %s (%s) first", (query, latin, code) => {
    expect(findCommunes(INDEX, query, ALL, 8, REFORM)[0]).toMatchObject({ latin, wilayaCode: code });
    expect(searchCommunes(INDEX, query, ALL, 8, REFORM)[0]).toMatchObject({ latin, wilayaCode: code });
  });

  it("the whole map is checked against data/: every target is one real commune of that wilaya, no alias is a real name, none is listed twice", () => {
    const real = new Set(INDEX.map(([latin]) => foldLatin(latin)));
    for (const w of WILAYAS) real.add(foldLatin(w.name));
    const seen = new Set<string>();
    let count = 0;
    for (const [latin, code, list] of COMMUNE_ALIAS_ROWS) {
      expect(INDEX.filter((row) => row[0] === latin && row[2] === code), `${latin} ${code} must be exactly one commune row`).toHaveLength(1);
      for (const alias of list.split(",")) {
        const key = foldLatin(alias);
        expect(alias, "stored folded").toBe(key);
        expect(key.length, alias).toBeGreaterThanOrEqual(3);
        expect(real.has(key), `${alias} is already a real name`).toBe(false);
        expect(seen.has(key), `${alias} is listed twice`).toBe(false);
        seen.add(key);
        count += 1;
        expect(aliasTargets(COMMUNE_ALIAS_ROWS, key).filter((t) => t.exact)).toEqual([{ latin, wilayaCode: code, exact: true }]);
        expect(findCommunes(INDEX, alias, ALL, 8, REFORM)[0], alias).toMatchObject({ latin, wilayaCode: code });
      }
    }
    expect(count).toBeGreaterThanOrEqual(28);
    expect(COMMUNE_ALIAS_ROWS.length).toBeGreaterThanOrEqual(20);
  });

  it("a typed start of an alias works from four letters on, never from three", () => {
    expect(aliasTargets(COMMUNE_ALIAS_ROWS, "beri")).toEqual([{ latin: "Barika", wilayaCode: "60", exact: false }]);
    expect(aliasTargets(COMMUNE_ALIAS_ROWS, "berik")).toEqual([{ latin: "Barika", wilayaCode: "60", exact: false }]);
    expect(aliasTargets(COMMUNE_ALIAS_ROWS, "ber")).toEqual([]);
    expect(aliasTargets(COMMUNE_ALIAS_ROWS, "zzzz")).toEqual([]);
    expect(aliasTargets(COMMUNE_ALIAS_ROWS, "")).toEqual([]);
    expect(aliasTargets(COMMUNE_ALIAS_ROWS, "berika")).toEqual([{ latin: "Barika", wilayaCode: "60", exact: true }]);
    expect(findCommunes(INDEX, "Berik", ALL, 8, REFORM)[0]).toMatchObject({ latin: "Barika", wilayaCode: "60" });
    expect(findCommunes(INDEX, "bou", ALL, 100, REFORM).some((h) => h.latin === "Bejaia")).toBe(false);
    expect(findCommunes(INDEX, "Beriqa", ALL, 8, REFORM).filter((h) => h.latin === "Barika")).toHaveLength(1);
  });

  it("an Arabic query never goes through the Latin aliases", () => {
    expect(findCommunes(INDEX, "بريكة", ALL, 8, REFORM)[0]).toMatchObject({ latin: "Barika" });
    expect(findCommunes(INDEX, "Bouira", ALL, 8, REFORM).slice(0, 2).map((h) => `${h.latin}@${h.wilayaCode}`)).toEqual(["Bouira@10", "Bouira Lahdab@65"]);
  });
});
