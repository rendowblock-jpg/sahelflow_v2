import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { db } from "@/lib/db";
import {
  assertTrustedAction,
  requireTrustedAction,
} from "@/lib/identity/authorization";
import {
  sidecar,
  SidecarUnavailableError,
} from "@/lib/whatsapp/sidecar-client";
import type { IncomingMessage } from "@/lib/whatsapp/types";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ jid: string }> };

export const GET = withErrorHandler(
  async (request: NextRequest, { params }: RouteContext) => {
    const actorContext = await requireTrustedAction("conversations.read");
    assertTrustedAction(actorContext, "customers.contact.read", {
      shopId: actorContext.shop.shopId,
    });
    const { jid: rawJid } = await params;
    const jid = decodeURIComponent(rawJid);
    const requested = Number.parseInt(
      request.nextUrl.searchParams.get("limit") ?? "100",
      10,
    );
    const limit = Number.isFinite(requested)
      ? Math.max(1, Math.min(requested, 500))
      : 100;

    const conversation = await db.conversation.findUnique({
      where: { channel_sourceId: { channel: "whatsapp", sourceId: jid } },
      select: {
        messages: {
          orderBy: { timestamp: "desc" },
          take: limit,
          select: {
            id: true,
            body: true,
            direction: true,
            timestamp: true,
            deliveryStatus: true,
            messageType: true,
          },
        },
      },
    });

    const rows = conversation?.messages ?? [];
    const messageIds = rows.map((message) => message.id);
    const outboundIds = rows
      .filter((message) => message.direction === "outbound")
      .map((message) => message.id);
    const [effects, inboundEvents] = await Promise.all([
      outboundIds.length
        ? db.whatsAppOutboundEffect.findMany({
            where: { messageId: { in: outboundIds } },
            select: {
              messageId: true,
              effectKey: true,
              providerMessageId: true,
            },
          })
        : [],
      messageIds.length
        ? db.providerIngressEvent.findMany({
            where: { messageId: { in: messageIds }, status: "applied" },
            select: { messageId: true, providerEventId: true },
          })
        : [],
    ]);

    const effectByMessage = new Map(
      effects.map((effect) => [effect.messageId, effect]),
    );
    const providerIdByInboundMessage = new Map(
      inboundEvents.flatMap((event) =>
        event.messageId ? [[event.messageId, event.providerEventId] as const] : [],
      ),
    );
    const effectKeys = effects.map((effect) => effect.effectKey);
    const intents = effectKeys.length
      ? await db.outboxIntent.findMany({
          where: { effectKey: { in: effectKeys } },
          select: { effectKey: true, status: true, outcomeState: true },
        })
      : [];
    const intentByKey = new Map(
      intents.map((intent) => [intent.effectKey, intent]),
    );

    const messages: Array<IncomingMessage & { messageType?: string }> = rows
      .map((message) => {
        const fromMe = message.direction === "outbound";
        const effect = fromMe ? effectByMessage.get(message.id) : undefined;
        const intent = effect ? intentByKey.get(effect.effectKey) : undefined;
        const effectState = intent
          ? intent.status === "failed" && intent.outcomeState === "ambiguous"
            ? "ambiguous"
            : intent.status
          : undefined;
        return {
          key: {
            remoteJid: jid,
            fromMe,
            id: fromMe
              ? effect?.providerMessageId ?? message.id
              : providerIdByInboundMessage.get(message.id) ?? message.id,
          },
          message: { conversation: message.body },
          messageTimestamp: Math.floor(message.timestamp.getTime() / 1_000),
          messageType: message.messageType,
          deliveryStatus: fromMe
            ? ((message.deliveryStatus ?? "sending") as IncomingMessage["deliveryStatus"])
            : undefined,
          effectKey: effect?.effectKey,
          effectState: effectState as IncomingMessage["effectState"],
        };
      })
      .reverse();

    let sidecarReachable = true;
    try {
      await sidecar.status();
    } catch (error) {
      if (!(error instanceof SidecarUnavailableError)) throw error;
      sidecarReachable = false;
    }

    return NextResponse.json({ jid, messages, sidecarReachable });
  },
  "GET /api/whatsapp/chats/[jid]/messages",
);
