import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { db } from "@/lib/db";
import {
  assertTrustedAction,
  requireTrustedAction,
} from "@/lib/identity/authorization";
import { WHATSAPP_MEDIA_FETCH_EFFECT_TYPE } from "@/lib/whatsapp/media-fetch-contract";
import { projectInboxLocalMedia } from "@/lib/whatsapp/media-status-projection";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const BINARY_MEDIA_TYPES = new Set([
  "image",
  "video",
  "audio",
  "document",
  "sticker",
]);

export const GET = withErrorHandler(
  async (_request: NextRequest, { params }: RouteContext) => {
    const actorContext = await requireTrustedAction("conversations.read");
    assertTrustedAction(actorContext, "customers.contact.read", {
      shopId: actorContext.shop.shopId,
    });

    const { id: rawId } = await params;
    const messageId = decodeURIComponent(rawId).trim();
    if (
      !messageId ||
      messageId.length > 256 ||
      /[\u0000-\u001f\u007f]/.test(messageId)
    ) {
      return NextResponse.json({ error: "Media not found" }, { status: 404 });
    }

    const message = await db.message.findUnique({
      where: { id: messageId },
      select: {
        direction: true,
        messageType: true,
        attachments: true,
      },
    });
    if (
      !message ||
      message.direction !== "inbound" ||
      !message.attachments ||
      !BINARY_MEDIA_TYPES.has(message.messageType)
    ) {
      return NextResponse.json({ error: "Media not found" }, { status: 404 });
    }

    const intent = await db.outboxIntent.findFirst({
      where: {
        effectKey: `whatsapp-media-fetch:${messageId}`,
        effectType: WHATSAPP_MEDIA_FETCH_EFFECT_TYPE,
      },
      select: { status: true, outcomeState: true },
    });
    const localMedia = projectInboxLocalMedia(
      messageId,
      intent?.status,
      intent?.outcomeState,
    );

    return NextResponse.json(
      { localMedia },
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
  "GET /api/inbox/media/[id]/status",
);
