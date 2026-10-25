import { logger } from "@/lib/logger";
import { isBusyError } from "@/lib/search/conversation-search-idle";
import {
  hashTokenSetsOfConversations,
  hashTokenStrings,
  tokenStringsOf,
  type BlindIndexDeriver,
} from "@/lib/search/conversation-search-tokens";
import { normalizeSearchText } from "@/lib/search/universal-search";

/**
 * The indexer of the conversation-search index (PB-CONV-SEARCH-LOAD, slice 3).
 *
 * Two jobs, both in small steps so the single SQLite writer is never held long:
 *  - drain: the triggers queue every new or edited message in ConversationSearchDirty (they cannot read the sealed
 *    body); this reads, opens and hashes them OUTSIDE any write lock, then writes the rows in one short transaction.
 *  - backfill: messages that existed before the migration, newest conversation first, 100 messages per chunk.
 *
 * Rules that keep the index honest (the query side relies on them):
 *  - "C doc present => every message of the conversation has an M doc or a Dirty row". The C doc is written only in
 *    the write transaction of the LAST chunk, after re-checking that.
 *  - The write transaction first re-reads the sealed body and the conversation of every message and writes only when
 *    both are still what was opened. Otherwise the message's Dirty row stays and the next round indexes the new text.
 *  - A missing shop key means "do nothing" ({ skipped: "no-key" }), never "index nothing".
 *  - Nothing here logs or returns a word, an id or a phone number: counts only.
 *
 * The SQL client is a parameter: this file opens no database by itself (the app wiring is in
 * conversation-search-runtime.ts) and a test can give it the plain test client.
 */

export { isBusyError };

export type SqlClient = {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
};
export type IndexerClient = SqlClient & {
  $transaction<T>(
    run: (tx: SqlClient) => Promise<T>,
    options?: { maxWait?: number; timeout?: number },
  ): Promise<T>;
};

export type SealedMessage = { id: string; conversationId: string; body: string };

export type IndexerPorts = {
  client: IndexerClient;
  /** Blind-index derivation; it returns null when the shop key row is missing. */
  derive: BlindIndexDeriver;
  /** Opens the sealed body of a message. Throws when it cannot. */
  openBody: (message: SealedMessage) => Promise<string>;
  /** Test seam: runs after the read and the hashing, right before the write transaction. */
  beforeWrite?: () => Promise<void>;
};

export type NoKey = { skipped: "no-key" };
export type DrainResult = {
  indexed: number;
  removed: number;
  /** Messages whose sealed body or conversation changed after they were opened: left queued. */
  stale: number;
  failed: number;
  cleared: number;
  remaining: number;
};
export type BackfillResult = { indexed: number; covered: number; remaining: number };
export type StepResult = { changed: boolean };

const BACKFILL_CHUNK_MESSAGES = 100;
const BACKFILL_CANDIDATES = 5;
const DRAIN_BATCH_ROWS = 50;
const BUSY_ATTEMPTS = 3;
const BUSY_PAUSE_MS = 25;
const LOG_EVERY_CHUNKS = 50;
const IN_BATCH = 400;
const DOC_ROWS_PER_INSERT = 150;
const TOKEN_ROWS_PER_INSERT = 400;
const WRITE_TRANSACTION = { maxWait: 10_000, timeout: 30_000 } as const;

const progress = { chunks: 0, indexed: 0 };

async function withBusyRetry<T>(run: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      if (attempt >= BUSY_ATTEMPTS || !isBusyError(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, BUSY_PAUSE_MS * attempt));
    }
  }
}

function marks(count: number): string {
  return new Array(count).fill("?").join(",");
}
function* batches<T>(items: readonly T[], size: number): Generator<T[]> {
  for (let start = 0; start < items.length; start += size) yield items.slice(start, start + size);
}

/**
 * SQLite has one writer. Prisma's interactive transaction begins deferred, so the first statement takes the write
 * lock (a no-op update of the single state row); everything read after it cannot change under this transaction.
 */
async function lockForWrite(tx: SqlClient): Promise<void> {
  await tx.$executeRawUnsafe(
    `UPDATE "ConversationSearchState" SET "scheme" = "scheme" WHERE "id" = 'conversation-index'`,
  );
}

async function keyPresent(derive: BlindIndexDeriver): Promise<boolean> {
  return (await hashTokenStrings(["msg-p:probe"], "probe", derive)) !== null;
}

async function readSealed(client: SqlClient, ids: readonly string[]): Promise<Map<string, SealedMessage>> {
  const found = new Map<string, SealedMessage>();
  for (const batch of batches(ids, IN_BATCH)) {
    const list = await client.$queryRawUnsafe<SealedMessage[]>(
      `SELECT "id", "conversationId", "body" FROM "Message" WHERE "id" IN (${marks(batch.length)})`,
      ...batch,
    );
    for (const message of list) found.set(message.id, message);
  }
  return found;
}

