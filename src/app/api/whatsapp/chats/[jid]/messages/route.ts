import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { db } from "@/lib/db";
import { requireTrustedActor } from "@/lib/identity/trusted-actor";
import {
  sidecar,
  SidecarUnavailableError,
} from "@/lib/whatsapp/sidecar-client";
import type { IncomingMessage } from "@/lib/whatsapp/types";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ jid: string }> };

export const GET = withErrorHandler(
  async (request: NextRequest, { params }: RouteContext) => {
    await requireTrustedActor();
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
          where: { direction: "outbound" },
          orderBy: { timestamp: "desc" },
          take: limit,
          select: {
            id: true,
            body: true,
            timestamp: true,
            deliveryStatus: true,
          },
        },
      },
    });

    const messageIds = (conversation?.messages ?? []).map((message) => message.id);
    const effects = messageIds.length
      ? await db.whatsAppOutboundEffect.findMany({
          where: { messageId: { in: messageIds } },
          select: {
            messageId: true,
            effectKey: true,
            providerMessageId: true,
          },
        })
      : [];
    const effectByMessage = new Map(
      effects.map((effect) => [effect.messageId, effect]),
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

    const durable: IncomingMessage[] = (conversation?.messages ?? []).map(
      (message) => {
        const effect = effectByMessage.get(message.id);
        const intent = effect ? intentByKey.get(effect.effectKey) : undefined;
        const effectState = intent
          ? intent.status === "failed" && intent.outcomeState === "ambiguous"
            ? "ambiguous"
            : intent.status
          : undefined;
        return {
          key: {
            remoteJid: jid,
            fromMe: true,
            id: effect?.providerMessageId ?? message.id,
          },
          message: { conversation: message.body },
          messageTimestamp: Math.floor(message.timestamp.getTime() / 1000),
          deliveryStatus: (message.deliveryStatus ??
            "sending") as IncomingMessage["deliveryStatus"],
          effectKey: effect?.effectKey,
          effectState: effectState as IncomingMessage["effectState"],
        };
      },
    );

    let live: IncomingMessage[] = [];
    let sidecarReachable = true;
    try {
      live = (await sidecar.messages(jid, limit)).messages;
    } catch (error) {
      if (!(error instanceof SidecarUnavailableError)) throw error;
      sidecarReachable = false;
    }

    const merged = new Map<string, IncomingMessage>();
    for (const message of live) merged.set(message.key.id, message);
    for (const message of durable) {
      const existing = merged.get(message.key.id);
      merged.set(
        message.key.id,
        existing
          ? {
              ...existing,
              deliveryStatus: message.deliveryStatus,
              effectKey: message.effectKey,
              effectState: message.effectState,
            }
          : message,
      );
    }

    const messages = [...merged.values()]
      .sort((left, right) => left.messageTimestamp - right.messageTimestamp)
      .slice(-limit);
    return NextResponse.json({ jid, messages, sidecarReachable });
  },
  "GET /api/whatsapp/chats/[jid]/messages",
);