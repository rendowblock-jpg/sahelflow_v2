import { matchesSearchQuery, normalizeSearchText } from "@/lib/search/universal-search";

/**
 * The one predicate of the conversation search as it always worked: a conversation matches when its contact name
 * or phone matches (only if the user may read contacts) or one of its message bodies contains the folded query.
 *
 * The old path runs it on every conversation of the window; the indexed path runs it on every candidate the index
 * returns. The index is only a filter, so both paths show exactly what this function accepts.
 */

export type ConversationMatchType = "name" | "phone" | "message";

export type LegacyMatchInput = {
  /** Already folded with normalizeSearchText; an empty query matches nothing. */
  query: string;
  canReadContact: boolean;
  contactName: string | null | undefined;
  contactPhone: string | null | undefined;
  /** The bodies to look in (the route gives the 50 newest messages), already opened. */
  messageBodies: ReadonlyArray<string | null | undefined>;
};

/** Does one message body hold the folded query? The one message rule of the old path and of the index path. */
export function messageBodyMatches(query: string, body: string | null | undefined): boolean {
  return normalizeSearchText(body ?? "").includes(query);
}

/** name, else phone, else message; null when none of them matches. */
export function legacyConversationMatch(input: LegacyMatchInput): ConversationMatchType | null {
  const { query, canReadContact } = input;
  if (!query) return null;
  if (canReadContact && matchesSearchQuery(query, [input.contactName])) return "name";
  if (canReadContact && matchesSearchQuery(query, [input.contactPhone])) return "phone";
  return input.messageBodies.some((body) => messageBodyMatches(query, body)) ? "message" : null;
}
