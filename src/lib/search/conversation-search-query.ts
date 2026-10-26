import {
  legacyConversationMatch,
  messageBodyMatches,
  type ConversationMatchType,
} from "@/lib/search/conversation-search-legacy";
import { DEFAULT_LOOKUP_MAX, pickLookupTokens } from "@/lib/search/conversation-search-lookup";
import {
  contactRequiredTokenStrings,
  hashTokenStringsForConversations,
  requiredTokenStringsOf,
  type BlindIndexDeriver,
} from "@/lib/search/conversation-search-tokens";
import { compactSearchText } from "@/lib/search/universal-search";

/**
 * The query path of the conversation-search index (PB-CONV-SEARCH-LOAD, slice 4).
 *
 * The index is only a FILTER. For each slice of the window (newest first) it names the messages that may contain the
 * query: documents whose hashed tokens are all there. A named message counts only if it is among the 50 newest of its
 * conversation (the old route never read further back); only those bodies are opened, one conversation at a time until
 * its first hit, and the search stops once 100 conversations match. A contact is judged with the old predicate on the
 * conversations the contact tokens name. So no result can appear that the old search would not show, and the index
 * may not hide one: it is a superset (see conversation-search-tokens.ts) and it is trusted only for conversations that
 * are fully indexed (a C doc and no queued change). Everything else, and every failure, takes the old path.
 *
 * This file opens no database: the SQL client, the key, the loader and the drain are parameters (the app wiring is in
 * conversation-search-runtime.ts). It reads three index tables and nothing else, and every value is a bound parameter
 * (conversation-search-raw-boundary-contract.test.ts pins both).
 */

export type QueryClient = {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
};

export type SearchMessage = { body: string | null; direction: string; timestamp: Date };
/** One opened message, with the keys the candidate check needs. */
export type OpenedMessage = SearchMessage & { id: string; conversationId: string };

/** What the route reads for one conversation: its columns and its 50 newest messages, newest first. */
export type SearchConversation = {
  id: string;
  channel: string;
  contactName: string;
  contactPhone: string | null;
  sourceId: string | null;
  lastMessageAt: Date | null;
  unreadCount: number;
  status: string;
  assigneeId: string | null;
  priority: string | null;
  labels: string | null;
  snoozedUntil: Date | null;
  waitingSince: Date | null;
  firstReplyAt: Date | null;
  messages: SearchMessage[];
};

/** A conversation's own columns with its contact opened and no messages. */
export type ConversationRow = Omit<SearchConversation, "messages">;

export type QueryPorts = {
  client: QueryClient;
  /** Blind-index derivation; null = the shop key row is missing. */
  derive: BlindIndexDeriver;
  /** Ids of the newest 500 conversations, newest first (the window of the old route). */
  listWindowIds: () => Promise<string[]>;
  /** The conversations with their 50 newest messages, opened, in any order. Only for what the index cannot vouch for. */
  loadConversations: (ids: readonly string[]) => Promise<SearchConversation[]>;
  /** The columns of these conversations, contact opened, no messages, in any order. */
  loadConversationRows: (ids: readonly string[]) => Promise<ConversationRow[]>;
  /** Exactly these messages, body opened, in any order. */
  openMessages: (ids: readonly string[]) => Promise<OpenedMessage[]>;
  /** Indexes a few queued changes before the search (the caller decides how many). */
  drain: () => Promise<void>;
  /** Required tokens asked of the index per group (default DEFAULT_LOOKUP_MAX): any subset is a valid filter, see conversation-search-lookup.ts. */
  lookupMax?: number;
  /** Told each time the index path fails and the search falls back (the runtime counts these for its circuit breaker). A throw in it is ignored. */
  onIndexFailure?: (error: unknown) => void;
  /** Told each time the index path answered. A throw in it is ignored. */
  onIndexSuccess?: () => void;
  /** Optional stage timer for profiling (the bench). Undefined in production: one branch per stage, nothing else. */
  trace?: (stage: string, ms: number) => void;
};

/** Calls a callback of the ports; a broken counter must never break a search. */
function tell(call: () => void): void {
  try {
    call();
  } catch {
    // ignored on purpose
  }
}

