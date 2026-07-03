/**
 * Conversation service (Phase 5 — Chatwoot pattern).
 *
 * Manages conversation workflow: status transitions, assignment, priority,
 * labels, snooze. Each change writes an activity Message (messageType:
 * "activity") so it appears inline in the thread timeline.
 */
import "server-only";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";

export type ConversationStatus = "open" | "pending" | "resolved" | "snoozed";

export async function updateConversationStatus(
  conversationId: string,
  status: ConversationStatus,
  snoozedUntil?: Date,
) {
  const conv = await db.conversation.update({
    where: { id: conversationId },
    data: {
      status,
      snoozedUntil: status === "snoozed" ? (snoozedUntil ?? null) : null,
      // Reopening a resolved/snoozed conversation resets waiting
      waitingSince: status === "open" ? new Date() : null,
    },
  });

  // Write an activity message (inline timeline event)
  await db.message.create({
    data: {
      conversationId,
      body: `Conversation ${status}`,
      direction: "system",
      timestamp: new Date(),
      messageType: "activity",
      activityType: `status_${status}`,
    },
  });

  void logAudit({
    action: "conversation.status.changed",
    entity: "conversation",
    entityId: conversationId,
    actor: "user",
    after: { status, snoozedUntil },
  });

  return conv;
}

export async function assignConversation(conversationId: string, assigneeId: string | null) {
  const conv = await db.conversation.update({
    where: { id: conversationId },
    data: { assigneeId },
  });

  await db.message.create({
    data: {
      conversationId,
      body: assigneeId ? `Assigned to ${assigneeId}` : "Assignment removed",
      direction: "system",
      timestamp: new Date(),
      messageType: "activity",
      activityType: assigneeId ? "assigned" : "unassigned",
    },
  });

  void logAudit({
    action: "conversation.assigned",
    entity: "conversation",
    entityId: conversationId,
    actor: "user",
    after: { assigneeId },
  });

  return conv;
}

export async function setConversationPriority(
  conversationId: string,
  priority: "urgent" | "high" | "medium" | "low" | null,
) {
  const conv = await db.conversation.update({
    where: { id: conversationId },
    data: { priority },
  });

  await db.message.create({
    data: {
      conversationId,
      body: priority ? `Priority set to ${priority}` : "Priority cleared",
      direction: "system",
      timestamp: new Date(),
      messageType: "activity",
      activityType: "priority_set",
    },
  });

  return conv;
}

export async function setConversationLabels(conversationId: string, labels: string[]) {
  const conv = await db.conversation.update({
    where: { id: conversationId },
    data: { labels: JSON.stringify(labels) },
  });
  return conv;
}

export async function getConversationLabels(conversationId: string): Promise<string[]> {
  const conv = await db.conversation.findUnique({
    where: { id: conversationId },
    select: { labels: true },
  });
  if (!conv?.labels) return [];
  try { return JSON.parse(conv.labels); } catch { return []; }
}
