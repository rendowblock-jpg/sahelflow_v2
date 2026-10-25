import "server-only";

import { createProtectedPiiCodec } from "@/lib/crypto/protected-pii";
import { deriveExistingShopBlindIndexes } from "@/lib/crypto/protected-record";
import { db, shopContext } from "@/lib/db";
import {
  runConversationSearchIndexStep,
  type IndexerClient,
  type IndexerPorts,
  type SealedContact,
  type SealedMessage,
} from "@/lib/search/conversation-search-index";

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
      const present = await client.$queryRawUnsafe<unknown[]>(
        `SELECT 1 AS present FROM "ProtectedKeyAuthority" WHERE "purpose" = 'shop-blind-index' LIMIT 1`,
      );
      if (present.length === 0) return null;
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
