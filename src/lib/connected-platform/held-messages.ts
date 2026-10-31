/**
 * Which messages the PC's WhatsApp send guard is HOLDING for the owner, for the phone's "held on your PC" badge.
 *
 * Nothing writes "held" into Message.deliveryStatus. A held send is an OutboxIntent: status "failed", outcome
 * "none", lastErrorCode = the send-guard hold code, one of the five WhatsApp send effect types. That is the rule
 * of isHeldOutboxIntent (whatsapp/held-send.ts) and of the "WhatsApp held" number on Today
 * (phone-today-counts.ts WHATSAPP_HELD_WHERE); this reader asks the database for exactly those rows, so the
 * badges and the number cannot drift apart (held-messages.test.ts pins every shape against both). An approved
 * send leaves "failed"; a discarded one is "dead_letter": neither is held.
 *
 * The intent reaches its message through WhatsAppOutboundEffect (effectKey -> messageId), never through the
 * message text, so two chats that got the same text keep their own badge.
 *
 * Three reads whatever the number of chats. A failing read THROWS: a phone snapshot that says "nothing held"
 * because the lookup failed would be a lie, so the caller keeps its last good snapshot instead.
 */
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { SEND_GUARD_HOLD_ERROR_CODE } from "@/lib/whatsapp/send-guard";
import { HELD_SEND_EFFECT_TYPES } from "./phone-today-counts";

/** The guard holds 6+ chats at a time; more than this is an anomaly. The newest are kept. */
export const HELD_MESSAGES_MAX = 200;

/** The same four conditions as WHATSAPP_HELD_WHERE of phone-today-counts.ts (pinned against it by test). */
const HELD_INTENT_WHERE: Prisma.OutboxIntentWhereInput = {
  status: "failed",
  outcomeState: "none",
  lastErrorCode: SEND_GUARD_HOLD_ERROR_CODE,
  effectType: { in: [...HELD_SEND_EFFECT_TYPES] },
};

export interface HeldLookupClient {
  outboxIntent: {
    findMany(args: {
      where: Prisma.OutboxIntentWhereInput;
      orderBy: Prisma.OutboxIntentOrderByWithRelationInput[];
      take: number;
      select: { effectKey: true };
    }): PromiseLike<ReadonlyArray<{ effectKey: string }>>;
  };
  whatsAppOutboundEffect: {
    findMany(args: {
      where: Prisma.WhatsAppOutboundEffectWhereInput;
      select: { effectKey: true; messageId: true };
    }): PromiseLike<ReadonlyArray<{ effectKey: string; messageId: string }>>;
  };
  message: {
    findMany(args: {
      where: Prisma.MessageWhereInput;
      select: { id: true; conversationId: true };
    }): PromiseLike<ReadonlyArray<{ id: string; conversationId: string }>>;
  };
}

export type HeldMessageLookup = Readonly<{
  /** messageId -> conversationId, for every held message of a live (not archived) conversation. */
  byMessageId: ReadonlyMap<string, string>;
  /** More than HELD_MESSAGES_MAX held sends exist: only the newest were looked up. */
  truncated: boolean;
}>;

export async function readHeldMessageIds(
  client: HeldLookupClient = db as unknown as HeldLookupClient,
  conversationIds?: readonly string[],
): Promise<HeldMessageLookup> {
  const none: HeldMessageLookup = { byMessageId: new Map<string, string>(), truncated: false };
  if (conversationIds && conversationIds.length === 0) return none;
  // One extra row tells "exactly the maximum" from "more than the maximum".
  const intents = await client.outboxIntent.findMany({
    where: HELD_INTENT_WHERE,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: HELD_MESSAGES_MAX + 1,
    select: { effectKey: true },
  });
  const truncated = intents.length > HELD_MESSAGES_MAX;
  const effectKeys = intents.slice(0, HELD_MESSAGES_MAX).map((intent) => intent.effectKey);
  if (effectKeys.length === 0) return none;
  const effects = await client.whatsAppOutboundEffect.findMany({
    where: { effectKey: { in: effectKeys } },
    select: { effectKey: true, messageId: true },
  });
  if (effects.length === 0) return { byMessageId: none.byMessageId, truncated };
  const messages = await client.message.findMany({
    where: {
      id: { in: effects.map((effect) => effect.messageId) },
      // The conversation list never shows an archived chat: its held message has no row to wear the badge.
      conversation: { archivedAt: null },
      ...(conversationIds ? { conversationId: { in: [...conversationIds] } } : {}),
    },
    select: { id: true, conversationId: true },
  });
  const byMessageId = new Map<string, string>();
  for (const message of messages) byMessageId.set(message.id, message.conversationId);
  return { byMessageId, truncated };
}
