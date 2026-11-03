/**
 * Maps the way a commune was STORED onto the way the commune list SPELLS it.
 *
 * A customer card, an order or a setting keeps the commune as it was typed, imported or extracted ("M'Sila", "Koléa",
 * "ain defla"); the pickers list the names of data/communes.json ("M'sila", "Kolea", "Ain Defla"). A picker that
 * compares by exact string shows nothing for the first three. This helper finds the listed name for a stored one.
 *
 * Case, accents, every apostrophe, repeated spaces and hyphen-versus-space do not matter; the Arabic name matches too.
 * The rule is the one src/lib/ai/location-authority.ts uses (normalizeLocationKey) plus the modifier-letter apostrophes
 * (U+02BC and kin are letters to Unicode, so the old key would keep them). This file imports no data on purpose:
 * location-authority.ts pulls in the whole 197 KB commune list, which a client component must not (T-019).
 */

export interface CommuneNameRow {
  name: string;
  nameAr?: string;
  /** Only needed when the list mixes wilayas (the picker's list is one wilaya, so it carries none). */
  wilayaName?: string;
}

// Apostrophe look-alikes that are letters (Lm) or symbols (Sk) to Unicode, so "drop everything that is not a letter or digit" keeps them.
const APOSTROPHES = /[\u02B9\u02BB\u02BC\u02C8\u02CA\u0060\u00B4\u2018\u2019\u201B\u2032\uFF07]/g;

/** Comparison key: no case, no accents, no apostrophes, no spaces or hyphens. "M'Sila", "m’sila" and "M sila" share one key. */
export function communeKey(value: string): string {
  return value
    .replace(APOSTROPHES, "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

/**
 * The listed name for `raw`, or `raw` unchanged when nothing matches or the match is ambiguous.
 * - An exact name of the list is returned as it is.
 * - Otherwise the row whose Latin or Arabic name has the same key. Two different names with that key: ambiguous, raw stays.
 * - `wilayaName` narrows a mixed list to that wilaya's rows (rows without `wilayaName` are never dropped).
 */
export function resolveCommuneName(wilayaName: string, raw: string, communes: readonly CommuneNameRow[]): string {
  if (!raw) return raw;
  const wilayaKey = communeKey(wilayaName);
  const rows = wilayaKey
    ? communes.filter((row) => row.wilayaName === undefined || communeKey(row.wilayaName) === wilayaKey)
    : communes;
  if (rows.some((row) => row.name === raw)) return raw;
  const key = communeKey(raw);
  if (!key) return raw;
  const matches = new Set<string>();
  for (const row of rows) {
    if (communeKey(row.name) === key || (row.nameAr && communeKey(row.nameAr) === key)) matches.add(row.name);
  }
  if (matches.size !== 1) return raw;
  return matches.values().next().value as string;
}
