import "server-only";

/**
 * Wilaya canonicalization (7-b P2).
 *
 * The wilaya-risk seed (data/wilayas.json) and the WilayaRiskProfile table use
 * the official French name as the canonical key. Orders arrive with the same
 * geography written in Arabic script, with diacritics/tatweel, alef/yeh/
 * teh-marbuta spelling variants, definite-article variants, punctuation and
 * arbitrary spacing. Exact string lookup silently no-oped the geography risk
 * factor for all of those. This module is the single authority that folds any
 * reasonable spelling onto the canonical seed name before profile lookup.
 */

interface WilayaSeedRow {
  code: number;
  name: string;
  nameAr?: string;
  zone: string;
}

const ARABIC_COMBINING_MARKS = /[\u064B-\u0652\u0670\u0640]/g;
const ARABIC_ALEF_VARIANTS = /[أإآٱ]/g;
const NON_LETTER_OR_DIGIT = /[^\p{L}\p{N}\s]/gu;

/**
 * Fold a wilaya string for comparison: Unicode NFKC (folds Arabic
 * presentation forms), strip Arabic combining marks + tatweel, unify alef /
 * yeh / teh-marbuta spellings, drop punctuation, collapse whitespace and
 * lowercase Latin text. Arabic script has no case, so this is lossless there.
 */
export function normalizeWilayaText(input: string): string {
  return input
    .normalize("NFKC")
    .replace(ARABIC_COMBINING_MARKS, "")
    .replace(ARABIC_ALEF_VARIANTS, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(NON_LETTER_OR_DIGIT, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function stripArabicDefiniteArticle(normalizedArabic: string): string {
  // "الشلف" → "شلف": sellers and customers drop the definite article freely.
  // Arabic "ال" survives normalization untouched (alef + lam).
  return normalizedArabic.startsWith("ال ") || normalizedArabic.startsWith("ال")
    ? normalizedArabic.slice(2).trim()
    : normalizedArabic;
}

let lookupCache: Map<string, string> | null = null;

async function wilayaAliasLookup(): Promise<Map<string, string>> {
  if (lookupCache) return lookupCache;
  const wilayas = (await import("../../../data/wilayas.json"))
    .default as WilayaSeedRow[];
  const lookup = new Map<string, string>();
  for (const row of wilayas) {
    const canonical = row.name;
    const aliases = new Set<string>();
    aliases.add(normalizeWilayaText(row.name));
    if (row.nameAr) {
      const normalizedArabic = normalizeWilayaText(row.nameAr);
      aliases.add(normalizedArabic);
      const articleStripped = stripArabicDefiniteArticle(normalizedArabic);
      if (articleStripped) aliases.add(articleStripped);
    }
    // Numeric wilaya codes ("16", " algiers code 16 " inputs).
    aliases.add(String(row.code));
    aliases.add(String(row.code).padStart(2, "0"));
    for (const alias of aliases) {
      if (alias && !lookup.has(alias)) {
        lookup.set(alias, canonical);
      }
    }
  }
  lookupCache = lookup;
  return lookup;
}

/**
 * Resolve a raw wilaya string onto the canonical seed profile name.
 * Returns null when the input does not match any seeded wilaya under any
 * normalization — callers keep their exact behavior for unknown values.
 */
export async function canonicalWilayaName(
  input: string,
): Promise<string | null> {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const lookup = await wilayaAliasLookup();
  return lookup.get(normalizeWilayaText(trimmed)) ?? null;
}

/**
 * Profile lookup key for a raw wilaya string: the canonical seed name when the
 * value canonicalizes, otherwise the raw input (preserving the exact previous
 * lookup semantics for genuinely unknown geographies).
 */
export async function resolveWilayaProfileKey(input: string): Promise<string> {
  return (await canonicalWilayaName(input)) ?? input;
}
