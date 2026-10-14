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
 * A busy/locked/timeout rejection is retry-safe here: the transaction is
 * atomic, so a rejected attempt committed nothing. Retries cover the read
 * that builds the target set and the commit itself. The deletion target set
 * is derived from ids, and a retried transaction re-asserts every
 * tombstone/delete against the same ids inside the new transaction.
 */
function isSqliteBusyError(error: unknown): boolean {
  if (!error) return false;
  const code =
    typeof error === "object" && error && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  // P2024: pool wait expired while the database was write-saturated.
  // P2028: the interactive transaction timed out waiting on that same lock
  // (the installed F-10 failure — the first delete surfaced, the second
  // succeeded once the writer had moved on). P2034: write conflict.
  if (code === "P2024" || code === "P2028" || code === "P2034") return true;
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("P2024") ||
    message.includes("P2028") ||
    message.includes("P2034") ||
    message.includes("SQLITE_BUSY") ||
    message.includes("database is locked") ||
    message.includes("database table is locked") ||
    message.includes("Transaction already closed") ||
    message.includes("Transaction not found")
  );
}

const BUSY_RETRY_DELAYS_MS = [80, 250, 700, 1_500, 3_000];

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function withBusyRetry<T>(run: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      const delay =
        attempt < BUSY_RETRY_DELAYS_MS.length
          ? BUSY_RETRY_DELAYS_MS[attempt]
          : undefined;
      if (delay !== undefined && isSqliteBusyError(error)) {
        logger.warn("whatsapp.chat_delete.busy_retry", {
          attempt: attempt + 1,
        });
        await sleep(delay);
        continue;
      }
      throw error;
    }
  }
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
  options?: { afterTargetRead?: () => Promise<void> },
): Promise<DeleteWhatsAppChatsResult> {
  const uniqueIds = [
    ...new Set(ids.map((id) => id.trim()).filter(Boolean)),
  ].sort();
  if (uniqueIds.length === 0) {
    return { deletedConversationIds: [], deletedMessageCount: 0 };
  }

  // F-10: bounded busy-retry. The installed failure was a lock timeout that
  // the two short retries did not classify, so the first click surfaced an
  // error and the second (lock already free) succeeded. Reads and the
  // transaction both retry: a rejected attempt commits nothing.
  const conversations = await withBusyRetry(() =>
    context.prisma.conversation.findMany({
      where: { id: { in: uniqueIds }, channel: "whatsapp" },
      select: { id: true, sourceId: true },
    }),
  );
  const conversationIds = conversations
    .map((conversation) => conversation.id)
    .sort();
  if (conversationIds.length === 0) {
    return { deletedConversationIds: [], deletedMessageCount: 0 };
  }
  const sourceIds = conversations.flatMap((conversation) =>
    conversation.sourceId ? [conversation.sourceId] : [],
  );

  // A message committed after the conversation read must not be cascade-deleted
  // without its ingress tombstone. The transaction re-reads both sets, and
  // tombstones every ingress row for the chat source rather than a stale id list.
  if (options?.afterTargetRead) await options.afterTargetRead();

  const ingressWhere = {
    OR: [
      ...(sourceIds.length > 0 ? [{ sourceId: { in: sourceIds } }] : []),
      { conversationId: { in: conversationIds } },
    ],
  };

  // F-10: the commit itself is the write that loses the lock. A longer
  // transaction budget plus the busy retry absorbs a WhatsApp writer that
  // holds SQLite for more than a few hundred milliseconds.
  const messageIds = await withBusyRetry(() =>
    context.prisma.$transaction(
      async (tx) => {
        const liveMessages = await tx.message.findMany({
          where: { conversationId: { in: conversationIds } },
          select: { id: true },
        });
        const liveMessageIds = liveMessages.map((message) => message.id);
        const liveEffects = liveMessageIds.length
          ? await tx.whatsAppOutboundEffect.findMany({
              where: { messageId: { in: liveMessageIds } },
              select: { effectKey: true },
            })
          : [];
        const liveEffectKeys = liveEffects.map((effect) => effect.effectKey);
        // Terminal tombstone — never delete. ProviderIngressEvent.ingressKey is
        // the provider-replay idempotency barrier, and ProviderIngressAttempt
        // rows carry a Restrict FK into the event; both stay as append-only
        // evidence. The processor's terminal-status gate and the operator
        // recovery guard refuse "chat_deleted", so no path can re-apply these
        // events and resurrect the deleted conversations.
        await tx.providerIngressEvent.updateMany({
          where: ingressWhere,
          data: {
            status: "chat_deleted",
            lastErrorCode: "CHAT_DELETED",
            nextAttemptAt: null,
            lockedAt: null,
            leaseToken: null,
          },
        });
        if (liveEffectKeys.length > 0) {
          await tx.outboxIntent.deleteMany({
            where: { effectKey: { in: liveEffectKeys } },
          });
        }
        if (liveMessageIds.length > 0) {
          await tx.whatsAppOutboundEffect.deleteMany({
            where: { messageId: { in: liveMessageIds } },
          });
        }
        await tx.conversation.deleteMany({
          where: { id: { in: conversationIds } },
        });
        return liveMessageIds;
      },
      { maxWait: 8_000, timeout: 20_000 },
    ),
  );

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
