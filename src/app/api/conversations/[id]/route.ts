import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { getBusinessEnvelopeKey } from "@/lib/business-truth/envelope-key";
import { resolveConversationIdForRead } from "@/lib/data/conversation-service";
import { db, shopContext } from "@/lib/db";
import { requireTrustedAction } from "@/lib/identity/authorization";
import { projectConversationForTrustedActor } from "@/lib/identity/conversation-projection";
import { normalizeInboxMessageDirection } from "@/lib/inbox/message-direction";
import {
  openWhatsAppMessageAttachmentWithKey,
  projectWhatsAppMessageAttachmentForContactAccess,
} from "@/lib/whatsapp/message-attachments";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ id: string }> };

/**
 * Bounded message window (audit 7-a F6): the nested include previously loaded
 * the entire message history of the conversation. The chat surface only needs
 * the most recent window — the same 500-message ceiling the WhatsApp message
 * route enforces.
 */
const CONVERSATION_MESSAGE_HISTORY_LIMIT = 500;

/**
 * GET /api/conversations/[id] — exact-shop workflow and persisted message
 * projection. This read never creates a live-JID row or clears unread state;
 * those are explicit authorized mutations.
 */
export const GET = withErrorHandler(
  async (_request: NextRequest, { params }: RouteContext) => {
    const actorContext = await requireTrustedAction("conversations.read");
    const { id: rawId } = await params;
    const context = { prisma: db, shop: shopContext };
    const conversationId = await resolveConversationIdForRead(context, rawId);
    if (!conversationId) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 },
      );
    }
    const conversation = await db.conversation.findUnique({
      where: { id: conversationId },
      include: {
        messages: {
          orderBy: { timestamp: "desc" },
          take: CONVERSATION_MESSAGE_HISTORY_LIMIT,
        },
      },
    });
    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 },
      );
    }
    // The bounded window is fetched newest-first; restore chronological order.
    conversation.messages.reverse();

    const projected = projectConversationForTrustedActor(
      conversation,
      actorContext,
    );
    const attachmentKey = projected.messages.some(
      (message) => message.attachments,
    )
      ? await getBusinessEnvelopeKey(context)
      : null;
    const messages = (() => {
      try {
        return projected.messages.map((message) => {
          const attachment =
            attachmentKey && message.attachments
              ? openWhatsAppMessageAttachmentWithKey(
                  message.id,
                  message.attachments,
                  attachmentKey,
                )
              : null;
          return {
            ...message,
            direction: normalizeInboxMessageDirection(message.direction),
            attachment: projectWhatsAppMessageAttachmentForContactAccess(
              attachment,
              projected.fieldAccess.contact,
            ),
            attachments: undefined,
          };
        });
      } finally {
        attachmentKey?.fill(0);
      }
    })();

    return NextResponse.json({
      conversation: {
        ...projected,
        messages,
      },
      source: "persisted",
    });
  },
  "GET /api/conversations/[id]",
);
