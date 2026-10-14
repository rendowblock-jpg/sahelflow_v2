/**
 * Catalog matching (FD-064). An order can only be created from exact active
 * catalog names (`resolveCanonicalNamedItems`), so every extracted item is
 * mapped onto the seller's own catalog when the match is clear: exact after
 * folding, or a close token match that clearly beats every other product.
 * An unclear match is left as written for the seller to pick in review —
 * a wrong product is worse than an unmatched one.
 */
import { EDGE_STOPWORDS } from "./lexicon";
import { B_AFTER, B_BEFORE, escapeRegExp, fold, foldKey } from "./text";

export interface ExtractionCatalogEntry {
  /** Exact catalog identity: product name, or "Product Variant". */
  name: string;
}

export interface CatalogMatch {
  name: string;
  kind: "exact" | "close";
}

// Single letters stay: they are sizes ("Tshirt Oversize L"), not stop words.
const STOP = new Set(EDGE_STOPWORDS.map((word) => fold(word)).filter((word) => word.length > 1));

function singular(token: string): string {
  return token.length > 3 && /[sx]$/.test(token) ? token.slice(0, -1) : token;
}

export function productTokens(value: string): string[] {
  const raw = foldKey(value)
    .split(" ")
    .filter((token) => token && !STOP.has(token));
  const joined: string[] = [];
  for (let index = 0; index < raw.length; index += 1) {
    const token = raw[index]!;
    const next = raw[index + 1];
    // "20 000" and "20000" are the same capacity.
    if (/^\d{1,3}$/.test(token) && next && /^\d{3}$/.test(next)) {
      joined.push(token + next);
      index += 1;
      continue;
    }
    joined.push(singular(token));
  }
  return joined;
}

/** Color, size-label and attribute words. They describe a product; they are not a second one. */
const QUERY_NOISE = new Set(
  [
    "couleur", "color", "colour", "size", "pointure", "modele", "modèle", "model", "type", "version",
    "noir", "noire", "noirs", "black", "blanc", "blanche", "beige", "vert", "verte", "rouge",
    "bleu", "bleue", "rose", "gris", "grise", "marron", "camel", "dore", "doré", "gold",
    "brown", "green", "white", "اسود", "كحل", "ابيض", "بيضاء", "احمر", "ازرق", "اخضر", "بيج", "رمادي",
  ].map((word) => fold(word)),
);

function queryTokens(value: string): string[] {
  return productTokens(value).filter((token) => !QUERY_NOISE.has(token));
}

function covers(item: readonly string[], entry: readonly string[]): boolean {
  return item.length > 0 && item.every((token) => entry.some((candidate) => sameToken(candidate, token)));
}

function editDistanceAtMost(left: string, right: string, max: number): boolean {
  if (Math.abs(left.length - right.length) > max) return false;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      const value = Math.min(current[j - 1]! + 1, previous[j]! + 1, previous[j - 1]! + cost);
      current[j] = value;
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > max) return false;
    previous = current;
  }
  return previous[right.length]! <= max;
}

function sameToken(left: string, right: string): boolean {
  if (left === right) return true;
  if (left.length < 5 || right.length < 5) return false;
  // One slip on a normal word; two on a long product word ("imprimante").
  const max = left.length >= 8 && right.length >= 8 ? 2 : 1;
  return editDistanceAtMost(left, right, max);
}

function similarity(item: readonly string[], entry: readonly string[]): number {
  if (item.length === 0 || entry.length === 0) return 0;
  const shared = entry.filter((token) => item.some((candidate) => sameToken(candidate, token))).length;
  if (shared === 0) return 0;
  const precision = shared / entry.length;
  const recall = shared / item.length;
  return (2 * precision * recall) / (precision + recall);
}

/** True when two free-text names describe the same product ("tshirts" / "tshirt rouge"). */
export function sameProduct(left: string, right: string): boolean {
  const a = productTokens(left);
  const b = productTokens(right);
  if (a.length === 0 || b.length === 0) return false;
  const [small, large] = a.length <= b.length ? [a, b] : [b, a];
  return small.every((token) => large.some((candidate) => sameToken(candidate, token)));
}

export function matchCatalog(
  name: string,
  catalog: readonly ExtractionCatalogEntry[] | undefined,
): CatalogMatch | undefined {
  if (!catalog?.length) return undefined;
  const key = foldKey(name);
  const exact = catalog.filter((entry) => foldKey(entry.name) === key);
  if (exact.length === 1) return { name: exact[0]!.name, kind: "exact" };
  if (exact.length > 1) return undefined;

  const tokens = queryTokens(name);
  // "mini imprimante" → "Mini imprimante thermique Bluetooth", and
  // "abaya taille L" → the L variant only. Two products that both contain
  // every word ("tshirt oversize" vs M and L) stay unmatched.
  const contained = catalog.filter((entry) => covers(tokens, productTokens(entry.name)));
  const distinctive = tokens.some((token) => token.length >= 4 || /^\d{2,}$/.test(token));
  if (contained.length === 1 && distinctive) {
    return { name: contained[0]!.name, kind: "close" };
  }

  const scored = catalog
    .map((entry) => ({ entry, score: similarity(tokens, productTokens(entry.name)) }))
    .sort((left, right) => right.score - left.score);
  const [best, second] = scored;
  if (!best || best.score < 0.66) return undefined;
  if (second && best.score - second.score < 0.1) return undefined;
  return { name: best.entry.name, kind: "close" };
}

/** Where catalog names occur verbatim, so item splitting never cuts one. */
export function findCatalogSpans(
  folded: string,
  catalog: readonly ExtractionCatalogEntry[] | undefined,
): Array<{ start: number; end: number }> {
  if (!catalog?.length) return [];
  const spans: Array<{ start: number; end: number }> = [];
  for (const entry of catalog) {
    const key = foldKey(entry.name);
    if (key.length < 3) continue;
    const pattern = new RegExp(
      `${B_BEFORE}${escapeRegExp(key).replace(/ /g, "[^\\p{L}\\p{N}]+")}${B_AFTER}`,
      "gu",
    );
    for (const match of folded.matchAll(pattern)) {
      const start = match.index ?? 0;
      spans.push({ start, end: start + match[0].length });
    }
  }
  return spans;
}
