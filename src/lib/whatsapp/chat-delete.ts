import "server-only";

import type { ServiceContext } from "@/lib/data/service-base";
import { logger } from "@/lib/logger";
import {
  removeWhatsAppMediaObject,
  removeWhatsAppMediaObjectThumbnail,
} from "@/lib/whatsapp/media-object-store";

export interface DeleteWhatsAppChatsResult {
  deletedConversationIds: string[];
  deletedMessageCount: number;
}

/**
 * F-10 (Internal.34 installed campaign, founder-confirmed): the first delete
 * attempt intermittently failed with a surfaced error and the second attempt
 * succeeded. Named root: SQLite write-lock contention — the deletion runs as
 * one multi-statement transaction while concurrent writers (ingress
 * processor, outbox worker, read-state updates) hold the database write lock;
 * the losing transaction throws and the operator sees a first-attempt error.
 *
 * A busy/locked rejection is retry-safe here: the transaction is atomic, so
 * a rejected attempt committed nothing. The deletion target set is derived
 * from ids, and a retried transaction re-asserts every tombstone/delete
 * against the same ids inside the new transaction — a concurrent writer that
 * touched those rows between attempts is handled by the same statements, not
 * by stale data.
 */
function isSqliteBusyError(error: unknown): boolean {
  if (!error) return false;
  if (typeof error === "object" && "code" in error) {
    // P2024: Prisma connection-pool timeout (the pool wait expiring while the
    // database is write-saturated) surfaces with this code.
    if ((error as { code?: unknown }).code === "P2024") return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("SQLITE_BUSY") ||
    message.includes("database is locked") ||
    message.includes("database table is locked")
  );
}

const BUSY_RETRY_DELAYS_MS = [150, 450];

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Permanently delete whole WhatsApp chats (founder-confirmed contract:
 * permanent delete + multi-select). Local inbox truth only — delivered
 * WhatsApp copies on the provider and the recipient's phone are untouched.
 *
 * In one transaction: ingress events are tombstoned (including not-yet-applied
 * events, so a queued inbound can never resurrect the conversation), outbox
 * intents deleted (cancelling any still-pending send for these messages),
 * outbound effects deleted, then the Conversation rows (messages cascade).
 * Encrypted media objects are removed best-effort after the commit — they are
 * deterministic per Message identity, so a leftover file is unreachable state,
 * never a correctness hazard.
 *
 * Ingress events are tombstoned with a terminal "chat_deleted" status instead
 * of being deleted: their ingressKey IS the provider-replay idempotency
 * barrier. Hard-deleting them let a re-notified inbound (sidecar spool retry,
 * reconnect re-delivery) create a fresh event row and re-apply the message,
 * resurrecting the deleted chat. The terminal status keeps the dedup barrier
 * and the append-only attempt audit intact while the processor and operator
 * recovery both refuse to apply a tombstoned event.
 *
 * Business-command audit history (BusinessCommand/DomainEvent) is append-only
 * and intentionally survives: it proves what the shop did, independent of
 * whether the inbox state still exists.
 */
export async function deleteWhatsAppChats(
  context: ServiceContext,
  ids: string[],
): Promise<DeleteWhatsAppChatsResult> {
  const uniqueIds = [
    ...new Set(ids.map((id) => id.trim()).filter(Boolean)),
  ].sort();
  if (uniqueIds.length === 0) {
    return { deletedConversationIds: [], deletedMessageCount: 0 };
  }

  const conversations = await context.prisma.conversation.findMany({
    where: { id: { in: uniqueIds }, channel: "whatsapp" },
    select: { id: true, sourceId: true },
  });
  const conversationIds = conversations
    .map((conversation) => conversation.id)
    .sort();
  if (conversationIds.length === 0) {
    return { deletedConversationIds: [], deletedMessageCount: 0 };
  }
  const sourceIds = conversations.flatMap((conversation) =>
    conversation.sourceId ? [conversation.sourceId] : [],
  );

  const [messages, events] = await Promise.all([
    context.prisma.message.findMany({
      where: { conversationId: { in: conversationIds } },
      select: { id: true },
    }),
    context.prisma.providerIngressEvent.findMany({
      where: {
        OR: [
          ...(sourceIds.length > 0
            ? [{ sourceId: { in: sourceIds } }]
            : []),
          ...(conversationIds.length > 0
            ? [{ conversationId: { in: conversationIds } }]
            : []),
        ],
      },
      select: { id: true },
    }),
  ]);
  const messageIds = messages.map((message) => message.id);
  const eventIds = events.map((event) => event.id);

  const effects = messageIds.length
    ? await context.prisma.whatsAppOutboundEffect.findMany({
        where: { messageId: { in: messageIds } },
        select: { effectKey: true },
      })
    : [];
  const effectKeys = effects.map((effect) => effect.effectKey);

  // F-10: bounded busy-retry — two re-issues with short backoff absorb the
  // transient write-lock loss before the operator ever sees an error. Any
  // non-busy failure, or a busy failure that survives every retry, still
  // throws to the route's coded 500 path (guaranteed failure surfacing).
  for (let attempt = 0; ; attempt += 1) {
    try {
      await context.prisma.$transaction(async (tx) => {
        if (eventIds.length > 0) {
          // Terminal tombstone — never delete. ProviderIngressEvent.ingressKey is
          // the provider-replay idempotency barrier, and ProviderIngressAttempt
          // rows carry a Restrict FK into the event; both stay as append-only
          // evidence. The processor's terminal-status gate and the operator
          // recovery guard refuse "chat_deleted", so no path can re-apply these
          // events and resurrect the deleted conversations.
          await tx.providerIngressEvent.updateMany({
            where: { id: { in: eventIds } },
            data: {
              status: "chat_deleted",
              lastErrorCode: "CHAT_DELETED",
              nextAttemptAt: null,
              lockedAt: null,
              leaseToken: null,
            },
          });
        }
        if (effectKeys.length > 0) {
          await tx.outboxIntent.deleteMany({
            where: { effectKey: { in: effectKeys } },
          });
        }
        if (messageIds.length > 0) {
          await tx.whatsAppOutboundEffect.deleteMany({
            where: { messageId: { in: messageIds } },
          });
        }
        await tx.conversation.deleteMany({
          where: { id: { in: conversationIds } },
        });
      });
      break;
    } catch (error) {
      // noUncheckedIndexedAccess: index into the delays table must narrow
      // before use; the bounds guard makes the undefined branch unreachable,
      // and falling back to throwing keeps the non-retry path intact.
      const delay =
        attempt < BUSY_RETRY_DELAYS_MS.length
          ? BUSY_RETRY_DELAYS_MS[attempt]
          : undefined;
      if (delay !== undefined && isSqliteBusyError(error)) {
        logger.warn("whatsapp.chat_delete.busy_retry", {
          attempt: attempt + 1,
          conversations: conversationIds.length,
          messages: messageIds.length,
          events: eventIds.length,
        });
        await sleep(delay);
        continue;
      }
      throw error;
    }
  }

  // Post-commit hygiene: canonical and thumbnail media objects are bound to
  // Message identities that no longer exist. Best-effort: any file that
  // cannot be removed stays as unreachable ciphertext, never readable state.
  for (const messageId of messageIds) {
    try {
      await removeWhatsAppMediaObject(context, messageId);
    } catch {
      // unreachable leftover is acceptable; DB truth is already gone
    }
    try {
      await removeWhatsAppMediaObjectThumbnail(context, messageId);
    } catch {
      // same as canonical objects
    }
  }

  return {
    deletedConversationIds: conversationIds,
    deletedMessageCount: messageIds.length,
  };
}