type Prepared = { message: SealedMessage; hashes: number[] };

/** Opens and hashes messages. Outside any write lock. null = the key row is missing. */
async function prepare(
  ports: IndexerPorts,
  messages: readonly SealedMessage[],
): Promise<{ ready: Prepared[]; failed: SealedMessage[] } | null> {
  const opened: Array<{ message: SealedMessage; strings: string[] }> = [];
  const failed: SealedMessage[] = [];
  for (const message of messages) {
    try {
      opened.push({ message, strings: tokenStringsOf(normalizeSearchText(await ports.openBody(message))) });
    } catch {
      failed.push(message);
    }
  }
  const hashed = await hashTokenSetsOfConversations(
    opened.map((entry) => ({ conversationId: entry.message.conversationId, strings: entry.strings })),
    ports.derive,
  );
  if (hashed === null) return null;
  return { ready: opened.map((entry, index) => ({ message: entry.message, hashes: hashed[index]! })), failed };
}

const sameStamp = (now: SealedMessage | undefined, read: SealedMessage): boolean =>
  now !== undefined && now.body === read.body && now.conversationId === read.conversationId;

async function removeMessageDocs(tx: SqlClient, ids: readonly string[]): Promise<void> {
  for (const batch of batches(ids, IN_BATCH)) {
    await tx.$executeRawUnsafe(
      `DELETE FROM "ConversationSearchToken" WHERE "docId" IN
         (SELECT "docId" FROM "ConversationSearchDoc" WHERE "kind" = 'M' AND "entityId" IN (${marks(batch.length)}))`,
      ...batch,
    );
    await tx.$executeRawUnsafe(
      `DELETE FROM "ConversationSearchDoc" WHERE "kind" = 'M' AND "entityId" IN (${marks(batch.length)})`,
      ...batch,
    );
  }
}

async function deleteDirty(tx: SqlClient, kind: "M" | "C", ids: readonly string[]): Promise<void> {
  for (const batch of batches(ids, IN_BATCH)) {
    await tx.$executeRawUnsafe(
      `DELETE FROM "ConversationSearchDirty" WHERE "kind" = ? AND "entityId" IN (${marks(batch.length)})`,
      kind,
      ...batch,
    );
  }
}

/** Inserts message docs and their tokens. A doc that already exists is left alone, tokens included. */
async function insertMessageDocs(tx: SqlClient, entries: readonly Prepared[]): Promise<number> {
  const ids = entries.map((entry) => entry.message.id);
  const existing = new Set<string>();
  for (const batch of batches(ids, IN_BATCH)) {
    const list = await tx.$queryRawUnsafe<Array<{ entityId: string }>>(
      `SELECT "entityId" FROM "ConversationSearchDoc" WHERE "kind" = 'M' AND "entityId" IN (${marks(batch.length)})`,
      ...batch,
    );
    for (const row of list) existing.add(row.entityId);
  }
  const fresh = entries.filter((entry) => !existing.has(entry.message.id));
  for (const batch of batches(fresh, DOC_ROWS_PER_INSERT)) {
    await tx.$executeRawUnsafe(
      `INSERT INTO "ConversationSearchDoc" ("kind", "entityId", "conversationId") VALUES ${batch
        .map(() => "('M', ?, ?)")
        .join(",")} ON CONFLICT ("kind", "entityId") DO NOTHING`,
      ...batch.flatMap((entry) => [entry.message.id, entry.message.conversationId]),
    );
  }
  const docIds = new Map<string, number>();
  for (const batch of batches(
    fresh.map((entry) => entry.message.id),
    IN_BATCH,
  )) {
    const list = await tx.$queryRawUnsafe<Array<{ docId: number | bigint; entityId: string }>>(
      `SELECT "docId", "entityId" FROM "ConversationSearchDoc" WHERE "kind" = 'M' AND "entityId" IN (${marks(batch.length)})`,
      ...batch,
    );
    for (const row of list) docIds.set(row.entityId, Number(row.docId));
  }
  const tokenRows: number[] = [];
  for (const entry of fresh) {
    const docId = docIds.get(entry.message.id);
    if (docId === undefined) continue;
    for (const hash of new Set(entry.hashes)) tokenRows.push(docId, hash);
  }
  for (const batch of batches(tokenRows, TOKEN_ROWS_PER_INSERT * 2)) {
    await tx.$executeRawUnsafe(
      `INSERT INTO "ConversationSearchToken" ("docId", "tokenHash") VALUES ${new Array(batch.length / 2)
        .fill("(?, ?)")
        .join(",")} ON CONFLICT DO NOTHING`,
      ...batch,
    );
  }
  return fresh.length;
}

