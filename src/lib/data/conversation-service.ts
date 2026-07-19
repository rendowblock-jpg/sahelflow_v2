/**
 * Conversation service (Phase 5 — Chatwoot pattern).
 *
 * Manages conversation workflow: status transitions, assignment, priority,
 * labels, snooze. Each change writes an activity Message (messageType:
 * "activity") so it appears inline in the thread timeline.
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

export async function assignConversation(
  context: ServiceContext,
  conversationId: string,
  assigneeId: string | null,
) {
  const db = context.prisma;
  // TXN: conversation update + activity message must be atomic.
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
  try { return JSON.parse(conv.labels); } catch { return []; }
}


/**
 * Session 30 (AUDIT-5 C1): ensure a Conversation row exists for a live
 * WhatsApp chat. Live chats use the JID as their id (e.g. "213555123456@s.whatsapp.net"),
 * but the Conversation table's id is a cuid. The PATCH routes for status/
 * priority/assignee/labels receive the JID as :id and 404 because no
 * Conversation row exists. This helper upserts by sourceId=JID so the
 * controls work for live chats (the primary inbox use case).
 *
 * Returns the conversation id (cuid) — callers can then PATCH by that id.
 * Or returns null if the input doesn't look like a JID.
 */
export async function ensureConversationForJid(
  context: ServiceContext,
  jidOrId: string,
): Promise<string> {
  const db = context.prisma;
  // If it doesn't look like a JID, return as-is (it's already a cuid)
  if (!jidOrId.includes("@")) {
    return jidOrId;
  }
  // It's a JID — extract the phone number for the contact fields
  const phone = jidOrId.split("@")[0]?.split(":")[0] ?? "";
  // Try to find an existing Conversation by sourceId=JID
  const existing = await db.conversation.findFirst({
    where: { sourceId: jidOrId },
    select: { id: true },
  });
  if (existing) {
    return existing.id;
  }
  // Upsert by sourceId (unique? not currently — but findFirst is fine for our scale)
  const created = await db.conversation.create({
    data: {
      channel: "whatsapp",
      contactName: phone, // will be enriched later when we receive the first message
      contactPhone: phone,
      sourceId: jidOrId,
      lastMessageAt: new Date(),
    },
    select: { id: true },
  });
  return created.id;
}
