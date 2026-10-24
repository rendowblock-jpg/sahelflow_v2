import { matchesSearchQuery } from "@/lib/search/universal-search";

/**
 * Arabic/French/accent-insensitive contains match for picker comboboxes.
 *
 * Same predicate as every other in-memory list (`matchesSearchQuery`), so a
 * seller typing "احمد", "أحمد" or "0555"/"٠٥٥٥" matches the same local rows the
 * command palette would surface. Remote endpoints normalize server-side;
 * this predicate only filters the server-passed initial rows client-side.
 */
export const matchesComboboxQuery = matchesSearchQuery;
