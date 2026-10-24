import "server-only";

import {
  persistedCustomerIdsForQuery,
  persistedOrderIdsForQuery,
} from "@/lib/search/local-search-projection";
import { compactSearchText, matchesSearchQuery } from "@/lib/search/universal-search";
import { wilayaStoredSpellings } from "@/lib/wilaya-display";

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
  for (let code = 1; code <= 58; code += 1) {
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

/**
 * Ids of the rows whose fields match the typed text after folding both sides.
 * Returns null when the table is over the cap: the caller keeps its SQL filter.
 */
export async function foldedRowIds<T extends { id: string }>(
  load: (take: number) => Promise<T[]>,
  q: string,
  fieldsOf: (row: T) => ReadonlyArray<string | null | undefined>,
): Promise<string[] | null> {
  const rows = await load(LIST_SEARCH_ROW_CAP + 1);
  if (rows.length > LIST_SEARCH_ROW_CAP) return null;
  return rows.filter((row) => matchesSearchQuery(q, fieldsOf(row))).map((row) => row.id);
}
