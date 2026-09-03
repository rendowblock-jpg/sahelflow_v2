import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { db, shopContext } from "@/lib/db";
import {
  assertTrustedAction,
  requireTrustedAction,
} from "@/lib/identity/authorization";
import { projectTrustedActorActions } from "@/lib/identity/conversation-projection";
import { listTeamMembers } from "@/lib/identity/team-directory";
import { getConversationAssignmentVersions } from "@/lib/inbox/conversation-assignment";
import {
  sidecar,
  SidecarRequestError,
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
      pinnedAt: true,
      mutedUntil: true,
      archivedAt: true,
      messages: {
        orderBy: { timestamp: "desc" },
        take: 1,
        select: {
          body: true,
          direction: true,
          timestamp: true,
          messageType: true,
        },
      },
    },
  });
  const assignmentVersions = await getConversationAssignmentVersions(
    { prisma: db, shop: shopContext },
    conversations.map((conversation) => conversation.id),
  );

  // Ledger INB-20: rows render the assignee's display NAME, not a generic
  // "assigned" word. Assignee ids are free-form strings, so the name comes
  // from the team directory; unknown/foreign ids fall back to null and the
  // client keeps its honest generic label.
  const assigneeIds = Array.from(
    new Set(
      conversations
        .map((conversation) => conversation.assigneeId)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const assigneeNameById = new Map<string, string>();
  if (assigneeIds.length > 0) {
    try {
      const teamMembers = await listTeamMembers(actorContext.shop);
      for (const member of teamMembers) {
        if (member.displayName) {
          assigneeNameById.set(member.memberId, member.displayName);
        }
      }
    } catch {
      // Directory unavailable — rows degrade to the generic label.
    }
  }

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
              // TIMESTAMP CONTRACT (audit S3-21): this projection — and the
              // sibling /whatsapp/chats/[jid]/messages route — intentionally
              // keep Baileys-style epoch SECONDS here because the inbox
              // provider-shape consumers (Baileys-compatible clients and the
              // sidecar parity layer) expect that exact field shape. Every
              // other SahelFlow API surface returns ISO strings. This is the
              // ONLY sanctioned epoch-seconds exception; new routes MUST use
              // ISO strings.
              timestamp: Math.floor(last.timestamp.getTime() / 1_000),
              fromMe: isOutboundDirection(last.direction),
              // Preview rendering needs the media family (📷/🎤/📎 icons in
              // the conversation list) — additive, provider-shape safe.
              type: last.messageType ?? null,
            }
          : undefined,
        // Ledger INB-12: server-projected state truth. Mute is a horizon —
        // an expired mutedUntil reads as unmuted, never as a stale flag.
        states: {
          pinned: conversation.pinnedAt !== null,
          muted: conversation.mutedUntil
            ? conversation.mutedUntil.getTime() > Date.now()
            : false,
          archived: conversation.archivedAt !== null,
        },
        workflow: {
          status: conversation.status,
          assigneeId: conversation.assigneeId,
          assigneeName: conversation.assigneeId
            ? assigneeNameById.get(conversation.assigneeId) ?? null
            : null,
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

  // Transport health is projection metadata only. Any provider/network failure
  // must not invalidate already-committed local inbox truth.
  let sidecarReachable = true;
  let sidecarStatus: string | null = null;
  try {
    sidecarStatus = (await sidecar.status()).status;
  } catch (error) {
    if (
      !(error instanceof SidecarUnavailableError) &&
      !(error instanceof SidecarRequestError)
    ) {
      throw error;
    }
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
