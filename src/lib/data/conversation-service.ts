/**
 * Conversation service (Phase 5 — Chatwoot pattern).
 *
 * Manages conversation workflow: status transitions, legacy assignment,
 * priority, labels and snooze. The governed collaboration package replaces
 * assignment writes through `src/lib/inbox/conversation-assignment.ts`; this
 * file retains the older helper only for source compatibility until every
 * caller is migrated.
 */
import "server-only";
import type { ServiceContext } from "@/lib/data/service-base";
import { logAudit } from "@/lib/audit";

export type ConversationStatus = "open" | "pending" | "resolved" | "snoozed";

export async function updateConversationStatus(
  context: ServiceContext,
  conversationId: string,
  status: ConversationStatus,
  snoozedUntil?: Date,
) {
  const db = context.prisma;
  // TXN: conversation update + activity message must be atomic (audit finding
  // D-conv: "conversation update + activity message not transactional").
  const conv = await db.$transaction(async (tx) => {
    const updated = await tx.conversation.update({
      where: { id: conversationId },
      data: {
        status,
        snoozedUntil: status === "snoozed" ? (snoozedUntil ?? null) : null,
        // Reopening a resolved/snoozed conversation resets waiting
        waitingSince: status === "open" ? new Date() : null,
      },
    });

    // Write an activity message (inline timeline event) — same tx
    await tx.message.create({
      data: {
        conversationId,
        body: `Conversation ${status}`,
        direction: "system",
        timestamp: new Date(),
        messageType: "activity",
        activityType: `status_${status}`,
      },
    });

    return updated;
  });

  void logAudit(context, {
    action: "conversation.status.changed",
    entity: "conversation",
    entityId: conversationId,
    actor: "user",
    after: { status, snoozedUntil },
  });

  return conv;
}

/** @deprecated Use the governed conversation assignment command. */
export async function assignConversation(
  context: ServiceContext,
  conversationId: string,
  assigneeId: string | null,
) {
  const db = context.prisma;
  const conv = await db.$transaction(async (tx) => {
    const updated = await tx.conversation.update({
      where: { id: conversationId },
      data: { assigneeId },
    });

    await tx.message.create({
      data: {
        conversationId,
        body: assigneeId ? `Assigned to ${assigneeId}` : "Assignment removed",
        direction: "system",
        timestamp: new Date(),
        messageType: "activity",
        activityType: assigneeId ? "assigned" : "unassigned",
      },
    });

    return updated;
  });

  void logAudit(context, {
    action: "conversation.assigned",
    entity: "conversation",
    entityId: conversationId,
    actor: "user",
    after: { assigneeId },
  });

  return conv;
}

export async function setConversationPriority(
  context: ServiceContext,
  conversationId: string,
  priority: "urgent" | "high" | "medium" | "low" | null,
) {
  const db = context.prisma;
  // TXN: conversation update + activity message must be atomic.
  const conv = await db.$transaction(async (tx) => {
    const updated = await tx.conversation.update({
      where: { id: conversationId },
      data: { priority },
    });

    await tx.message.create({
      data: {
        conversationId,
        body: priority ? `Priority set to ${priority}` : "Priority cleared",
        direction: "system",
        timestamp: new Date(),
        messageType: "activity",
        activityType: "priority_set",
      },
    });

    return updated;
  });

  return conv;
}

export async function setConversationLabels(
  context: ServiceContext,
  conversationId: string,
  labels: string[],
) {
  const db = context.prisma;
  const conv = await db.conversation.update({
    where: { id: conversationId },
    data: { labels: JSON.stringify(labels) },
  });
  return conv;
}

export async function getConversationLabels(
  context: ServiceContext,
  conversationId: string,
): Promise<string[]> {
  const db = context.prisma;
  const conv = await db.conversation.findUnique({
    where: { id: conversationId },
    select: { labels: true },
  });
  if (!conv?.labels) return [];
  try {
    return JSON.parse(conv.labels);
  } catch {
    return [];
  }
}

/**
 * Ensure one canonical Conversation row exists for a live WhatsApp JID.
 *
 * The schema already owns `@@unique([channel, sourceId])`. Use that exact
 * identity in one atomic upsert so concurrent assignment/status requests cannot
 * create duplicate rows or fail between a separate read and create.
 */
export async function ensureConversationForJid(
  context: ServiceContext,
  jidOrId: string,
): Promise<string> {
  if (!jidOrId.includes("@")) return jidOrId;

  const phone = jidOrId.split("@")[0]?.split(":")[0] ?? "";
  const conversation = await context.prisma.conversation.upsert({
    where: {
      channel_sourceId: {
        channel: "whatsapp",
        sourceId: jidOrId,
      },
    },
    update: {},
    create: {
      channel: "whatsapp",
      contactName: phone,
      contactPhone: phone,
      sourceId: jidOrId,
      lastMessageAt: new Date(),
    },
    select: { id: true },
  });
  return conversation.id;
}

/**
 * Resolve an existing live WhatsApp JID without creating durable state.
 * Read routes must use this function so read authority can never authorize an
 * implicit conversation write.
 */
export async function resolveConversationIdForRead(
  context: ServiceContext,
  jidOrId: string,
): Promise<string | null> {
  if (!jidOrId.includes("@")) return jidOrId;

  const conversation = await context.prisma.conversation.findUnique({
    where: {
      channel_sourceId: {
        channel: "whatsapp",
        sourceId: jidOrId,
      },
    },
    select: { id: true },
  });
  return conversation?.id ?? null;
}
