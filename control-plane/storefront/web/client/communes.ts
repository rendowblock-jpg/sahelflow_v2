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
/** A search result: the commune, whether the shop delivers to its wilaya, and the wilaya it belonged to before the 2025 reform (null when it did not move). */
export type CommuneHit = CommuneMatch & { delivers: boolean; former: FormerWilaya | null };
export type FormerWilaya = { code: string; latin: string; arabic: string };

/**
 * The data the checkout fetches next to the index (public/_sf/c.<hash>/reform.json, built by commune-reform.ts): the spellings
 * buyers type for a commune, and for each of the eleven wilayas created in 2025 (59..69) the wilaya its communes came from.
 * It is data, not code, so the page script stays small; without it the search still works, with no alias and no "formerly".
 */
export type Reform = {
  aliases: ReadonlyArray<readonly [latin: string, wilayaCode: string, aliases: string]>;
  moved: Readonly<Record<string, readonly [code: string, latin: string, arabic: string]>>;
};
export type AliasTarget = { latin: string; wilayaCode: string; exact: boolean };

/** The wilaya a commune of this wilaya code belonged to before the 2025 reform, or null (not a new wilaya, or no reform data). */
export function formerWilayaOf(reform: Reform | null | undefined, wilayaCode: string): FormerWilaya | null {
  const moved = reform?.moved;
  if (!moved || !Object.hasOwn(moved, wilayaCode)) return null;
  const [code, latin, arabic] = moved[wilayaCode] as readonly [string, string, string];
  return { code, latin, arabic };
}

// From four letters a typed start counts ("berik" finds Barika), never from three: "bou" must not pull Bougie in
// front of every real commune that starts with it.
const MIN_START = 4;

/** The commune rows an already-folded query stands for: the whole alias (exact) or, from four letters, the start of one. */
export function aliasTargets(aliases: Reform["aliases"], folded: string): AliasTarget[] {
  const out: AliasTarget[] = [];
  for (const [latin, wilayaCode, list] of aliases) {
    const keys = list.split(",");
    const exact = keys.includes(folded);
    if (exact || (folded.length >= MIN_START && keys.some((key) => key.startsWith(folded)))) out.push({ latin, wilayaCode, exact });
  }
  return out;
}

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

type Hit = { rank: number; at: number; row: CommuneIndexRow };

/** Every row that matches the text (whole index, no filter, no cap), with its rank. An alias raises its commune to "whole name" (exact) or "start of the name". */
function ranked(index: readonly CommuneIndexRow[], text: string, reform?: Reform | null): Hit[] {
  const arabic = ARABIC_LETTERS.test(text);
  const wanted = arabic ? foldArabic(text) : foldLatin(text);
  if (!wanted) return [];
  const boost = new Map<string, number>();
  if (!arabic && reform) for (const target of aliasTargets(reform.aliases, wanted)) boost.set(`${target.latin}|${target.wilayaCode}`, target.exact ? 0 : 1);
  const hits: Hit[] = [];
  prepare(index).forEach((entry, at) => {
    const found = rank(arabic ? entry.arabic : entry.latin, wanted);
    const alias = boost.size ? boost.get(`${entry.row[0]}|${entry.row[2]}`) : undefined;
    const best = alias === undefined ? found : found < 0 ? alias : Math.min(found, alias);
    if (best >= 0) hits.push({ rank: best, at, row: entry.row });
  });
  return hits;
}

function limitOf(limit: number): number {
  return Number.isFinite(limit) ? Math.floor(limit) : 8;
}

/**
 * The communes whose Latin name (or Arabic name, when the query has Arabic letters) matches the text, best first:
 * whole name, then start of the name, then start of a later word, then anywhere inside. Equal ranks keep the order
 * of the index. Only the wilayas in `allowedWilayaCodes` (the ones the seller prices) are searched. At most `limit` rows.
 */
export function searchCommunes(index: readonly CommuneIndexRow[], query: string, allowedWilayaCodes: Iterable<string>, limit = 8, reform?: Reform | null): CommuneMatch[] {
  const text = query.trim().slice(0, MAX_QUERY);
  const size = limitOf(limit);
  if (!text || size <= 0) return [];
  const allowed = new Set(allowedWilayaCodes);
  const hits = ranked(index, text, reform).filter((hit) => allowed.has(hit.row[2]));
  hits.sort((a, b) => a.rank - b.rank || a.at - b.at);
  return hits.slice(0, size).map(({ row }) => ({ latin: row[0], arabic: row[1], wilayaCode: row[2] }));
}

/**
 * Like searchCommunes, but a commune of a wilaya the shop does not deliver to is kept and marked `delivers: false` (the page
 * greys it and says why) instead of being dropped; at equal rank the rows the shop delivers to come first. Each row also says
 * which wilaya it belonged to before the 2025 reform, when it moved.
 */
export function findCommunes(index: readonly CommuneIndexRow[], query: string, deliversTo: Iterable<string>, limit = 8, reform?: Reform | null): CommuneHit[] {
  const text = query.trim().slice(0, MAX_QUERY);
  const size = limitOf(limit);
  if (!text || size <= 0) return [];
  const delivered = new Set(deliversTo);
  const hits = ranked(index, text, reform).map((hit) => ({ ...hit, delivers: delivered.has(hit.row[2]) }));
  hits.sort((a, b) => a.rank - b.rank || Number(b.delivers) - Number(a.delivers) || a.at - b.at);
  return hits.slice(0, size).map(({ row, delivers }) => ({ latin: row[0], arabic: row[1], wilayaCode: row[2], delivers, former: formerWilayaOf(reform, row[2]) }));
}
