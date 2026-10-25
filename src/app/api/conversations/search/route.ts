/**
 * GET /api/conversations/search?q=<query>
 *
 * Searches canonical conversations plus recent decrypted message bodies. The
 * local shop database remains authoritative; this endpoint is deliberately
 * permission-filtered and returns enough workflow/provider identity to open a
 * result as a fully operational Inbox conversation instead of a read-only row.
 */
import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { db } from "@/lib/db";
import {
  requireTrustedAction,
  trustedActionAllowed,
} from "@/lib/identity/authorization";
import { legacyConversationMatch } from "@/lib/search/conversation-search-legacy";
import { normalizeSearchText } from "@/lib/search/universal-search";

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

export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorContext = await requireTrustedAction("conversations.read");
  const canReadContact = trustedActionAllowed(
    actorContext,
    "customers.contact.read",
    { shopId: actorContext.shop.shopId },
  );
  const query = normalizeSearchText(req.nextUrl.searchParams.get("q") ?? "");
  if (!query) return NextResponse.json({ results: [] });

  // Local-first shops can search deeper than the 100-row live queue without
  // moving plaintext message search into a remote index.
  const conversations = await db.conversation.findMany({
    include: {
      messages: {
        orderBy: { timestamp: "desc" },
        take: 50,
      },
    },
    orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }],
    take: 500,
  });

  const results = conversations
    .flatMap((conversation) => {
      const matchType = legacyConversationMatch({
        query,
        canReadContact,
        contactName: conversation.contactName,
        contactPhone: conversation.contactPhone,
        messageBodies: conversation.messages.map((message) => message.body),
      });
      return matchType === null ? [] : [{ conversation, matchType }];
    })
    .slice(0, 100)
    .map(({ conversation, matchType }) => {
      const lastMessage = conversation.messages[0];

      return {
        id: conversation.id,
        conversationId: conversation.id,
        contactName: canReadContact ? conversation.contactName : null,
        contactPhone: canReadContact ? conversation.contactPhone : null,
        sourceId: canReadContact ? conversation.sourceId : null,
        channel: conversation.channel,
        lastMessageAt: conversation.lastMessageAt,
        unreadCount: conversation.unreadCount,
        lastMessage: lastMessage
          ? {
              body: lastMessage.body,
              direction: lastMessage.direction,
              timestamp: lastMessage.timestamp,
            }
          : null,
        workflow: {
          status: conversation.status,
          assigneeId: conversation.assigneeId,
          priority: conversation.priority,
          labels: parseLabels(conversation.labels),
          snoozedUntil: conversation.snoozedUntil,
          waitingSince: conversation.waitingSince,
          firstReplyAt: conversation.firstReplyAt,
        },
        matchType,
        fieldAccess: { contact: canReadContact },
      };
    });

  return NextResponse.json({ results });
}, "GET /api/conversations/search");
