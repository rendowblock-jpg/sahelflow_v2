import { readFileSync } from "node:fs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { logAudit } from "@/lib/audit";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { constantTimeEqual } from "@/lib/auth/constant-time";
import { db, shopContext } from "@/lib/db";
import { env } from "@/lib/env";
import { deterministicWhatsAppMessageId } from "../../../../../sidecars/whatsapp/send-receipts";

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

function allowedPriorStates(next: DeliveryStatus): Array<string | null> {
  switch (next) {
    case "sending":
      return [null];
    case "sent":
      return [null, "sending"];
    case "delivered":
      return [null, "sending", "sent"];
    case "read":
      return [null, "sending", "sent", "delivered"];
    case "failed":
      return [null, "sending", "sent"];
  }
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
  const prior = allowedPriorStates(deliveryStatus);
  const updated = await db.message.updateMany({
    where: {
      id: messageId,
      OR: [
        ...(prior.includes(null) ? [{ deliveryStatus: null }] : []),
        {
          deliveryStatus: {
            in: prior.filter((value): value is string => value !== null),
          },
        },
      ],
    },
    data: { deliveryStatus },
  });
  return updated.count === 1;
}

async function findOrBindDurableEffect(providerMessageId: string): Promise<{
  effectKey: string;
  messageId: string;
} | null> {
  const exact = await db.whatsAppOutboundEffect.findUnique({
    where: { providerMessageId },
    select: { effectKey: true, messageId: true },
  });
  if (exact) return exact;

  // Durable sends use a deterministic provider ID. A fast callback can arrive
  // before markSucceeded binds that ID locally, so recompute the exact mapping
  // instead of discarding or approximately correlating the callback.
  if (!/^[0-9A-F]{20}$/.test(providerMessageId)) return null;
  const unbound = await db.whatsAppOutboundEffect.findMany({
    where: { providerMessageId: null },
    orderBy: { createdAt: "desc" },
    take: 1_000,
    select: { effectKey: true, messageId: true },
  });
  const match = unbound.find(
    (effect) =>
      deterministicWhatsAppMessageId(effect.effectKey) === providerMessageId,
  );
  if (!match) return null;

  const bound = await db.whatsAppOutboundEffect.updateMany({
    where: {
      effectKey: match.effectKey,
      messageId: match.messageId,
      providerMessageId: null,
    },
    data: { providerMessageId },
  });
  if (bound.count === 1) return match;

  return db.whatsAppOutboundEffect.findUnique({
    where: { providerMessageId },
    select: { effectKey: true, messageId: true },
  });
}

export const POST = withErrorHandler(async (request: NextRequest) => {
  if (!authenticateSidecar(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const input = statusSchema.parse(await request.json());
  const context = { prisma: db, shop: shopContext };
  const isFailure = input.deliveryStatus === "failed" || Boolean(input.error);

  let updatedMessageId: string | null = null;
  const durable = await findOrBindDurableEffect(input.waMessageId);
  if (durable) {
    if (await updateMessageStatus(durable.messageId, input.deliveryStatus)) {
      updatedMessageId = durable.messageId;
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
      const mapped = candidates.length
        ? await db.whatsAppOutboundEffect.findMany({
            where: { messageId: { in: candidates.map((message) => message.id) } },
            select: { messageId: true },
          })
        : [];
      const durableIds = new Set(mapped.map((effect) => effect.messageId));
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
