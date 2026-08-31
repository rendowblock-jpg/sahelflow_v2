import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { db } from "@/lib/db";
import { requireTrustedAction } from "@/lib/identity/authorization";
import { projectConversationForTrustedActor } from "@/lib/identity/conversation-projection";

export const dynamic = "force-dynamic";

const PREVIEW_MAX_LENGTH = 80;

/**
 * Collapse whitespace and truncate on a code-point boundary so a multiline
 * WhatsApp body becomes a single safe toast/preview line.
 */
function toPreviewLine(body: string | undefined | null): string | null {
  const collapsed = body?.replace(/\s+/g, " ").trim();
  if (!collapsed) return null;
  const characters = Array.from(collapsed);
  if (characters.length <= PREVIEW_MAX_LENGTH) return collapsed;
  return `${characters.slice(0, PREVIEW_MAX_LENGTH).join("")}…`;
}

/**
 * GET /api/conversations/unread-summary — cheap global inbox liveness summary
 * for surfaces outside the inbox workspace (sidebar unread badge, new-message
 * toast/sound).
 *
 * Read-only sibling of the conversations collection route (which stays
 * untouched). The shop database is the authority — the same `unreadCount`
 * column the inbox queue renders — so the badge can never disagree with the
 * inbox about what is unread. The latest unread conversation is projected
 * through the trusted-actor contact policy exactly like the collection route:
 * sellers without `customers.contact.read` still get the count, but no
 * customer name/preview.
 */
export const GET = withErrorHandler(async (_req: NextRequest) => {
  const actorContext = await requireTrustedAction("conversations.read");

  const unreadWhere = { unreadCount: { gt: 0 } };
  const [aggregate, latestRows] = await Promise.all([
    db.conversation.aggregate({
      where: unreadWhere,
      _sum: { unreadCount: true },
      _count: { _all: true },
    }),
    db.conversation.findMany({
      where: unreadWhere,
      orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }],
      take: 1,
      select: {
        id: true,
        contactName: true,
        contactPhone: true,
        unreadCount: true,
        lastMessageAt: true,
        status: true,
        assigneeId: true,
        priority: true,
        labels: true,
        snoozedUntil: true,
        waitingSince: true,
        firstReplyAt: true,
        messages: {
          // Only inbound bodies make sense as a "new message" preview — the
          // seller's own last reply is not news.
          where: { direction: "inbound" },
          orderBy: { timestamp: "desc" },
          take: 1,
          select: { body: true },
        },
      },
    }),
  ]);

  const latestRow = latestRows[0];
  const latest = latestRow
    ? (() => {
        const projected = projectConversationForTrustedActor(
          latestRow,
          actorContext,
        );
        return {
          conversationId: projected.id,
          name: projected.contactName,
          preview: projected.fieldAccess.contact
            ? toPreviewLine(latestRow.messages[0]?.body)
            : null,
          unread: latestRow.unreadCount,
        };
      })()
    : null;

  return NextResponse.json({
    total: aggregate._sum.unreadCount ?? 0,
    conversations: aggregate._count,
    latest,
  });
}, "GET /api/conversations/unread-summary");
