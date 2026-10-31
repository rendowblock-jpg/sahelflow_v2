import { z } from "zod";
import { processWhatsAppEffect, queueWhatsAppText } from "@/lib/whatsapp/durable-send";
import { NotFoundError, SahelFlowError } from "@/types/errors";

/**
 * A reply typed on the phone. It leaves through the same queue, and so the
 * same WhatsApp safety rules, as a reply typed on the PC, to the customer of
 * THAT conversation. The payload carries no number: it is read from the
 * conversation on this computer, never from the phone.
 */
type ReplyContext = Parameters<typeof queueWhatsAppText>[0];

export const phoneReplyPayload = z.object({
  conversationId: z.string().min(8).max(128),
  text: z.string().trim().min(1).max(4000),
  /** The last message the phone showed. Something sent from the PC after it blocks the reply. */
  lastSeenMessageId: z.string().min(1).max(128).optional(),
  /** "Send anyway": skip the ALREADY_ANSWERED check. */
  force: z.boolean().optional(),
}).strict();

export async function queuePhoneReply(
  context: ReplyContext,
  input: Readonly<{ clientMessageId: string; payload: unknown }>,
) {
  const clientMessageId = z.string().uuid().parse(input.clientMessageId);
  const data = phoneReplyPayload.parse(input.payload);
  const conversation = await context.prisma.conversation.findFirst({
    where: { id: data.conversationId, channel: "whatsapp" },
    select: { id: true, sourceId: true },
  });
  // The address is the conversation's own (the inbox sends the same value),
  // so a chat whose number is hidden still has one.
  if (!conversation || !conversation.sourceId) {
    throw new NotFoundError("Conversation", data.conversationId);
  }
  if (data.lastSeenMessageId && data.force !== true) {
    const seen = await context.prisma.message.findFirst({
      where: { id: data.lastSeenMessageId, conversationId: conversation.id },
      select: { timestamp: true },
    });
    if (!seen) {
      throw new SahelFlowError("The conversation changed on this computer", "ENTITY_CHANGED", 409);
    }
    const newer = await context.prisma.message.findFirst({
      where: {
        conversationId: conversation.id,
        direction: "outbound",
        timestamp: { gt: seen.timestamp },
      },
      select: { id: true },
    });
    if (newer) {
      throw new SahelFlowError("Already answered from this computer", "ALREADY_ANSWERED", 409);
    }
  }
  const queued = await queueWhatsAppText(context, {
    clientMessageId,
    to: conversation.sourceId,
    text: data.text,
    conversationId: conversation.id,
  });
  void processWhatsAppEffect(context, queued.effectKey).catch(() => {
    // Queued/retrying/ambiguous state stays authoritative, as in the send route.
  });
  return Object.freeze({
    messageId: queued.messageId,
    effectKey: queued.effectKey,
    state: "queued" as const,
    ...(queued.guard ? { guarded: true } : {}),
  });
}
