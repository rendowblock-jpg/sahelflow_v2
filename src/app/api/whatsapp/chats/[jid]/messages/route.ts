import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { getBusinessEnvelopeKey } from "@/lib/business-truth/envelope-key";
import { db, shopContext } from "@/lib/db";
import {
  assertTrustedAction,
  requireTrustedAction,
} from "@/lib/identity/authorization";
import { WHATSAPP_MEDIA_FETCH_EFFECT_TYPE } from "@/lib/whatsapp/media-fetch-contract";
import { projectInboxLocalMedia } from "@/lib/whatsapp/media-status-projection";
import {
  sidecar,
  SidecarRequestError,
  SidecarUnavailableError,
} from "@/lib/whatsapp/sidecar-client";
import { openWhatsAppMessageAttachmentWithKey } from "@/lib/whatsapp/message-attachments";
import type {
  IncomingMessage,
  ProjectedWhatsAppAttachment,
} from "@/lib/whatsapp/types";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ jid: string }> };

const BINARY_MEDIA_TYPES = new Set([
  "image",
  "video",
  "audio",
  "document",
  "sticker",
]);

function isOutboundDirection(direction: string): boolean {
  return direction === "outbound" || direction === "outgoing";
}

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
            attachments: true,
            quotedMessageId: true,
          },
        },
      },
    });

    const rows = conversation?.messages ?? [];
    const messageIds = rows.map((message) => message.id);

    // Quoted-reply previews (#317): resolve quote targets that are outside the
    // fetched window so the thread always renders honest visible context.
    const quotedPreviewById = new Map<
      string,
      { fromMe: boolean; preview: string; messageType: string | null }
    >();
    const inWindowIds = new Set(messageIds);
    const missingQuotedIds = Array.from(
      new Set(
        rows
          .map((message) => message.quotedMessageId)
          .filter(
            (id): id is string =>
              Boolean(id) && !inWindowIds.has(id as string),
          ),
      ),
    ).slice(0, 100);
    if (missingQuotedIds.length) {
      const quotedRows = await db.message.findMany({
        where: { id: { in: missingQuotedIds } },
        select: {
          id: true,
          body: true,
          direction: true,
          messageType: true,
        },
      });
      for (const row of quotedRows) {
        quotedPreviewById.set(row.id, {
          fromMe: isOutboundDirection(row.direction),
          preview: Array.from(row.body).slice(0, 200).join(""),
          messageType: row.messageType,
        });
      }
    }
    for (const row of rows) {
      if (!row.quotedMessageId || quotedPreviewById.has(row.quotedMessageId)) {
        continue;
      }
      const target = rows.find(
        (message) => message.id === row.quotedMessageId,
      );
      if (target) {
        quotedPreviewById.set(row.quotedMessageId, {
          fromMe: isOutboundDirection(target.direction),
          preview: Array.from(target.body).slice(0, 200).join(""),
          messageType: target.messageType,
        });
      }
    }

    const outboundIds = rows
      .filter((message) => isOutboundDirection(message.direction))
      .map((message) => message.id);
    const mediaEffectKeys = rows
      .filter(
        (message) =>
          !isOutboundDirection(message.direction) &&
          BINARY_MEDIA_TYPES.has(message.messageType),
      )
      .map((message) => `whatsapp-media-fetch:${message.id}`);
    const [effects, inboundEvents, mediaIntents] = await Promise.all([
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
      mediaEffectKeys.length
        ? db.outboxIntent.findMany({
            where: {
              effectKey: { in: mediaEffectKeys },
              effectType: WHATSAPP_MEDIA_FETCH_EFFECT_TYPE,
            },
            select: {
              effectKey: true,
              status: true,
              outcomeState: true,
            },
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
    const mediaIntentByKey = new Map(
      mediaIntents.map((intent) => [intent.effectKey, intent]),
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

    const attachmentKey = rows.some((message) => message.attachments)
      ? await getBusinessEnvelopeKey({ prisma: db, shop: shopContext })
      : null;
    let messages: Array<IncomingMessage & { messageType?: string }>;
    try {
      messages = rows.map((message) => {
        const fromMe = isOutboundDirection(message.direction);
        const effect = fromMe ? effectByMessage.get(message.id) : undefined;
        const intent = effect ? intentByKey.get(effect.effectKey) : undefined;
        const effectState = intent
          ? intent.status === "failed" && intent.outcomeState === "ambiguous"
            ? "ambiguous"
            : intent.status
          : undefined;
        const openedAttachment =
          attachmentKey && message.attachments
            ? openWhatsAppMessageAttachmentWithKey(
                message.id,
                message.attachments,
                attachmentKey,
              )
            : null;
        let attachment: ProjectedWhatsAppAttachment | null = openedAttachment;
        if (openedAttachment && BINARY_MEDIA_TYPES.has(openedAttachment.kind)) {
          if (
            fromMe &&
            (openedAttachment.kind === "image" ||
              openedAttachment.kind === "video")
          ) {
            // Outbound media bytes are already canonical encrypted local state
            // before provider dispatch, so local preview/download stays truthful
            // even while delivery is queued, retrying or failed.
            attachment = {
              ...openedAttachment,
              localMedia: projectInboxLocalMedia(
                message.id,
                "succeeded",
                "receipt",
              ),
            };
          } else if (!fromMe) {
            const mediaIntent = mediaIntentByKey.get(
              `whatsapp-media-fetch:${message.id}`,
            );
            attachment = {
              ...openedAttachment,
              localMedia: projectInboxLocalMedia(
                message.id,
                mediaIntent?.status,
                mediaIntent?.outcomeState,
              ),
            };
          }
        }
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
          attachment,
          quotedMessageId: message.quotedMessageId,
          quoted: message.quotedMessageId
            ? quotedPreviewById.get(message.quotedMessageId) ?? null
            : null,
        };
      });
    } finally {
      attachmentKey?.fill(0);
    }
    messages.reverse();

    let sidecarReachable = true;
    try {
      await sidecar.status();
    } catch (error) {
      if (
        !(error instanceof SidecarUnavailableError) &&
        !(error instanceof SidecarRequestError)
      ) {
        throw error;
      }
      sidecarReachable = false;
    }

    return NextResponse.json({ jid, messages, sidecarReachable });
  },
  "GET /api/whatsapp/chats/[jid]/messages",
);
