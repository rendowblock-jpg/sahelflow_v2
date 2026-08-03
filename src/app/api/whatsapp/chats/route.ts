import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { db } from "@/lib/db";
import {
  assertTrustedAction,
  requireTrustedAction,
} from "@/lib/identity/authorization";
import { projectTrustedActorActions } from "@/lib/identity/conversation-projection";
import {
  sidecar,
  SidecarUnavailableError,
} from "@/lib/whatsapp/sidecar-client";
import type { SidecarChat } from "@/lib/whatsapp/types";

export const dynamic = "force-dynamic";

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

  // The shop database is the inbox authority. Baileys history is a transient
  // transport cache and must never add, remove or reorder canonical chats.
  const conversations = await db.conversation.findMany({
    where: { channel: "whatsapp", sourceId: { not: null } },
    orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }],
    take: limit,
    select: {
      sourceId: true,
      contactName: true,
      unreadCount: true,
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

  const chats: SidecarChat[] = conversations.flatMap((conversation) => {
    if (!conversation.sourceId) return [];
    const last = conversation.messages[0];
    return [
      {
        jid: conversation.sourceId,
        name: conversation.contactName || conversation.sourceId,
        unread: conversation.unreadCount,
        lastMessage: last
          ? {
              text: last.body,
              timestamp: Math.floor(last.timestamp.getTime() / 1_000),
              fromMe: last.direction === "outbound",
            }
          : undefined,
      },
    ];
  });

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
    authority: { allowedActions: projectTrustedActorActions(actorContext) },
  });
}, "GET /api/whatsapp/chats");
