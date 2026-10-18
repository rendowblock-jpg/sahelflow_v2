import "server-only";

import { Prisma } from "@prisma/client";
import { z } from "zod";

import type { ServiceContext } from "@/lib/data/service-base";
import { ConflictError, SahelFlowError } from "@/types/errors";
import { deterministicWhatsAppMessageId } from "../../../sidecars/whatsapp/send-receipts";
import { sidecar } from "./sidecar-client";
import { messageText, normalizeWhatsAppMessageContent } from "./types";

/** The envelope the sidecar spools for a message the seller sent (from the phone, or echoed from SahelFlow). */
export const phoneOutboundSchema = z.object({
  spoolId: z.string().regex(/^[0-9a-f]{64}$/),
  accountId: z.string().trim().min(1).max(256),
  receivedAt: z.string().datetime({ offset: true }),
  message: z.object({
    key: z.object({
      remoteJid: z.string().trim().min(1).max(256),
      fromMe: z.literal(true),
      id: z.string().trim().min(1).max(256),
      participant: z.string().trim().min(1).max(256).optional(),
    }),
    message: z.record(z.string(), z.unknown()),
    messageTimestamp: z.number().int().nonnegative(),
    pushName: z.string().trim().max(256).optional(),
  }),
});

type PhoneOutboundContext = ServiceContext & {
  readonly whatsAppProviderAccountId?: string;
};

export interface PersistPhoneOutboundResult {
  messageId: string;
  created: boolean;
  replayed: boolean;
}

export function isWhatsAppPhoneOutboundEnvelope(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const message = (value as { message?: { key?: { fromMe?: unknown } } }).message;
  return message?.key?.fromMe === true;
}

function isIndividualChatJid(jid: string): boolean {
  return jid.endsWith("@s.whatsapp.net") || /^[1-9]\d{0,19}@lid$/.test(jid);
}

function messageKind(payload: Record<string, unknown>): string {
  if (payload.conversation || payload.extendedTextMessage) return "text";
  if (payload.imageMessage) return "image";
  if (payload.videoMessage) return "video";
  if (payload.audioMessage) return "audio";
  if (payload.documentMessage) return "document";
  if (payload.stickerMessage) return "sticker";
  if (payload.locationMessage || payload.liveLocationMessage) return "location";
  if (payload.contactMessage || payload.contactsArrayMessage) return "contact";
  return "text";
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

async function resolveProviderAccountId(
  context: PhoneOutboundContext,
): Promise<string> {
  if (context.whatsAppProviderAccountId) return context.whatsAppProviderAccountId;
  try {
    const status = await sidecar.status();
    if (status.status !== "connected" || !status.user?.id) {
      throw new SahelFlowError(
        "WhatsApp account identity is unavailable",
        "WHATSAPP_ACCOUNT_UNAVAILABLE",
        409,
      );
    }
    return status.user.id;
  } catch (error) {
    if (error instanceof SahelFlowError) throw error;
    throw new SahelFlowError(
      "WhatsApp account identity could not be verified",
      "WHATSAPP_ACCOUNT_UNAVAILABLE",
      503,
    );
  }
}

async function findExistingOutbound(
  context: PhoneOutboundContext,
  providerMessageId: string,
): Promise<string | null> {
  const bound = await context.prisma.whatsAppOutboundEffect.findUnique({
    where: { providerMessageId },
    select: { messageId: true },
  });
  if (bound) return bound.messageId;

  const row = await context.prisma.message.findUnique({
    where: { id: providerMessageId },
    select: { id: true },
  });
  if (row) return row.id;

  if (!/^[0-9A-F]{20}$/.test(providerMessageId)) return null;
  const unbound = await context.prisma.whatsAppOutboundEffect.findMany({
    where: { providerMessageId: null },
    orderBy: { createdAt: "desc" },
    take: 1_000,
    select: { effectKey: true, messageId: true },
  });
  const match = unbound.find(
    (effect) =>
      deterministicWhatsAppMessageId(effect.effectKey) === providerMessageId,
  );
  return match?.messageId ?? null;
}

/**
 * Persist one fromMe stanza the seller sent from their phone.
 *
 * The row is outbound in the same chat and keyed by the provider id, so a
 * replay (and an app send that already owns that id) cannot create a second
 * message or an inbound copy.
 */
export async function persistWhatsAppPhoneOutbound(
  context: PhoneOutboundContext,
  rawInput: unknown,
): Promise<PersistPhoneOutboundResult> {
  const input = phoneOutboundSchema.parse(rawInput);
  const jid = input.message.key.remoteJid;
  if (!isIndividualChatJid(jid)) {
    throw new SahelFlowError(
      "Phone-sent WhatsApp messages must be individual chats",
      "VALIDATION_ERROR",
      400,
    );
  }
  const expectedAccountId = await resolveProviderAccountId(context);
  if (input.accountId !== expectedAccountId) {
    throw new ConflictError(
      "WhatsApp phone message belongs to a different paired account",
    );
  }

  const providerMessageId = input.message.key.id;
  const existing = await findExistingOutbound(context, providerMessageId);
  if (existing) {
    return { messageId: existing, created: false, replayed: true };
  }

  const content = normalizeWhatsAppMessageContent(input.message.message);
  const body = Array.from(messageText(content)).slice(0, 4000).join("");
  const timestamp = new Date(input.message.messageTimestamp * 1_000);
  const contactPhone = jid.endsWith("@s.whatsapp.net")
    ? jid.slice(0, jid.indexOf("@"))
    : null;
  const contactName = input.message.pushName?.trim() || contactPhone || jid;

  try {
    await context.prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.upsert({
        where: { channel_sourceId: { channel: "whatsapp", sourceId: jid } },
        create: {
          channel: "whatsapp",
          contactName,
          contactPhone,
          sourceId: jid,
          lastMessageAt: timestamp,
          unreadCount: 0,
          status: "open",
        },
        update: {},
        select: { id: true },
      });
      await tx.conversation.updateMany({
        where: {
          id: conversation.id,
          OR: [{ lastMessageAt: null }, { lastMessageAt: { lt: timestamp } }],
        },
        data: { lastMessageAt: timestamp },
      });
      await tx.message.create({
        data: {
          id: providerMessageId,
          conversationId: conversation.id,
          body,
          direction: "outbound",
          timestamp,
          deliveryStatus: "sent",
          messageType: messageKind(content as Record<string, unknown>),
        },
      });
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const raced = await findExistingOutbound(context, providerMessageId);
    if (!raced) throw error;
    return { messageId: raced, created: false, replayed: true };
  }

  return { messageId: providerMessageId, created: true, replayed: false };
}
