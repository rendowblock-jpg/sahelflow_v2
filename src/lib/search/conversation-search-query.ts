import {
  legacyConversationMatch,
  type ConversationMatchType,
} from "@/lib/search/conversation-search-legacy";
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
 * The index is only a FILTER. It names the conversations that may match; every one of them is then loaded (with its
 * 50 newest messages, as the route always did) and judged by legacyConversationMatch, the same predicate the old path
 * uses. So no result can appear that the old search would not show. What the index may not do is hide a match, which
 * it avoids by being a superset (see conversation-search-tokens.ts) and by trusting only conversations that are fully
 * indexed: a C doc and no queued change. Everything else, and every failure, takes the old path.
 *
 * This file opens no database: the SQL client, the key, the loader and the drain are parameters (the app wiring is in
 * conversation-search-runtime.ts). It reads three index tables and nothing else, and every value is a bound parameter
 * (conversation-search-raw-boundary-contract.test.ts pins both).
 */

export type QueryClient = {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
};

export type SearchMessage = { body: string | null; direction: string; timestamp: Date };

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

export type QueryPorts = {
  client: QueryClient;
  /** Blind-index derivation; null = the shop key row is missing. */
  derive: BlindIndexDeriver;
  /** Ids of the newest 500 conversations, newest first (the window of the old route). */
  listWindowIds: () => Promise<string[]>;
  /** The conversations with their 50 newest messages, opened, in any order. */
  loadConversations: (ids: readonly string[]) => Promise<SearchConversation[]>;
  /** Indexes a few queued changes before the search (the caller decides how many). */
  drain: () => Promise<void>;
  /** Optional stage timer for profiling (the bench). Undefined in production: one branch per stage, nothing else. */
  trace?: (stage: string, ms: number) => void;
};

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

function marks(count: number): string {
  return new Array(count).fill("?").join(",");
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

/** Conversations that own ONE document of `kind` holding all of that conversation's wanted numbers (or cannot be counted). */
async function conversationsWithAll(
  client: QueryClient,
  kind: "M" | "C",
  wanted: ReadonlyMap<string, readonly number[]>,
): Promise<Set<string>> {
  const { docs, unsure } = await candidateDocs(client, kind, wanted);
  return new Set([...unsure, ...docs.map((doc) => doc.conversationId)]);
}

/**
 * The ids to load and judge. null = judge the whole window the old way (the key row is missing).
 * Conversations that are not fully indexed always go through; so does everything when the query cannot be narrowed
 * (messages: no required token; contacts, when the right to read them is given: no required token).
 */
async function idsToLoad(
  ports: QueryPorts,
  windowIds: readonly string[],
  query: string,
  canReadContact: boolean,
): Promise<Set<string> | null> {
  const messageTokens = requiredTokenStringsOf(query);
  const contactTokens = canReadContact ? contactRequiredTokenStrings(query, compactSearchText(query)) : null;
  if (messageTokens.length === 0 || (canReadContact && contactTokens === null)) return new Set(windowIds);

  const covered = await staged(ports, "fullyIndexed", () => fullyIndexed(ports.client, windowIds));
  const load = new Set(windowIds.filter((id) => !covered.has(id)));
  const coveredIds = windowIds.filter((id) => covered.has(id));
  if (coveredIds.length === 0) return load;

  // Message docs: all tokens in ONE message. Contact docs: all tokens of the name, or of the phone, or of the compact form.
  const groups: Array<{ kind: "M" | "C"; strings: string[] }> = [{ kind: "M", strings: messageTokens }];
  if (contactTokens) {
    for (const strings of [contactTokens.name, contactTokens.phone, contactTokens.compact]) {
      // An empty compact group means the query has no letter or digit: the compact rule cannot match.
      if (strings.length > 0) groups.push({ kind: "C", strings });
    }
  }
  const everything = [...new Set(groups.flatMap((group) => group.strings))];
  const hashed = await staged(ports, "hashing", () => hashTokenStringsForConversations(everything, coveredIds, ports.derive));
  if (hashed === null) return null;
  const position = new Map(everything.map((entry, at) => [entry, at] as const));
  for (const group of groups) {
    const wanted = new Map<string, number[]>();
    for (const [id, hashes] of hashed) wanted.set(id, group.strings.map((entry) => hashes[position.get(entry)!]!));
    for (const id of await staged(ports, "sql" + group.kind, () => conversationsWithAll(ports.client, group.kind, wanted))) load.add(id);
  }
  return load;
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
  let load: Set<string> | null;
  try {
    load = await idsToLoad(ports, windowIds, query, canReadContact);
  } catch {
    load = null;
  }
  const ids = load === null ? windowIds : windowIds.filter((id) => load.has(id));
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
