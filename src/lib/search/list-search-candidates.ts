import "server-only";

import {
  persistedCustomerIdsForQuery,
  persistedOrderIdsForQuery,
} from "@/lib/search/local-search-projection";
import {
  compactSearchText,
  matchesSearchQuery,
  normalizeSearchText,
} from "@/lib/search/universal-search";
import { WILAYA_CODES, wilayaStoredSpellings } from "@/lib/wilaya-display";

/**
 * Candidate ids for the customer, order, product and canned-response lists, so
 * a typed search tolerates Arabic spelling variants, Arabic digits and +213
 * phones. Name and phone are protected fields: they are never copied to a
 * plaintext column, only matched through the persisted keyed tokens.
 */

/**
 * Products and canned responses are folded in memory over at most this many
 * rows. A shop with more rows keeps the plain SQL `contains` (no fold) instead
 * of loading an unbounded table on every keystroke.
 */
export const LIST_SEARCH_ROW_CAP = 5000;

export interface CustomerNameRow {
  id: string;
  name: string;
  phone: string | null;
  phone2: string | null;
}

export interface FoldClient {
  customer: {
    findMany(args: {
      where: { id: { in: string[] }; deletedAt: null };
      select: { id: true; name: true; phone: true; phone2: true };
    }): Promise<CustomerNameRow[]>;
  };
}

export interface OrderFoldCandidates {
  orderIds: string[];
  customerIds: string[];
  wilayaSpellings: string[];
}

/** The typed text, plus its national-phone form (+213 / 00213 / Arabic digits -> 0...) when that differs. */
export function phoneQueryForms(q: string): string[] {
  const national = compactSearchText(q);
  return national && national !== q ? [q, national] : [q];
}

/**
 * Customers whose name (and phone, unless nameOnly) really contains the typed text; token hits are only
 * candidates. Orders use nameOnly: an order is found by its own phone hash, not by the customer's.
 */
export async function customerIdsMatching(
  client: FoldClient,
  q: string,
  nameOnly = false,
): Promise<string[]> {
  const ids = await persistedCustomerIdsForQuery(q);
  if (ids.length === 0) return [];
  const rows = await client.customer.findMany({
    where: { id: { in: ids }, deletedAt: null },
    select: { id: true, name: true, phone: true, phone2: true },
  });
  return rows
    .filter((row) =>
      matchesSearchQuery(q, nameOnly ? [row.name] : [row.name, row.phone, row.phone2]),
    )
    .map((row) => row.id);
}

/** Every stored spelling (French, Arabic, code) of the wilayas that match the typed text. The list is small and fixed. */
export function foldedWilayaSpellings(q: string): string[] {
  const spellings = new Set<string>();
  for (const code of WILAYA_CODES) {
    for (const spelling of wilayaStoredSpellings(code) ?? []) {
      if (matchesSearchQuery(q, [spelling])) spellings.add(spelling);
    }
  }
  return [...spellings];
}

export async function orderListFoldCandidates(
  client: FoldClient,
  q: string,
  contact: boolean,
): Promise<OrderFoldCandidates> {
  const [orderIds, customerIds] = await Promise.all([
    persistedOrderIdsForQuery(q),
    contact ? customerIdsMatching(client, q, true) : Promise.resolve<string[]>([]),
  ]);
  return { orderIds, customerIds, wilayaSpellings: contact ? foldedWilayaSpellings(q) : [] };
}

/** Cheap fingerprint of a table: changes when a row is added, removed or edited (updatedAt moves). */
export interface RowSignature {
  count: number;
  newest: number;
}

export function rowSignature(count: number, newest: Date | null | undefined): RowSignature {
  return { count, newest: newest?.getTime() ?? 0 };
}

export interface FoldedRowCache {
  /** One name per row shape (the fields that are folded). */
  key: string;
  signature: () => Promise<RowSignature>;
}

interface FoldedField {
  label: string;
  compact: string;
}

interface CachedRows {
  signature: RowSignature;
  rows: Array<{ id: string; fields: FoldedField[] }>;
}

/**
 * A change in the last second before the rows were read is never cached: two
 * edits in the same millisecond would leave the fingerprint unchanged.
 */
const CACHE_QUIET_MS = 1000;
const rowCache = new Map<string, CachedRows>();

export function clearFoldedRowCache(): void {
  rowCache.clear();
}

function foldFields(fields: ReadonlyArray<string | null | undefined>): FoldedField[] {
  const folded: FoldedField[] = [];
  for (const field of fields) {
    if (!field) continue;
    const label = normalizeSearchText(field);
    if (label) folded.push({ label, compact: compactSearchText(field) });
  }
  return folded;
}

/** Same rule as matchesSearchQuery, on fields that were folded once. */
function matchesFolded(query: string, fields: readonly FoldedField[]): boolean {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;
  const compactQuery = compactSearchText(query);
  const tokens = normalizedQuery.split(" ").filter(Boolean);
  for (const { label, compact } of fields) {
    if (label.includes(normalizedQuery)) return true;
    if (compactQuery && compact.includes(compactQuery)) return true;
    if (tokens.length > 1 && tokens.every((token) => label.includes(token))) return true;
  }
  return false;
}

export function matchesFoldedFields(
  query: string,
  fields: ReadonlyArray<string | null | undefined>,
): boolean {
  return matchesFolded(query, foldFields(fields));
}

async function readSignature(cache: FoldedRowCache): Promise<RowSignature | null> {
  try {
    return await cache.signature();
  } catch {
    return null; // no fingerprint: read the rows every time, as before
  }
}

/**
 * Ids of the rows whose fields match the typed text after folding both sides.
 * Returns null when the table is over the cap: the caller keeps its SQL filter.
 * With `cache`, the folded rows are kept per process while the table's
 * fingerprint is unchanged, so typing does not reload and re-fold them.
 */
export async function foldedRowIds<T extends { id: string }>(
  load: (take: number) => Promise<T[]>,
  q: string,
  fieldsOf: (row: T) => ReadonlyArray<string | null | undefined>,
  cache?: FoldedRowCache,
): Promise<string[] | null> {
  // The fingerprint is read before the rows: a change in between only costs one extra reload.
  const signature = cache ? await readSignature(cache) : null;
  if (cache && signature) {
    if (signature.count > LIST_SEARCH_ROW_CAP) return null;
    const hit = rowCache.get(cache.key);
    if (hit && hit.signature.count === signature.count && hit.signature.newest === signature.newest) {
      return hit.rows.filter((row) => matchesFolded(q, row.fields)).map((row) => row.id);
    }
  }
  const readAt = Date.now();
  const rows = await load(LIST_SEARCH_ROW_CAP + 1);
  if (rows.length > LIST_SEARCH_ROW_CAP) return null;
  if (cache && signature && signature.newest <= readAt - CACHE_QUIET_MS) {
    const folded = rows.map((row) => ({ id: row.id, fields: foldFields(fieldsOf(row)) }));
    rowCache.set(cache.key, { signature, rows: folded });
    return folded.filter((row) => matchesFolded(q, row.fields)).map((row) => row.id);
  }
  if (cache) rowCache.delete(cache.key);
  return rows.filter((row) => matchesSearchQuery(q, fieldsOf(row))).map((row) => row.id);
}
