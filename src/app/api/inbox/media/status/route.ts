import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { db } from "@/lib/db";
import {
  assertTrustedAction,
  requireTrustedAction,
} from "@/lib/identity/authorization";
import { WHATSAPP_MEDIA_FETCH_EFFECT_TYPE } from "@/lib/whatsapp/media-fetch-contract";
import { projectInboxLocalMedia } from "@/lib/whatsapp/media-status-projection";

export const dynamic = "force-dynamic";

const MAX_PENDING_MEDIA_BATCH = 200;
const BINARY_MEDIA_TYPES = new Set([
  "image",
  "video",
  "audio",
  "document",
  "sticker",
]);

const requestSchema = z.object({
  messageIds: z
    .array(
      z
        .string()
        .trim()
        .min(1)
        .max(256)
        .refine((value) => !/[\u0000-\u001f\u007f]/.test(value)),
    )
    .min(1)
    .max(MAX_PENDING_MEDIA_BATCH),
});

export const POST = withErrorHandler(
  async (request: NextRequest) => {
    const actorContext = await requireTrustedAction("conversations.read");
    assertTrustedAction(actorContext, "customers.contact.read", {
      shopId: actorContext.shop.shopId,
    });

    let parsedBody: unknown;
    try {
      parsedBody = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid media status request" }, { status: 400 });
    }
    const parsed = requestSchema.safeParse(parsedBody);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid media status request" }, { status: 400 });
    }

    const messageIds = [...new Set(parsed.data.messageIds)];
    const messages = await db.message.findMany({
      where: { id: { in: messageIds } },
      select: {
        id: true,
        direction: true,
        messageType: true,
        attachments: true,
      },
    });
    const canonicalIds = messages.flatMap((message) =>
      message.direction === "inbound" &&
      message.attachments &&
      BINARY_MEDIA_TYPES.has(message.messageType)
        ? [message.id]
        : [],
    );
    const effectKeys = canonicalIds.map(
      (messageId) => `whatsapp-media-fetch:${messageId}`,
    );
    const intents = effectKeys.length
      ? await db.outboxIntent.findMany({
          where: {
            effectKey: { in: effectKeys },
            effectType: WHATSAPP_MEDIA_FETCH_EFFECT_TYPE,
          },
          select: {
            effectKey: true,
            status: true,
            outcomeState: true,
          },
        })
      : [];
    const intentByKey = new Map(
      intents.map((intent) => [intent.effectKey, intent]),
    );
    const media = Object.fromEntries(
      canonicalIds.map((messageId) => {
        const intent = intentByKey.get(`whatsapp-media-fetch:${messageId}`);
        return [
          messageId,
          projectInboxLocalMedia(
            messageId,
            intent?.status,
            intent?.outcomeState,
          ),
        ];
      }),
    );
    const canonicalSet = new Set(canonicalIds);
    const missing = messageIds.filter((messageId) => !canonicalSet.has(messageId));

    return NextResponse.json(
      { media, missing },
      {
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
          "Cross-Origin-Resource-Policy": "same-origin",
          Pragma: "no-cache",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  },
  "POST /api/inbox/media/status",
);