async function countOf(client: SqlClient, sql: string): Promise<number> {
  const [row] = await client.$queryRawUnsafe<Array<{ n: number | bigint }>>(sql);
  return Number(row?.n ?? 0);
}

const UNCOVERED_CONVERSATIONS = `FROM "Conversation" c WHERE NOT EXISTS
  (SELECT 1 FROM "ConversationSearchDoc" d WHERE d."kind" = 'C' AND d."entityId" = c."id")`;

/**
 * Drains up to `limit` queue rows: message rows are re-indexed (or their docs removed when the message is gone),
 * conversation rows are cleared (the backfill re-covers a conversation that has no C doc).
 */
export async function drainConversationSearchDirty(
  ports: IndexerPorts,
  limit: number = DRAIN_BATCH_ROWS,
): Promise<DrainResult | NoKey> {
  if (!(await keyPresent(ports.derive))) return { skipped: "no-key" };
  const queue = await ports.client.$queryRawUnsafe<Array<{ kind: string; entityId: string }>>(
    `SELECT "kind", "entityId" FROM "ConversationSearchDirty" ORDER BY rowid LIMIT ${Math.max(1, Math.trunc(limit))}`,
  );
  // An idle tick on a finished index must cost reads only: no write lock, no transaction.
  if (queue.length === 0) return { indexed: 0, removed: 0, stale: 0, failed: 0, cleared: 0, remaining: 0 };
  const messageIds = queue.filter((row) => row.kind === "M").map((row) => row.entityId);
  const conversationRows = queue.filter((row) => row.kind === "C").map((row) => row.entityId);
  const read = await readSealed(ports.client, messageIds);
  const prepared = await prepare(ports, [...read.values()]);
  if (prepared === null) return { skipped: "no-key" };
  const goneAtRead = messageIds.filter((id) => !read.has(id));
  if (ports.beforeWrite) await ports.beforeWrite();

  const counts = await withBusyRetry(() =>
    ports.client.$transaction(async (tx) => {
      await lockForWrite(tx);
      const now = await readSealed(tx, messageIds);
      const replace: Prepared[] = [];
      const remove = goneAtRead.filter((id) => !now.has(id));
      let stale = 0;
      for (const entry of prepared.ready) {
        const current = now.get(entry.message.id);
        if (current === undefined) remove.push(entry.message.id);
        else if (sameStamp(current, entry.message)) replace.push(entry);
        else stale += 1;
      }
      const failedNow = prepared.failed.filter((message) => now.has(message.id));
      const failedGone = prepared.failed.filter((message) => !now.has(message.id)).map((message) => message.id);
      remove.push(...failedGone);

      await removeMessageDocs(tx, [...remove, ...replace.map((entry) => entry.message.id)]);
      await insertMessageDocs(tx, replace);
      await deleteDirty(tx, "M", [...remove, ...replace.map((entry) => entry.message.id)]);
      // A message that cannot be opened goes to the back of the queue so it cannot starve the others.
      await deleteDirty(tx, "M", failedNow.map((message) => message.id));
      for (const batch of batches(failedNow, DOC_ROWS_PER_INSERT)) {
        await tx.$executeRawUnsafe(
          `INSERT INTO "ConversationSearchDirty" ("kind", "entityId", "conversationId") VALUES ${batch
            .map(() => "('M', ?, ?)")
            .join(",")} ON CONFLICT ("kind", "entityId") DO NOTHING`,
          ...batch.flatMap((message) => [message.id, message.conversationId]),
        );
      }
      await deleteDirty(tx, "C", conversationRows);
      return {
        indexed: replace.length,
        removed: remove.length,
        stale,
        failed: failedNow.length,
        cleared: conversationRows.length,
      };
    }, WRITE_TRANSACTION),
  );
  const remaining = await countOf(ports.client, `SELECT COUNT(*) AS n FROM "ConversationSearchDirty"`);
  return { ...counts, remaining };
}

/**
 * Indexes one chunk (at most 100 messages) of the newest conversation that has no C doc. The messages that are
 * queued in Dirty are the drain's. The C doc is written by the last chunk, in the same transaction as its rows.
 */