/** Runs one stage and reports its time to ports.trace when there is one. */
async function staged<T>(ports: QueryPorts, stage: string, run: () => Promise<T>): Promise<T> {
  const trace = ports.trace;
  if (!trace) return run();
  const started = performance.now();
  try {
    return await run();
  } finally {
    trace(stage, performance.now() - started);
  }
}

const RESULT_LIMIT = 100;
const IN_BATCH = 400;
/** Bound parameters one token lookup may carry (SQLite allows 32766 per statement). */
const HASHES_PER_QUERY = 4000;
/** The first slice of the window; each next slice is twice as long, so a rare word needs few rounds and a common one stops early. */
const FIRST_SLICE = 25;
/** The old route read the 50 newest messages of a conversation. */
const NEWEST_MESSAGES = 50;
/** Candidate bodies opened per still-undecided conversation in each round; after the last entry, all that are left. */
const BODY_ROUNDS = [1, 3, 12];

function marks(count: number): string {
  return new Array(count).fill("?").join(",");
}
function singles(count: number): string {
  return new Array(count).fill("(?)").join(",");
}

function parseLabels(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : [];
  } catch {
    return [];
  }
}

/** One response row, key for key what the route returned before the index existed. */
export function buildSearchRow(conversation: SearchConversation, matchType: ConversationMatchType, canReadContact: boolean) {
  const lastMessage = conversation.messages[0];
  return {
    id: conversation.id,
    conversationId: conversation.id,
    contactName: canReadContact ? conversation.contactName : null,
    contactPhone: canReadContact ? conversation.contactPhone : null,
    sourceId: canReadContact ? conversation.sourceId : null,
    channel: conversation.channel,
    lastMessageAt: conversation.lastMessageAt,
    unreadCount: conversation.unreadCount,
    lastMessage: lastMessage
      ? { body: lastMessage.body, direction: lastMessage.direction, timestamp: lastMessage.timestamp }
      : null,
    workflow: {
      status: conversation.status,
      assigneeId: conversation.assigneeId,
      priority: conversation.priority,
      labels: parseLabels(conversation.labels),
      snoozedUntil: conversation.snoozedUntil,
      waitingSince: conversation.waitingSince,
      firstReplyAt: conversation.firstReplyAt,
    },
    matchType,
    fieldAccess: { contact: canReadContact },
  };
}
export type SearchRow = ReturnType<typeof buildSearchRow>;

