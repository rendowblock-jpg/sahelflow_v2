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

function latestMessage(
  left: SidecarChat["lastMessage"],
  right: SidecarChat["lastMessage"],
): SidecarChat["lastMessage"] {
  if (!left) return right;
  if (!right) return left;
  return right.timestamp > left.timestamp ? right : left;
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

  // Durable queued/failed sends must remain reachable even when Baileys has not
  // rebuilt its in-memory history after an app/sidecar restart.
  const effects = await db.whatsAppOutboundEffect.findMany({
    orderBy: { createdAt: "desc" },
    take: Math.min(limit * 20, 5_000),
    select: { messageId: true },
  });
  const durableMessages = effects.length
    ? await db.message.findMany({
        where: { id: { in: effects.map((effect) => effect.messageId) } },
        orderBy: { timestamp: "desc" },
        select: {
          body: true,
          direction: true,
          timestamp: true,
          conversation: {
            select: {
              sourceId: true,
              contactName: true,
              unreadCount: true,
            },
          },
        },
      })
    : [];

  const durableByJid = new Map<string, SidecarChat>();
  for (const message of durableMessages) {
    const jid = message.conversation.sourceId;
    if (!jid || durableByJid.has(jid)) continue;
    durableByJid.set(jid, {
      jid,
      name: message.conversation.contactName || jid,
      unread: message.conversation.unreadCount,
      lastMessage: {
        text: message.body,
        timestamp: Math.floor(message.timestamp.getTime() / 1_000),
        fromMe: message.direction === "outbound",
      },
    });
  }

  let liveChats: SidecarChat[] = [];
  let sidecarReachable = true;
  try {
    liveChats = (await sidecar.chats(limit)).chats;
  } catch (error) {
    if (!(error instanceof SidecarUnavailableError)) throw error;
    sidecarReachable = false;
  }

  const merged = new Map(durableByJid);
  for (const live of liveChats) {
    const durable = merged.get(live.jid);
    merged.set(
      live.jid,
      durable
        ? {
            ...durable,
            ...live,
            name: live.name || durable.name,
            unread: Math.max(live.unread, durable.unread),
            lastMessage: latestMessage(durable.lastMessage, live.lastMessage),
          }
        : live,
    );
  }

  const chats = [...merged.values()]
    .sort(
      (left, right) =>
        (right.lastMessage?.timestamp ?? 0) -
        (left.lastMessage?.timestamp ?? 0),
    )
    .slice(0, limit);

  return NextResponse.json({
    chats,
    sidecarReachable,
    authority: { allowedActions: projectTrustedActorActions(actorContext) },
  });
}, "GET /api/whatsapp/chats");
