import {
  compactSearchText,
  normalizeSearchText,
} from "@/lib/search/universal-search";

/**
 * Arabic/French/accent-insensitive contains match for picker comboboxes.
 *
 * Reuses the universal-search normalization authority (NFKD + mark removal,
 * Arabic-Indic digit folding, tatweel stripping, case folding) so a seller
 * typing "احمد", "أحمد" or "0555"/"٠٥٥٥" matches the same local rows the
 * command palette would surface. Remote endpoints normalize server-side;
 * this predicate only filters the server-passed initial rows client-side.
 */
export function matchesComboboxQuery(
  query: string,
  fields: Array<string | null | undefined>,
): boolean {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;

  const compactQuery = compactSearchText(query);
  const tokens = normalizedQuery.split(" ").filter(Boolean);

  for (const field of fields) {
    if (!field) continue;
    const label = normalizeSearchText(field);
    if (!label) continue;
    if (label.startsWith(normalizedQuery) || label.includes(normalizedQuery)) {
      return true;
    }
    // Phones and SKUs match across separators: "0555 12" -> "055512".
    const compactLabel = compactSearchText(field);
    if (compactQuery && compactLabel.includes(compactQuery)) return true;
    // Multi-word queries match when every token is present in one field.
    if (tokens.length > 1 && tokens.every((token) => label.includes(token))) {
      return true;
    }
  }
  return false;
}
