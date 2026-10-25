import type { ProtectedRecordReference } from "@/lib/crypto/protected-record";

/**
 * Tokens of the persisted conversation-search index (pure: no database, no key).
 *
 * The inbox search asks "does the folded message body contain the folded query
 * as a substring?". The index only has to return a SUPERSET of the messages
 * for which that is true; every candidate is then decrypted and tested with the
 * old `includes`, so a false candidate costs one decrypt and never shows.
 *
 * Text here is ALWAYS already folded with normalizeSearchText (the project's
 * one folding: NFKD, marks, Arabic digits/letters, tatweel, bidi marks, lower
 * case, single spaces). Nothing in this file folds a second time.
 *
 * Stored tokens, per word of the folded body with at least 2 characters:
 *   msg-p:<first 2 characters>          (a word start)
 *   msg-t:<every 3-character piece>     (anywhere in the word)
 * A word of L >= 3 characters gives 1 + (L - 2) tokens; a word of 2 gives 1.
 * Lengths are UTF-16 code units, the unit `String.includes` works in, so the
 * pieces of a query cut anywhere (even inside an emoji) are pieces of the body.
 * Punctuation stays inside the word, as in the folded text.
 *
 * Required tokens of a query q that is a substring of the body (derivation):
 * the folded body has single spaces, and q has none at its ends. Split q at its
 * spaces into pieces p1 .. pk.
 *  - k = 1: q lies inside ONE body word, at any offset. Every 3-character piece
 *    of q is a 3-character piece of that word. q is not known to be at the
 *    word start, so q gives no msg-p. Exception, decided by the lead: a
 *    2-character q has no 3-character piece, and is required to be a word
 *    start (msg-p:q). That is the one behaviour change: `ra` no longer finds
 *    "livraison"; `vra`, `rai`, `ais` and anything longer still do.
 *  - k >= 2: the spaces of q are spaces of the body, so
 *      p1 is the END of a body word: its 3-character pieces are pieces of that
 *        word; no msg-p (it may start mid-word); under 3 characters = nothing;
 *      p2 .. p(k-1) are WHOLE body words: msg-p of the first 2 characters (when
 *        2 or more) and every 3-character piece;
 *      pk is the START of a body word: msg-p of its first 2 characters (when 2
 *        or more) and every 3-character piece.
 *    A body word of 1 character has no tokens, so a 1-character piece asks for
 *    nothing.
 * All required tokens must be present (AND). An empty answer means "this query
 * cannot be narrowed by the index": the caller must use the old full path.
 * An empty piece (a query that begins or ends with a space) asks for nothing.
 */

const PREFIX_TOKEN = "msg-p:";
const PIECE_TOKEN = "msg-t:";
const PREFIX_LENGTH = 2;
const PIECE_LENGTH = 3;

/** Keyed-hash family of these tokens (same key as customers/orders, own context). */
export const CONVERSATION_TOKEN_REFERENCE = {
  recordType: "SearchProjection",
  field: "conversation-token",
} as const;

function addPieces(target: Set<string>, text: string): void {
  for (let start = 0; start + PIECE_LENGTH <= text.length; start += 1) {
    target.add(`${PIECE_TOKEN}${text.slice(start, start + PIECE_LENGTH)}`);
  }
}

/** The distinct token strings (before hashing) to store for one folded text. */
export function tokenStringsOf(foldedText: string): string[] {
  const tokens = new Set<string>();
  for (const word of foldedText.split(/\s+/u)) {
    if (word.length < PREFIX_LENGTH) continue;
    tokens.add(`${PREFIX_TOKEN}${word.slice(0, PREFIX_LENGTH)}`);
    addPieces(tokens, word);
  }
  return [...tokens];
}

/**
 * The token strings that EVERY message containing `foldedQuery` must have
 * stored (see the derivation above). [] = no narrowing possible: old path.
 */
export function requiredTokenStringsOf(foldedQuery: string): string[] {
  const pieces = foldedQuery.split(" ");
  const last = pieces.length - 1;
  const required = new Set<string>();
  pieces.forEach((piece, index) => {
    // Pieces after a space begin a body word; the first piece may begin mid-word.
    const startsBodyWord = index > 0;
    const lonePiece = last === 0;
    if (
      piece.length >= PREFIX_LENGTH &&
      (startsBodyWord || (lonePiece && piece.length < PIECE_LENGTH))
    ) {
      required.add(`${PREFIX_TOKEN}${piece.slice(0, PREFIX_LENGTH)}`);
    }
    addPieces(required, piece);
  });
  return [...required];
}

/**
 * What the blind-index derivation looks like to this file: the caller wires
 * deriveExistingShopBlindIndexes (read/search) or deriveShopBlindIndexes
 * (write) with `normalize: (value) => value`, as local-search-projection.ts
 * does, so the unit tests need no database. `null` = key row missing.
 */
export type BlindIndexDeriver = (
  values: string[],
  reference: Pick<ProtectedRecordReference, "recordType" | "field">,
) => Promise<string[] | null>;

function assertConversationId(conversationId: string): void {
  if (conversationId.length === 0 || conversationId.includes("\u0000")) {
    throw new TypeError("conversationId must be non-empty and free of NUL");
  }
}

/** Salt: the conversation id, then NUL (never in an id), then the token string. */
function saltedInput(conversationId: string, tokenString: string): string {
  return `${conversationId}\u0000${tokenString}`;
}

/** First 6 bytes (12 hex characters) of the digest: 48 bits, a safe integer. */
function digestToNumber(digest: string): number {
  if (!/^[0-9a-f]{12,}$/u.test(digest)) {
    throw new Error("Blind index digest is not a hex string");
  }
  return Number.parseInt(digest.slice(0, 12), 16);
}

function numbersOf(digests: string[], expected: number): number[] {
  if (digests.length !== expected) {
    throw new Error("Blind index count does not match the token count");
  }
  return digests.map(digestToNumber);
}

/**
 * The stored numbers of some token strings in ONE conversation. The hashed
 * string includes the conversation id, so the same word has another number in
 * every conversation. `null` = the shop key is missing: the caller must use the
 * old path, which is not the same as "no tokens".
 */
export async function hashTokenStrings(
  strings: readonly string[],
  conversationId: string,
  derive: BlindIndexDeriver,
): Promise<number[] | null> {
  assertConversationId(conversationId);
  if (strings.length === 0) return [];
  const digests = await derive(
    strings.map((entry) => saltedInput(conversationId, entry)),
    CONVERSATION_TOKEN_REFERENCE,
  );
  return digests === null ? null : numbersOf(digests, strings.length);
}

/**
 * Same numbers for several conversations in ONE derivation call (a query must
 * hash its required tokens once per window conversation; one call reads the key
 * once). Map order = first appearance of each id. `null` = key missing.
 */
export async function hashTokenStringsForConversations(
  strings: readonly string[],
  conversationIds: readonly string[],
  derive: BlindIndexDeriver,
): Promise<Map<string, number[]> | null> {
  const ids = [...new Set(conversationIds)];
  ids.forEach(assertConversationId);
  const result = new Map<string, number[]>();
  if (strings.length === 0 || ids.length === 0) {
    for (const id of ids) result.set(id, []);
    return result;
  }
  const digests = await derive(
    ids.flatMap((id) => strings.map((entry) => saltedInput(id, entry))),
    CONVERSATION_TOKEN_REFERENCE,
  );
  if (digests === null) return null;
  const numbers = numbersOf(digests, ids.length * strings.length);
  ids.forEach((id, index) => {
    result.set(id, numbers.slice(index * strings.length, (index + 1) * strings.length));
  });
  return result;
}
