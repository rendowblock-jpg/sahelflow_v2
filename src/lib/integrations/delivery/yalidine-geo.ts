/**
 * Yalidine geo-name resolution helpers — pure module.
 *
 * Yalidine matches parcel addresses against ITS OWN commune/wilaya spellings,
 * so request names are resolved against the carrier's list (GET /communes/)
 * and the carrier's exact string is sent. Matching ported from the live-proven
 * CodFlow geo sync (cod-shared/queries/carrier-geo.ts @ 00f18fa, Apache-2.0):
 * exact trim → normalized equality → near-variant (edit distance ≤ 1, guarded
 * by a shared 3-char prefix). The wilaya scope comes from the caller, which
 * fetches the carrier list per wilaya.
 */

export interface YalidineCommune {
  _id: number;
  name: string;
}

/**
 * Normalize a name for fuzzy matching: strip accents, case, spaces, hyphens,
 * apostrophes, and periods — the known accent/punctuation deltas between our
 * reference names and carrier spellings.
 */
export function normalizeGeoName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\s\-'\u2019.]/g, "");
}

/**
 * Levenshtein edit distance ≤ 1 check (bounded, allocation-light) — catches
 * true spelling variants ("Aghabal"↔"Aghbal", "Abou El Hassen"↔"Abou El
 * Hassan") that normalization cannot. Combined with the same-wilaya scope
 * and a shared 3-char prefix, false positives are effectively ruled out.
 */
export function isNearVariant(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a.slice(0, 3) !== b.slice(0, 3)) return false;
  if (a === b) return true;
  let i = 0;
  let j = 0;
  let diffs = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++diffs > 1) return false;
    if (a.length === b.length) {
      i++;
      j++;
    } else if (a.length > b.length) {
      i++;
    } else {
      j++;
    }
  }
  return diffs <= 1 && Math.abs(a.length - b.length) <= 1;
}

/**
 * Resolve one request commune name against Yalidine's own commune list.
 *
 * Phase 1 — exact trim match. Phase 2 — normalized equality. Phase 3 —
 * near-variant (distance ≤ 1 + shared 3-char prefix). Returns the
 * Yalidine-side entry (send its `name` verbatim — the carrier's exact
 * spelling is the whole point) or null when nothing matches.
 */
export function matchCommuneName(
  communes: YalidineCommune[],
  raw: string,
): YalidineCommune | null {
  const trimmed = raw.trim();
  for (const commune of communes) {
    if (commune.name.trim() === trimmed) return commune;
  }

  const rawNorm = normalizeGeoName(trimmed);
  for (const commune of communes) {
    if (normalizeGeoName(commune.name) === rawNorm) return commune;
  }

  for (const commune of communes) {
    if (isNearVariant(rawNorm, normalizeGeoName(commune.name))) return commune;
  }

  return null;
}
