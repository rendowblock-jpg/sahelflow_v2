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
  return foldKey(value)
    .split(" ")
    .filter((token) => token && !STOP.has(token))
    .map(singular);
}

function editDistanceAtMostOne(left: string, right: string): boolean {
  if (Math.abs(left.length - right.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) { i += 1; j += 1; continue; }
    edits += 1;
    if (edits > 1) return false;
    if (left.length > right.length) i += 1;
    else if (right.length > left.length) j += 1;
    else { i += 1; j += 1; }
  }
  return edits + (left.length - i) + (right.length - j) <= 1;
}

function sameToken(left: string, right: string): boolean {
  return left === right || (left.length >= 5 && right.length >= 5 && editDistanceAtMostOne(left, right));
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

  const tokens = productTokens(name);
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
