import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { db, shopContext } from "@/lib/db";
import {
  assertTrustedAction,
  requireTrustedAction,
} from "@/lib/identity/authorization";
import { projectTrustedActorActions } from "@/lib/identity/conversation-projection";
import { getConversationAssignmentVersions } from "@/lib/inbox/conversation-assignment";
import {
  sidecar,
  SidecarUnavailableError,
} from "@/lib/whatsapp/sidecar-client";

export const dynamic = "force-dynamic";

function parseLabels(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string")
      : [];
  } catch {
    return [];
  }
}

function isOutboundDirection(direction: string): boolean {
  return direction === "outbound" || direction === "outgoing";
}

export const GET = withErrorHandler(async (request: NextRequest) => {
  const actorContext = await requireTrustedAction("conversations.read");
  assertTrustedAction(actorContext, "customers.contact.read", {
    shopId: actorContext.shop.shopId,
  });
  const requested = Number.parseInt(
    request.nextUrl.searchParams.get("limit") ?? "50",
    10,
  );
  const limit = Number.isFinite(requested)
    ? Math.max(1, Math.min(requested, 500))
    : 50;

  // The shop database is the inbox authority. Provider transport state may be
  // degraded or disconnected without changing which conversations exist, their
  // ordering, workflow state or persisted message preview.
  const conversations = await db.conversation.findMany({
    where: { channel: "whatsapp", sourceId: { not: null } },
    orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }],
    take: limit,
    select: {
      id: true,
      sourceId: true,
      contactName: true,
      contactPhone: true,
      unreadCount: true,
      status: true,
      assigneeId: true,
      priority: true,
      labels: true,
      snoozedUntil: true,
      waitingSince: true,
      firstReplyAt: true,
      messages: {
        orderBy: { timestamp: "desc" },
        take: 1,
        select: {
          body: true,
          direction: true,
          timestamp: true,
        },
      },
    },
  });
  const assignmentVersions = await getConversationAssignmentVersions(
    { prisma: db, shop: shopContext },
    conversations.map((conversation) => conversation.id),
  );

  const chats = conversations.flatMap((conversation) => {
    if (!conversation.sourceId) return [];
    const last = conversation.messages[0];
    return [
      {
        jid: conversation.sourceId,
        conversationId: conversation.id,
        name: conversation.contactName || conversation.sourceId,
        phone: conversation.contactPhone,
        unread: conversation.unreadCount,
        lastMessage: last
          ? {
              text: last.body,
              timestamp: Math.floor(last.timestamp.getTime() / 1_000),
              fromMe: isOutboundDirection(last.direction),
            }
          : undefined,
        workflow: {
          status: conversation.status,
          assigneeId: conversation.assigneeId,
          assignmentVersion: assignmentVersions.get(conversation.id) ?? 0,
          priority: conversation.priority,
          labels: parseLabels(conversation.labels),
          snoozedUntil: conversation.snoozedUntil?.toISOString() ?? null,
          waitingSince: conversation.waitingSince?.toISOString() ?? null,
          firstReplyAt: conversation.firstReplyAt?.toISOString() ?? null,
        },
      },
    ];
  });

  // Transport health is projection metadata only. Historical inbox truth above
  // remains usable even when the sidecar cannot currently be reached.
  let sidecarReachable = true;
  let sidecarStatus: string | null = null;
  try {
    sidecarStatus = (await sidecar.status()).status;
  } catch (error) {
    if (!(error instanceof SidecarUnavailableError)) throw error;
    sidecarReachable = false;
  }

  return NextResponse.json({
    chats,
    sidecarReachable,
    sidecarStatus,
    source: "database",
    authority: { allowedActions: projectTrustedActorActions(actorContext) },
  });
}, "GET /api/whatsapp/chats");
