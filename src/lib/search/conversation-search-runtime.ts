import "server-only";

import { createProtectedPiiCodec } from "@/lib/crypto/protected-pii";
import { deriveExistingShopBlindIndexes } from "@/lib/crypto/protected-record";
import { db, shopContext } from "@/lib/db";
import {
  drainConversationSearchDirty,
  runConversationSearchIndexStep,
  shopKeyRowPresent,
  type IndexerClient,
  type IndexerPorts,
  type SealedContact,
  type SealedMessage,
} from "@/lib/search/conversation-search-index";
import { searchConversationIndex, type SearchRow } from "@/lib/search/conversation-search-query";

/**
 * The app wiring of the conversation-search indexer: the real client, the real shop key and the real message codec.
 * The idle gate loads this file on its first tick, never at start-up.
 */

type BlindIndexClient = Parameters<typeof deriveExistingShopBlindIndexes>[0];
type CodecClient = Parameters<typeof createProtectedPiiCodec>[0];

let codec: ReturnType<typeof createProtectedPiiCodec> | undefined;

function ports(): IndexerPorts {
  codec ??= createProtectedPiiCodec(db as unknown as CodecClient, shopContext);
  const messageCodec = codec;
  const client = db as unknown as IndexerClient;
  return {
    client,
    // null = the shop key row is missing: the indexer then does nothing (the search uses the plain path).
    // `db` serves the key rows from a cache filled at start, so it never reports a row that was lost afterwards:
    // the row is looked up with plain SQL first.
    derive: async (values, reference) => {
      if (!(await shopKeyRowPresent(client))) return null;
      return deriveExistingShopBlindIndexes(db as unknown as BlindIndexClient, values, reference, {
        shopContext,
        normalize: (value) => value,
      });
    },
    openBody: async (message: SealedMessage) => {
      const opened = await messageCodec.decryptFields({ id: message.id, body: message.body }, ["body"], "Message");
      if (typeof opened.body !== "string") throw new TypeError("message body is not text");
      return opened.body;
    },
    openContact: async (contact: SealedContact) => {
      const opened = await messageCodec.decryptFields(
        { id: contact.id, contactName: contact.contactName, contactPhone: contact.contactPhone },
        ["contactName", "contactPhone"],
        "Conversation",
      );
      const text = (value: unknown): string | null => {
        if (value === null || value === undefined) return null;
        if (typeof value !== "string") throw new TypeError("contact field is not text");
        return value;
      };
      return { name: text(opened.contactName), phone: text(opened.contactPhone) };
    },
  };
}

/** One step for the idle gate: a missing key counts as "nothing to do". */
export async function runConversationSearchIndexTick(): Promise<{ changed: boolean }> {
  const result = await runConversationSearchIndexStep(ports());
  return "skipped" in result ? { changed: false } : result;
}

/** Queued changes one search may index itself; the rest of a backlog belongs to the idle ticks. */
const SEARCH_DRAIN_ROWS = 8;

/**
 * The inbox search: the newest 500 conversations and their 50 newest messages, as the route always read them, but
 * only the candidates the index names are loaded. Contacts and bodies come through `db`, which opens them.
 */
export async function searchConversationsIndexed(args: { query: string; canReadContact: boolean }): Promise<SearchRow[]> {
  const indexer = ports();
  return searchConversationIndex(
    {
      client: indexer.client,
      derive: indexer.derive,
      listWindowIds: async () =>
        (
          await db.conversation.findMany({
            select: { id: true },
            orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }],
            take: 500,
          })
        ).map((row) => row.id),
      loadConversations: (ids) =>
        db.conversation.findMany({
          where: { id: { in: [...ids] } },
          include: { messages: { orderBy: { timestamp: "desc" }, take: 50 } },
        }),
      drain: async () => {
        await drainConversationSearchDirty(indexer, SEARCH_DRAIN_ROWS);
      },
    },
    args,
  );
}