/** Window conversations that are fully indexed: a C doc and no queued change of any of their rows. */
async function fullyIndexed(client: QueryClient, windowIds: readonly string[]): Promise<Set<string>> {
  const covered = new Set<string>();
  for (let start = 0; start < windowIds.length; start += IN_BATCH) {
    const batch = windowIds.slice(start, start + IN_BATCH);
    const found = await client.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT d."entityId" AS id FROM "ConversationSearchDoc" d
       WHERE d."kind" = 'C' AND d."entityId" IN (${marks(batch.length)})
       AND NOT EXISTS (SELECT 1 FROM "ConversationSearchDirty" y WHERE y."conversationId" = d."entityId")`,
      ...batch,
    );
    for (const row of found) covered.add(row.id);
  }
  return covered;
}

type Candidate = { id: string; conversationId: string };

/**
 * Documents of `kind` that hold all of their conversation's wanted numbers, found hash first: the numbers are salted
 * per conversation, so a number computed for conversation C only occurs in documents of C (a 48-bit collision can
 * only add a false candidate, never remove a true one, and the owner check below drops foreign documents). The
 * (tokenHash, docId) index gives one short range per number; no join on the conversation is needed. A conversation
 * whose own numbers collide (fewer distinct numbers than tokens) cannot be counted: it is returned in `unsure`.
 */
async function candidateDocs(
  client: QueryClient,
  kind: "M" | "C",
  wanted: ReadonlyMap<string, readonly number[]>,
): Promise<{ docs: Candidate[]; unsure: Set<string> }> {
  const docs: Candidate[] = [];
  const unsure = new Set<string>();
  const entries = [...wanted].filter(([, hashes]) => hashes.length > 0);
  if (entries.length === 0) return { docs, unsure };
  const need = entries[0]![1].length;
  const perQuery = Math.max(1, Math.floor(HASHES_PER_QUERY / need));
  for (let start = 0; start < entries.length; start += perQuery) {
    const owners = new Set<string>();
    const batch: number[] = [];
    for (const [id, hashes] of entries.slice(start, start + perQuery)) {
      if (new Set(hashes).size === need) {
        owners.add(id);
        batch.push(...hashes);
      } else {
        unsure.add(id);
      }
    }
    if (batch.length === 0) continue;
    const answer = await client.$queryRawUnsafe<Candidate[]>(
      `SELECT d."entityId" AS "id", d."conversationId" AS "conversationId"
       FROM (SELECT t."docId" AS "docId" FROM "ConversationSearchToken" t
             WHERE t."tokenHash" IN (${marks(batch.length)}) GROUP BY t."docId" HAVING COUNT(*) >= ?) c
       JOIN "ConversationSearchDoc" d ON d."docId" = c."docId" AND d."kind" = ?`,
      ...batch,
      need,
      kind,
    );
    for (const row of answer) if (owners.has(row.conversationId)) docs.push(row);
  }
  return { docs, unsure };
}

type Rank = { id: string; conversationId: string; newer: number | bigint; atLeast: number | bigint };

/**
 * For candidate messages: how many messages of the same conversation are strictly newer (counted up to 50) and how
 * many are at least as new (up to 51). Only ids, the conversation and timestamps are read, never a body.
 */
async function ranksOf(client: QueryClient, messageIds: readonly string[]): Promise<Rank[]> {
  const ranks: Rank[] = [];
  for (let start = 0; start < messageIds.length; start += IN_BATCH) {
    const batch = messageIds.slice(start, start + IN_BATCH);
    ranks.push(
      ...(await client.$queryRawUnsafe<Rank[]>(
        `SELECT m."id" AS "id", m."conversationId" AS "conversationId",
           (SELECT COUNT(*) FROM (SELECT 1 FROM "Message" x WHERE x."conversationId" = m."conversationId" AND x."timestamp" > m."timestamp" LIMIT 50)) AS "newer",
           (SELECT COUNT(*) FROM (SELECT 1 FROM "Message" x WHERE x."conversationId" = m."conversationId" AND x."timestamp" >= m."timestamp" LIMIT 51)) AS "atLeast"
         FROM "Message" m WHERE m."id" IN (${marks(batch.length)})`,
        ...batch,
      )),
    );
  }
  return ranks;
}

/**
 * The candidate messages that lie among the 50 newest of their conversation, per conversation, newest first.
 * Equal timestamps: a message is surely inside when newer + equal (itself included) is at most 50, surely outside
 * when 50 are strictly newer. In between, the order of the tied messages decides and only the old query knows it:
 * that conversation goes to `unsure` and is judged in full.
 */
function newestCandidates(ranks: readonly Rank[], allowed: ReadonlySet<string>): { inside: Map<string, string[]>; unsure: Set<string> } {
  const byConversation = new Map<string, Rank[]>();
  for (const rank of ranks) {
    if (!allowed.has(rank.conversationId)) continue;
    const list = byConversation.get(rank.conversationId);
    if (list) list.push(rank);
    else byConversation.set(rank.conversationId, [rank]);
  }
  const inside = new Map<string, string[]>();
  const unsure = new Set<string>();
  for (const [conversationId, list] of byConversation) {
    list.sort((a, b) => Number(a.newer) - Number(b.newer));
    const ids: string[] = [];
    for (const rank of list) {
      if (Number(rank.newer) >= NEWEST_MESSAGES) continue;
      if (Number(rank.atLeast) <= NEWEST_MESSAGES) ids.push(rank.id);
      else unsure.add(conversationId);
    }
    if (!unsure.has(conversationId) && ids.length > 0) inside.set(conversationId, ids);
  }
  return { inside, unsure };
}

/** The newest message of each conversation (what the old route returned as lastMessage). */
async function newestMessageIds(client: QueryClient, conversationIds: readonly string[]): Promise<string[]> {
  const found: string[] = [];
  for (let start = 0; start < conversationIds.length; start += IN_BATCH) {
    const batch = conversationIds.slice(start, start + IN_BATCH);
    const rows = await client.$queryRawUnsafe<Array<{ id: string | null }>>(
      `WITH wanted ("conversationId") AS (VALUES ${singles(batch.length)})
       SELECT (SELECT x."id" FROM "Message" x WHERE x."conversationId" = w."conversationId" ORDER BY x."timestamp" DESC LIMIT 1) AS "id"
       FROM wanted w`,
      ...batch,
    );
    for (const row of rows) if (row.id) found.push(row.id);
  }
  return found;
}

/**
 * Opens candidate bodies in rounds (one per undecided conversation, then three, then twelve, then the rest) and
 * returns, per conversation, the bodies that pass the message rule. A conversation is decided at its first hit.
 */
async function openCandidateBodies(ports: QueryPorts, candidates: ReadonlyMap<string, string[]>, query: string): Promise<Map<string, string[]>> {
  const hits = new Map<string, string[]>();
  const waiting = new Map<string, string[]>([...candidates].map(([id, ids]) => [id, [...ids]] as [string, string[]]));
  for (let round = 0; waiting.size > 0; round += 1) {
    const take = BODY_ROUNDS[round] ?? Number.POSITIVE_INFINITY;
    const owner = new Map<string, string>();
    for (const [conversationId, ids] of waiting) {
      for (const id of ids.splice(0, take)) owner.set(id, conversationId);
      if (ids.length === 0) waiting.delete(conversationId);
    }
    for (const message of await ports.openMessages([...owner.keys()])) {
      const conversationId = owner.get(message.id);
      if (conversationId === undefined || !messageBodyMatches(query, message.body)) continue;
      const list = hits.get(conversationId);
      if (list) list.push(message.body ?? "");
      else hits.set(conversationId, [message.body ?? ""]);
    }
    for (const conversationId of hits.keys()) waiting.delete(conversationId);
  }
  return hits;
}

type Plan = {
  query: string;
  canReadContact: boolean;
  /** The contact has no token to ask for (query under 3 characters): judge the contacts of every covered conversation. */
  allContacts: boolean;
  messageTokens: string[];
  contactTokens: ReturnType<typeof contactRequiredTokenStrings>;
};
type Verdict = { id: string; matchType: ConversationMatchType; full: SearchConversation | null };

/** The index cannot answer right now for a reason that is not a fault of the index (no shop key yet, a conversation deleted mid-search): the old way answers and the circuit breaker is not told. */
class IndexUnavailable extends Error {}

/** The conversations of one slice of the window that match, in window order, each with its match type. */
async function judgeSlice(
  ports: QueryPorts,
  slice: readonly string[],
  plan: Plan,
  rows: Map<string, ConversationRow>,
): Promise<Verdict[]> {
  const { query, canReadContact, messageTokens, contactTokens } = plan;
  const covered = await staged(ports, "fullyIndexed", () => fullyIndexed(ports.client, slice));
  const full = new Set(slice.filter((id) => !covered.has(id)));
  const coveredIds = slice.filter((id) => covered.has(id));
  const contactType = new Map<string, ConversationMatchType>();
  const messageHits = new Map<string, string[]>();

  if (coveredIds.length > 0) {
    const groups: Array<{ kind: "M" | "C"; strings: string[] }> = [{ kind: "M", strings: messageTokens }];
    if (contactTokens) {
      for (const strings of [contactTokens.name, contactTokens.phone, contactTokens.compact]) {
        // An empty compact group means the query has no letter or digit: the compact rule cannot match.
        if (strings.length > 0) groups.push({ kind: "C", strings });
      }
    }
    const everything = [...new Set(groups.flatMap((group) => group.strings))];
    const hashed = await staged(ports, "hashing", () => hashTokenStringsForConversations(everything, coveredIds, ports.derive));
    if (hashed === null) throw new IndexUnavailable("shop key row missing");
    const position = new Map(everything.map((entry, at) => [entry, at] as const));
    const contactIds = new Set<string>();
    let messageDocs: Candidate[] = [];
    for (const group of groups) {
      const wanted = new Map<string, number[]>();
      for (const [id, hashes] of hashed) wanted.set(id, group.strings.map((entry) => hashes[position.get(entry)!]!));
      const found = await staged(ports, "sql" + group.kind, () => candidateDocs(ports.client, group.kind, wanted));
      for (const id of found.unsure) full.add(id);
      if (group.kind === "M") messageDocs = found.docs;
      else for (const doc of found.docs) contactIds.add(doc.conversationId);
    }

    // Messages: only candidates among the 50 newest of a conversation that is not judged in full are opened.
    const messageIds = messageDocs.filter((doc) => !full.has(doc.conversationId)).map((doc) => doc.id);
    if (messageIds.length > 0) {
      const ranks = await staged(ports, "ranks", () => ranksOf(ports.client, messageIds));
      const { inside, unsure } = newestCandidates(ranks, new Set(coveredIds.filter((id) => !full.has(id))));
      for (const id of unsure) full.add(id);
      for (const id of unsure) inside.delete(id);
      if (inside.size > 0) {
        for (const [id, bodies] of await staged(ports, "openBodies", () => openCandidateBodies(ports, inside, query))) messageHits.set(id, bodies);
      }
    }

    // Contacts: the old predicate, on the conversations the contact tokens name.
    const toJudge = (plan.allContacts ? coveredIds : [...contactIds]).filter((id) => !full.has(id));
    if (canReadContact && toJudge.length > 0) {
      for (const row of await staged(ports, "contacts", () => ports.loadConversationRows(toJudge))) {
        rows.set(row.id, row);
        const type = legacyConversationMatch({ query, canReadContact, contactName: row.contactName, contactPhone: row.contactPhone, messageBodies: [] });
        if (type !== null) contactType.set(row.id, type);
      }
    }
  }

  const verdicts = new Map<string, Verdict>();
  if (full.size > 0) {
    for (const conversation of await staged(ports, "loadConversations", () => ports.loadConversations([...full]))) {
      const matchType = legacyConversationMatch({
        query,
        canReadContact,
        contactName: conversation.contactName,
        contactPhone: conversation.contactPhone,
        messageBodies: conversation.messages.map((message) => message.body),
      });
      if (matchType !== null) verdicts.set(conversation.id, { id: conversation.id, matchType, full: conversation });
    }
  }
  for (const id of coveredIds) {
    if (full.has(id)) continue;
    const matchType = contactType.get(id) ?? (messageHits.has(id) ? "message" : null);
    if (matchType !== null) verdicts.set(id, { id, matchType, full: null });
  }
  return slice.flatMap((id) => (verdicts.has(id) ? [verdicts.get(id)!] : []));
}

/** The old route over `ids`: load every conversation with its 50 newest messages and judge it. */
async function judgeInFull(ports: QueryPorts, ids: readonly string[], query: string, canReadContact: boolean): Promise<SearchRow[]> {
  const loaded = new Map(
    (await staged(ports, "loadConversations", () => ports.loadConversations(ids))).map((conversation) => [conversation.id, conversation] as const),
  );
  const judgeStarted = ports.trace ? performance.now() : 0;
  const rows: SearchRow[] = [];
  for (const id of ids) {
    const conversation = loaded.get(id);
    if (!conversation) continue;
    const matchType = legacyConversationMatch({
      query,
      canReadContact,
      contactName: conversation.contactName,
      contactPhone: conversation.contactPhone,
      messageBodies: conversation.messages.map((message) => message.body),
    });
    if (matchType === null) continue;
    rows.push(buildSearchRow(conversation, matchType, canReadContact));
    if (rows.length >= RESULT_LIMIT) break;
  }
  ports.trace?.("legacy", performance.now() - judgeStarted);
  return rows;
}

/** null = the index cannot narrow this query: the caller judges the whole window the old way. */
async function indexedAnswer(ports: QueryPorts, windowIds: readonly string[], query: string, canReadContact: boolean): Promise<SearchRow[] | null> {
  // Only some of the required tokens are looked up, in the message group and in each contact group: the others are
  // implied by the check of the opened text (a smaller subset adds false candidates, never loses a true one).
  const max = ports.lookupMax ?? DEFAULT_LOOKUP_MAX;
  const messageTokens = pickLookupTokens(requiredTokenStringsOf(query), max);
  const allContactTokens = canReadContact ? contactRequiredTokenStrings(query, compactSearchText(query)) : null;
  const contactTokens = allContactTokens && {
    name: pickLookupTokens(allContactTokens.name, max),
    phone: pickLookupTokens(allContactTokens.phone, max),
    compact: pickLookupTokens(allContactTokens.compact, max),
  };
  if (messageTokens.length === 0) return null;
  const plan: Plan = { query, canReadContact, allContacts: canReadContact && contactTokens === null, messageTokens, contactTokens };

  const rows = new Map<string, ConversationRow>();
  const verdicts: Verdict[] = [];
  let at = 0;
  for (let size = FIRST_SLICE; at < windowIds.length && verdicts.length < RESULT_LIMIT; size *= 2) {
    const slice = windowIds.slice(at, at + size);
    at += slice.length;
    verdicts.push(...(await judgeSlice(ports, slice, plan, rows)));
  }
  const top = verdicts.slice(0, RESULT_LIMIT);

  // Only the answer is loaded in full, and of its messages only the newest one (the last message of the list row).
  const missing = top.filter((verdict) => verdict.full === null && !rows.has(verdict.id)).map((verdict) => verdict.id);
  if (missing.length > 0) for (const row of await staged(ports, "results", () => ports.loadConversationRows(missing))) rows.set(row.id, row);
  const needNewest = top.filter((verdict) => verdict.full === null).map((verdict) => verdict.id);
  const newest = new Map<string, OpenedMessage>();
  if (needNewest.length > 0) {
    const ids = await staged(ports, "newestIds", () => newestMessageIds(ports.client, needNewest));
    for (const message of await staged(ports, "newest", () => ports.openMessages(ids))) newest.set(message.conversationId, message);
  }
  const answer: SearchRow[] = [];
  for (const verdict of top) {
    let conversation = verdict.full;
    if (conversation === null) {
      const row = rows.get(verdict.id);
      if (!row) throw new IndexUnavailable("a result conversation vanished");
      const last = newest.get(verdict.id);
      conversation = { ...row, messages: last ? [{ body: last.body, direction: last.direction, timestamp: last.timestamp }] : [] };
    }
    answer.push(buildSearchRow(conversation, verdict.matchType, canReadContact));
  }
  return answer;
}

/**
 * The same answer as the old route: the first 100 matching conversations of the window, newest first, each with the
 * type of its match. `query` is already folded with normalizeSearchText. The index and the drain may fail or be
 * missing; the search then reads the window the old way and still answers.
 */
export async function searchConversationIndex(
  ports: QueryPorts,
  input: { query: string; canReadContact: boolean },
): Promise<SearchRow[]> {
  const { query, canReadContact } = input;
  if (!query) return [];
  const windowIds = await staged(ports, "listWindowIds", () => ports.listWindowIds());
  if (windowIds.length === 0) return [];

  try {
    await staged(ports, "drain", () => ports.drain());
  } catch {
    // The queue stays; conversations with a queued change are read in full below.
  }
  try {
    const answer = await indexedAnswer(ports, windowIds, query, canReadContact);
    if (answer !== null) {
      tell(() => ports.onIndexSuccess?.());
      return answer;
    }
  } catch (error) {
    // Any failure of the index or of a port: the old way, over the whole window. Only a real fault is reported to the
    // breaker: a shop whose key row does not exist yet must not switch the index off until the next restart.
    if (!(error instanceof IndexUnavailable)) tell(() => ports.onIndexFailure?.(error));
  }
  return judgeInFull(ports, windowIds, query, canReadContact);
}

/**
 * The old route and nothing else: the newest 500 conversations with their 50 newest messages, judged one by one.
 * It drains nothing and asks the index nothing: this is what runs when the index is switched off or its breaker is open.
 */
export async function searchConversationWindow(
  ports: QueryPorts,
  input: { query: string; canReadContact: boolean },
): Promise<SearchRow[]> {
  const { query, canReadContact } = input;
  if (!query) return [];
  const windowIds = await staged(ports, "listWindowIds", () => ports.listWindowIds());
  if (windowIds.length === 0) return [];
  return judgeInFull(ports, windowIds, query, canReadContact);
}
