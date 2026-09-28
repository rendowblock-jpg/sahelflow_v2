import { normalizeSearchText } from "@/lib/search/universal-search";

export type HighlightRange = readonly [start: number, end: number];

/**
 * Character ranges of `text` that match the seller's query, for highlighting.
 *
 * Matching uses the same normalization as the ranking authority
 * (`normalizeSearchText`): accents, Arabic diacritics/tatweel, Arabic-Indic
 * digits and case are insensitive, so "decoratif" highlights "Décoratif" and
 * "٠٥٥٥" highlights "0555". Each source character is normalized on its own and
 * mapped back, so ranges always land on real source boundaries. Every query
 * token is matched independently; overlapping hits are merged.
 */
export function searchHighlightRanges(
  text: string,
  query: string,
): HighlightRange[] {
  const tokens = normalizeSearchText(query).split(" ").filter(Boolean);
  if (!text || tokens.length === 0) return [];

  // normalized[i] came from source character sourceIndex[i].
  let normalized = "";
  const sourceIndex: number[] = [];
  const sourceEnd: number[] = [];
  let offset = 0;
  for (const char of text) {
    const folded = normalizeSearchText(char) || (/\s/u.test(char) ? " " : "");
    for (const unit of folded) {
      normalized += unit;
      sourceIndex.push(offset);
      sourceEnd.push(offset + char.length);
    }
    offset += char.length;
  }

  const hits: Array<[number, number]> = [];
  for (const token of tokens) {
    let from = 0;
    while (from <= normalized.length - token.length) {
      const at = normalized.indexOf(token, from);
      if (at === -1) break;
      const start = sourceIndex[at];
      const end = sourceEnd[at + token.length - 1];
      if (start !== undefined && end !== undefined) hits.push([start, end]);
      from = at + token.length;
    }
  }
  if (hits.length === 0) return [];

  hits.sort((left, right) => left[0] - right[0] || left[1] - right[1]);
  const merged: Array<[number, number]> = [];
  for (const [start, end] of hits) {
    const previous = merged.at(-1);
    if (previous && start <= previous[1]) previous[1] = Math.max(previous[1], end);
    else merged.push([start, end]);
  }
  return merged;
}
