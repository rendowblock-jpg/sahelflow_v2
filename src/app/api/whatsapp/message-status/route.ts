import { readFileSync } from "node:fs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { logAudit } from "@/lib/audit";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { constantTimeEqual } from "@/lib/auth/constant-time";
import { db, shopContext } from "@/lib/db";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

const deliveryStatusSchema = z.enum([
  "sending",
  "sent",
  "delivered",
  "read",
  "failed",
]);
type DeliveryStatus = z.infer<typeof deliveryStatusSchema>;

const statusSchema = z.object({
  waMessageId: z.string().min(1).max(256),
  jid: z.string().min(1).max(256),
  fromMe: z.boolean().optional().default(true),
  deliveryStatus: deliveryStatusSchema,
  error: z.string().max(2000).optional(),
});

const DELIVERY_RANK: Record<Exclude<DeliveryStatus, "failed">, number> = {
  sending: 0,
  sent: 1,
  delivered: 2,
  read: 3,
};

function shouldAdvanceDeliveryStatus(
  current: string | null,
  next: DeliveryStatus,
): boolean {
  if (next === "failed") return current !== "failed";
  if (current === "failed") return false;
  const currentRank =
    current && current in DELIVERY_RANK
      ? DELIVERY_RANK[current as keyof typeof DELIVERY_RANK]
      : -1;
  return DELIVERY_RANK[next] > currentRank;
}

function resolveExpectedRestToken(): string | undefined {
  const fromEnv = env.sidecarToken;
  if (fromEnv && fromEnv.length >= 16) return fromEnv;
  try {
    const fromFile = readFileSync(env.sidecarTokenFile, "utf8").trim();
    if (fromFile.length >= 16) return fromFile;
  } catch {
    // Sidecar may not be ready.
  }
  return undefined;
}

function authenticateSidecar(request: NextRequest): boolean {
  const match = /^Bearer\s+(.+)$/i.exec(
    request.headers.get("authorization") ?? "",
  );
  const expected = resolveExpectedRestToken();
  return Boolean(
    match?.[1] && expected && constantTimeEqual(match[1], expected),
  );
}

async function updateMessageStatus(
  messageId: string,
  deliveryStatus: DeliveryStatus,
): Promise<boolean> {
  const message = await db.message.findUnique({
    where: { id: messageId },
    select: { deliveryStatus: true },
  });
  if (!message || !shouldAdvanceDeliveryStatus(message.deliveryStatus, deliveryStatus)) {
    return false;
  }
  await db.message.update({
    where: { id: messageId },
    data: { deliveryStatus },
  });
  return true;
}

export const POST = withErrorHandler(async (request: NextRequest) => {
  if (!authenticateSidecar(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const input = statusSchema.parse(await request.json());
  const context = { prisma: db, shop: shopContext };
  const isFailure = input.deliveryStatus === "failed" || Boolean(input.error);

  let updatedMessageId: string | null = null;
  const exact = await db.whatsAppOutboundEffect.findUnique({
    where: { providerMessageId: input.waMessageId },
    select: { messageId: true },
  });
  if (exact) {
    if (await updateMessageStatus(exact.messageId, input.deliveryStatus)) {
      updatedMessageId = exact.messageId;
    }
  } else {
    // Compatibility-only fallback for legacy sends without a durable effect row.
    const conversation = await db.conversation.findFirst({
      where: { channel: "whatsapp", sourceId: input.jid },
      select: { id: true },
    });
    if (conversation) {
      const candidates = await db.message.findMany({
        where: {
          conversationId: conversation.id,
          direction: "outbound",
          deliveryStatus: { in: ["sending", "sent"] },
          timestamp: { gte: new Date(Date.now() - 10 * 60_000) },
        },
        orderBy: { timestamp: "desc" },
        take: 10,
        select: { id: true },
      });
      const durable = candidates.length
        ? await db.whatsAppOutboundEffect.findMany({
            where: { messageId: { in: candidates.map((message) => message.id) } },
            select: { messageId: true },
          })
        : [];
      const durableIds = new Set(durable.map((effect) => effect.messageId));
      const legacy = candidates.find((message) => !durableIds.has(message.id));
      if (
        legacy &&
        (await updateMessageStatus(legacy.id, input.deliveryStatus))
      ) {
        updatedMessageId = legacy.id;
      }
    }
  }

  if (isFailure) {
    await logAudit(context, {
      action: "whatsapp.message.failed",
      entity: updatedMessageId ? "message" : "whatsapp",
      entityId: updatedMessageId ?? undefined,
      actor: "system:whatsapp-sidecar",
      metadata: {
        deliveryStatus: input.deliveryStatus,
        errorCode: input.error ? "WHATSAPP_DELIVERY_FAILURE" : null,
        messageRowUpdated: updatedMessageId !== null,
      },
    });
  } else if (updatedMessageId) {
    await logAudit(context, {
      action: "whatsapp.message.status_changed",
      entity: "message",
      entityId: updatedMessageId,
      actor: "system:whatsapp-sidecar",
      metadata: { deliveryStatus: input.deliveryStatus },
    });
  }

  return NextResponse.json({ ok: true, updated: updatedMessageId !== null });
}, "POST /api/whatsapp/message-status");
