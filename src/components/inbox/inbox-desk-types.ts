import type { InboxChat } from "@/components/inbox/inbox-workspace-types";

export type DeskQueueFilter = "mine" | "unassigned" | "unread" | "all";
export type WorkflowFilter = "all" | "open" | "pending" | "resolved" | "snoozed";

export type InboxAuthorityView = {
  currentMemberId: string | null;
  role: "owner" | "manager" | "operator" | "viewer" | null;
  allowedActions: string[];
};

export type InboxSearchResult = {
  id: string;
  conversationId: string;
  contactName: string | null;
  contactPhone: string | null;
  sourceId: string | null;
  channel: string;
  lastMessageAt: string | null;
  unreadCount: number;
  lastMessage: {
    body: string;
    direction: string;
    timestamp: string;
  } | null;
  workflow: {
    status: string;
    assigneeId: string | null;
    priority: string | null;
    labels: string[];
    snoozedUntil: string | null;
    waitingSince: string | null;
    firstReplyAt: string | null;
  };
};

export function searchResultToChat(
  result: InboxSearchResult,
  restrictedContact: string,
): InboxChat {
  const hasTransport = result.channel === "whatsapp" && Boolean(result.sourceId);
  return {
    id: result.sourceId ?? result.id,
    conversationId: result.id,
    ...(result.sourceId ? { transportId: result.sourceId } : {}),
    name: result.contactName ?? restrictedContact,
    ...(result.contactPhone ? { phone: result.contactPhone } : {}),
    channel: hasTransport ? "whatsapp" : "conversation",
    ...(result.lastMessage ? { lastMessageText: result.lastMessage.body } : {}),
    ...(result.lastMessageAt
      ? { lastMessageAt: new Date(result.lastMessageAt).getTime() }
      : {}),
    unread: result.unreadCount,
    workflow: {
      status: result.workflow.status as InboxChat["workflow"]["status"],
      assigneeId: result.workflow.assigneeId,
      priority: result.workflow.priority as InboxChat["workflow"]["priority"],
      labels: result.workflow.labels,
      snoozedUntil: result.workflow.snoozedUntil,
      waitingSince: result.workflow.waitingSince,
      firstReplyAt: result.workflow.firstReplyAt,
    },
  };
}
