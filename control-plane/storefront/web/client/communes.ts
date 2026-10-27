/**
 * Commune search for the checkout: pure functions, no DOM, no fetch, no import. The page fetches the index
 * (public/_sf/c.<hash>/all.json, written by scripts/storefront-public-build.ts) and calls searchCommunes with it.
 *
 * A row is [latin, arabic, wilayaCode]. The code is the two-digit string the wilaya select, the fee table and the
 * per-wilaya file names already use ("05"), so a result can be put into the form without any conversion.
 * Communes with the same name in two wilayas are two rows. Nothing here chooses between them.
 */
export type CommuneIndexRow = readonly [latin: string, arabic: string, wilayaCode: string];
export type CommuneMatch = { latin: string; arabic: string; wilayaCode: string };

// Same key as src/lib/ai/location-authority.ts (normalizeLocationKey): the Worker bundle cannot import that
// file (it pulls in the whole commune list), so the rule is repeated here and a test keeps the two in step.
const MARKS = /\p{M}/gu;
const NOT_ALNUM = /[^\p{L}\p{N}]+/gu;
const WORD_BREAK = /[^\p{L}\p{N}\p{M}\u200e\u200f]+/u;

/** Case, accents, hyphens, apostrophes and spaces do not matter: "Aïn-Defla" and "ain defla" give the same key. */
export function foldLatin(value: string): string {
  return value.normalize("NFKD").replace(MARKS, "").toLowerCase().replace(NOT_ALNUM, "");
}

// What a phone keyboard types for the letters the list writes in another form. NFKD already turns the hamza
// forms of alef, waw and ya into the bare letter plus a mark, and the marks are removed; these are the rest.
const ARABIC_LETTER: Record<string, string> = {
  "\u0671": "\u0627", // alef wasla
  "\u0649": "\u064a", // alef maqsura -> ya
  "\u06cc": "\u064a", // Persian ya
  "\u0629": "\u0647", // ta marbuta -> ha
  "\u06be": "\u0647", // heh doachashmi -> ha
  "\u0624": "\u0648", // waw with hamza
  "\u0626": "\u064a", // ya with hamza
  "\u06a8": "\u0642", // Algerian qaf with three dots, as in Guelma -> qaf
  "\u06a4": "\u0641", // veh -> fa
  "\u067e": "\u0628", // peh -> ba
  "\u06a9": "\u0643", // Persian kaf
};
const ARABIC_FORM = new RegExp(`[${Object.keys(ARABIC_LETTER).join("")}]`, "g");

/** Vowel marks, tatweel, the alef forms, ya/alef-maqsura, ta-marbuta/ha and spaces or hyphens do not matter. */
export function foldArabic(value: string): string {
  return value
    .normalize("NFKD")
    .replace(MARKS, "")
    .replace(/\u0640/g, "")
    .toLowerCase()
    .replace(ARABIC_FORM, (letter) => ARABIC_LETTER[letter] ?? letter)
    .replace(/[\u0622\u0623\u0625]/g, "\u0627")
    .replace(NOT_ALNUM, "");
}

type Folded = { key: string; starts: number[] };

/** The folded text and where each word of it begins, so "defla" can be found as the second word of "Ain Defla". */
function fold(value: string, one: (text: string) => string): Folded {
  let key = "";
  const starts: number[] = [];
  for (const word of value.split(WORD_BREAK)) {
    const folded = one(word);
    if (!folded) continue;
    starts.push(key.length);
    key += folded;
  }
  return { key, starts };
}

type Prepared = { row: CommuneIndexRow; latin: Folded; arabic: Folded };
const prepared = new WeakMap<readonly CommuneIndexRow[], Prepared[]>();

function prepare(index: readonly CommuneIndexRow[]): Prepared[] {
  let list = prepared.get(index);
  if (!list) {
    list = index.map((row) => ({ row, latin: fold(row[0], foldLatin), arabic: fold(row[1], foldArabic) }));
    prepared.set(index, list);
  }
  return list;
}

// 0 = the whole name, 1 = the start of the name, 2 = the start of a later word, 3 = somewhere inside, -1 = no match.
function rank(target: Folded, query: string): number {
  const { key, starts } = target;
  if (!key) return -1;
  if (key === query) return 0;
  if (key.startsWith(query)) return 1;
  if (starts.some((start) => start > 0 && key.startsWith(query, start))) return 2;
  return key.includes(query) ? 3 : -1;
}

const ARABIC_LETTERS = /[\u0600-\u06ff\u0750-\u077f\ufb50-\ufdff\ufe70-\ufeff]/;
const MAX_QUERY = 60;

/**
 * The communes whose Latin name (or Arabic name, when the query has Arabic letters) matches the text, best first:
 * whole name, then start of the name, then start of a later word, then anywhere inside. Equal ranks keep the order
 * of the index. Only the wilayas in `allowedWilayaCodes` (the ones the seller prices) are searched. At most `limit` rows.
 */
export function searchCommunes(index: readonly CommuneIndexRow[], query: string, allowedWilayaCodes: Iterable<string>, limit = 8): CommuneMatch[] {
  const text = query.trim().slice(0, MAX_QUERY);
  const size = Number.isFinite(limit) ? Math.floor(limit) : 8;
  if (!text || size <= 0) return [];
  const arabic = ARABIC_LETTERS.test(text);
  const wanted = arabic ? foldArabic(text) : foldLatin(text);
  if (!wanted) return [];
  const allowed = new Set(allowedWilayaCodes);
  const hits: Array<{ rank: number; at: number; row: CommuneIndexRow }> = [];
  prepare(index).forEach((entry, at) => {
    if (!allowed.has(entry.row[2])) return;
    const found = rank(arabic ? entry.arabic : entry.latin, wanted);
    if (found >= 0) hits.push({ rank: found, at, row: entry.row });
  });
  hits.sort((a, b) => a.rank - b.rank || a.at - b.at);
  return hits.slice(0, size).map(({ row }) => ({ latin: row[0], arabic: row[1], wilayaCode: row[2] }));
}
