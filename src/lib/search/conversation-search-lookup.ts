/**
 * How many of a query's required tokens the index is asked for (pure: no database, no key).
 *
 * Every required token (conversation-search-tokens.ts) is NECESSARY for a match, so any subset of them is still a
 * valid filter: a smaller subset can only add false candidates, never lose a true one, and every candidate is checked
 * with the shared predicate on its opened text. The numbers are salted per conversation, so a query pays one keyed
 * hash and one index probe per (conversation, token): fewer tokens is the cheapest speed-up there is.
 */

/** Tokens asked per group (messages, and each of the contact groups). Chosen by measurement, see the w57 report. */
export const DEFAULT_LOOKUP_MAX = 3;

/**
 * At most `max` of `strings`, in their order, spread over the list (first, middle, last, ...). A list that is not
 * longer than `max` comes back unchanged. A non-empty list never gives an empty answer: an empty lookup would find
 * nothing, so `max` counts as at least 1, and a `max` that is not a number asks for everything.
 */
export function pickLookupTokens(strings: readonly string[], max: number): string[] {
  const count = strings.length;
  const limit = Number.isNaN(max) ? count : Math.max(1, Math.floor(max));
  if (count <= limit) return [...strings];
  if (limit === 1) return [strings[0]!];
  const picked: string[] = [];
  for (let at = 0; at < limit; at += 1) picked.push(strings[Math.round((at * (count - 1)) / (limit - 1))]!);
  return picked;
}