export async function backfillConversationSearchChunk(ports: IndexerPorts): Promise<BackfillResult | NoKey> {
  if (!(await keyPresent(ports.derive))) return { skipped: "no-key" };
  const candidates = await ports.client.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT c."id" AS id ${UNCOVERED_CONVERSATIONS}
      ORDER BY c."lastMessageAt" DESC, c."updatedAt" DESC LIMIT ${BACKFILL_CANDIDATES}`,
  );
  let indexed = 0;
  let covered = 0;
  for (const candidate of candidates) {
    const outcome = await backfillOneConversation(ports, candidate.id);
    if (outcome === null) return { skipped: "no-key" };
    indexed += outcome.indexed;
    covered += outcome.covered;
    // A conversation that made no progress (a message that cannot be opened) must not block the ones behind it.
    if (indexed + covered > 0) break;
  }
  const remaining = await countOf(ports.client, `SELECT COUNT(*) AS n ${UNCOVERED_CONVERSATIONS}`);
  if (indexed + covered > 0) {
    progress.chunks += 1;
    progress.indexed += indexed;
    if (progress.chunks % LOG_EVERY_CHUNKS === 0) {
      logger.info("conversation-search.backfill", { indexed: progress.indexed, remaining });
    }
  }
  return { indexed, covered, remaining };
}

async function backfillOneConversation(
  ports: IndexerPorts,
  conversationId: string,
): Promise<{ indexed: number; covered: number } | null> {
  const rows = await ports.client.$queryRawUnsafe<SealedMessage[]>(
    `SELECT m."id", m."conversationId", m."body" FROM "Message" m
      WHERE m."conversationId" = ?
        AND NOT EXISTS (SELECT 1 FROM "ConversationSearchDoc" d WHERE d."kind" = 'M' AND d."entityId" = m."id")
        AND NOT EXISTS (SELECT 1 FROM "ConversationSearchDirty" y WHERE y."kind" = 'M' AND y."entityId" = m."id")
      ORDER BY m."timestamp", m."id" LIMIT ${BACKFILL_CHUNK_MESSAGES + 1}`,
    conversationId,
  );
  const isLast = rows.length <= BACKFILL_CHUNK_MESSAGES;
  const chunk = rows.slice(0, BACKFILL_CHUNK_MESSAGES);
  const prepared = await prepare(ports, chunk);
  if (prepared === null) return null;
  if (ports.beforeWrite) await ports.beforeWrite();

  return withBusyRetry(() =>
    ports.client.$transaction(async (tx) => {
      await lockForWrite(tx);
      const alive = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT "id" FROM "Conversation" WHERE "id" = ?`,
        conversationId,
      );
      if (alive.length === 0) return { indexed: 0, covered: 0 };
      const ids = prepared.ready.map((entry) => entry.message.id);
      const now = await readSealed(tx, ids);
      const queued = new Set<string>();
      for (const batch of batches(ids, IN_BATCH)) {
        const list = await tx.$queryRawUnsafe<Array<{ entityId: string }>>(
          `SELECT "entityId" FROM "ConversationSearchDirty" WHERE "kind" = 'M' AND "entityId" IN (${marks(batch.length)})`,
          ...batch,
        );
        for (const row of list) queued.add(row.entityId);
      }
      // Docs are only added, never replaced: a doc the drain wrote in the meantime is fresher than this read.
      const keep = prepared.ready.filter(
        (entry) => sameStamp(now.get(entry.message.id), entry.message) && !queued.has(entry.message.id),
      );
      const written = await insertMessageDocs(tx, keep);
      let covered = 0;
      if (isLast) {
        const gap = await tx.$queryRawUnsafe<Array<{ x: number }>>(
          `SELECT 1 AS x FROM "Message" m WHERE m."conversationId" = ?
              AND NOT EXISTS (SELECT 1 FROM "ConversationSearchDoc" d WHERE d."kind" = 'M' AND d."entityId" = m."id")
              AND NOT EXISTS (SELECT 1 FROM "ConversationSearchDirty" y WHERE y."kind" = 'M' AND y."entityId" = m."id")
            LIMIT 1`,
          conversationId,
        );
        if (gap.length === 0) {
          covered = await tx.$executeRawUnsafe(
            `INSERT INTO "ConversationSearchDoc" ("kind", "entityId", "conversationId") VALUES ('C', ?, ?)
             ON CONFLICT ("kind", "entityId") DO NOTHING`,
            conversationId,
            conversationId,
          );
        }
      }
      return { indexed: written, covered };
    }, WRITE_TRANSACTION),
  );
}

/** One unit of idle work: drain the queue if it holds anything, else one backfill chunk. */
export async function runConversationSearchIndexStep(ports: IndexerPorts): Promise<StepResult | NoKey> {
  const drained = await drainConversationSearchDirty(ports);
  if ("skipped" in drained) return drained;
  if (drained.indexed + drained.removed + drained.cleared > 0) return { changed: true };
  const filled = await backfillConversationSearchChunk(ports);
  if ("skipped" in filled) return filled;
  return { changed: filled.indexed + filled.covered > 0 };
}
