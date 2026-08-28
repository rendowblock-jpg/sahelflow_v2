import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { db, shopContext } from "@/lib/db";
import {
  assertTrustedAction,
  requireTrustedAction,
} from "@/lib/identity/authorization";
import {
  openInboxWhatsAppThumbnail,
  openPreparedInboxWhatsAppMedia,
  prepareInboxWhatsAppMedia,
} from "@/lib/whatsapp/media-read-service";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

interface ByteRange {
  start: number;
  end: number;
}

function invalidRange(total: number): NextResponse {
  return new NextResponse(null, {
    status: 416,
    headers: {
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Range": `bytes */${total}`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function parseRange(value: string | null, total: number): ByteRange | null | "invalid" {
  if (!value) return null;
  if (value.includes(",")) return "invalid";
  const match = /^bytes=(\d*)-(\d*)$/i.exec(value.trim());
  if (!match) return "invalid";
  const rawStart = match[1] ?? "";
  const rawEnd = match[2] ?? "";
  if (!rawStart && !rawEnd) return "invalid";

  if (!rawStart) {
    const suffix = Number(rawEnd);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return "invalid";
    return {
      start: Math.max(0, total - suffix),
      end: total - 1,
    };
  }

  const start = Number(rawStart);
  if (!Number.isSafeInteger(start) || start < 0 || start >= total) {
    return "invalid";
  }
  const requestedEnd = rawEnd ? Number(rawEnd) : total - 1;
  if (!Number.isSafeInteger(requestedEnd) || requestedEnd < start) {
    return "invalid";
  }
  return { start, end: Math.min(requestedEnd, total - 1) };
}

function contentDisposition(fileName: string, attachment: boolean): string {
  const fallback =
    fileName
      .normalize("NFKD")
      .replace(/[^\x20-\x7E]/g, "_")
      .replace(/["\\]/g, "_")
      .trim()
      .slice(0, 160) || "whatsapp-media";
  return `${attachment ? "attachment" : "inline"}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export const GET = withErrorHandler(
  async (request: NextRequest, { params }: RouteContext) => {
    const actorContext = await requireTrustedAction("conversations.read");
    assertTrustedAction(actorContext, "customers.contact.read", {
      shopId: actorContext.shop.shopId,
    });

    const { id: rawId } = await params;
    const messageId = decodeURIComponent(rawId).trim();
    if (!messageId || messageId.length > 256 || /[\u0000-\u001f\u007f]/.test(messageId)) {
      return NextResponse.json({ error: "Media not found" }, { status: 404 });
    }

    const context = { prisma: db, shop: shopContext };

    // Derived bounded thumbnail variant (#317): no ranges, no download form,
    // a tight image/jpeg response and the same no-store discipline as the
    // canonical read path. Absent thumbnails 404 so the UI falls back.
    if (request.nextUrl.searchParams.get("variant") === "thumbnail") {
      const opened = await openInboxWhatsAppThumbnail(context, messageId);
      try {
        const responseBody = Uint8Array.from(opened.bytes);
        return new NextResponse(responseBody, {
          status: 200,
          headers: new Headers({
            "Cache-Control": "private, no-store, max-age=0",
            "Content-Length": String(responseBody.byteLength),
            "Content-Type": "image/jpeg",
            "Cross-Origin-Resource-Policy": "same-origin",
            Pragma: "no-cache",
            "X-Content-Type-Options": "nosniff",
          }),
        });
      } finally {
        opened.bytes.fill(0);
      }
    }

    const prepared = await prepareInboxWhatsAppMedia(context, messageId);
    const range = parseRange(request.headers.get("range"), prepared.sizeBytes);
    if (range === "invalid") return invalidRange(prepared.sizeBytes);

    const opened = await openPreparedInboxWhatsAppMedia(
      context,
      prepared,
      range ?? undefined,
      request.signal,
    );
    try {
      const responseBody = Uint8Array.from(opened.bytes);
      const download =
        request.nextUrl.searchParams.get("download") === "1" ||
        opened.kind === "document";
      const headers = new Headers({
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Disposition": contentDisposition(opened.fileName, download),
        "Content-Length": String(responseBody.byteLength),
        "Content-Type": opened.mediaType,
        "Cross-Origin-Resource-Policy": "same-origin",
        Pragma: "no-cache",
        Vary: "Range",
        "X-Content-Type-Options": "nosniff",
      });
      if (range) {
        headers.set(
          "Content-Range",
          `bytes ${range.start}-${range.end}/${opened.sizeBytes}`,
        );
      }
      return new NextResponse(responseBody, {
        status: range ? 206 : 200,
        headers,
      });
    } finally {
      opened.bytes.fill(0);
    }
  },
  "GET /api/inbox/media/[id]",
);
