/**
 * WhatsApp send guard: the I/O shell. It gathers the counts the pure policy
 * needs from rows that are already persisted (so they survive an app restart)
 * using indexed columns only: Message(conversationId, direction, timestamp),
 * Conversation(lastMessageAt), OutboxIntent(effectType, status, nextAttemptAt)
 * and BusinessCommand(commandType, createdAt). No migration, no new table.
 * It never logs a message body or a phone number.
 */
import type { ServiceContext } from "@/lib/data/service-base";
import { logger } from "@/lib/logger";
import {
  WHATSAPP_SEND_GUARD,
  WhatsAppSendGuardError,
  classifySendOrigin,
  evaluateSend,
  normalizeSendText,
  type SendGuardDecision,
  type SendGuardReason,
  type SendOrigin,
  SEND_GUARD_HOLD_ERROR_CODE,
} from "./send-guard";

/** Outbox effect types of durable-send (a test pins them to the real constants). */
export const SEND_GUARD_EFFECT_TYPES = [
  "whatsapp.text.send.v1",
  "whatsapp.image.send.v1",
  "whatsapp.video.send.v1",
  "whatsapp.document.send.v1",
  "whatsapp.voice.send.v1",
] as const;
const QUEUE_COMMAND_TYPES = [
  "whatsapp_message.queue.v1",
  "whatsapp_image.queue.v1",
  "whatsapp_video.queue.v1",
  "whatsapp_document.queue.v1",
  "whatsapp_voice.queue.v1",
] as const;
/** Only a send this recent can still be inside the 3 s pacing gap. */
const PACING_LOOKBACK_SECONDS = 30;
/** Bound of the same-text scan; the hourly limits keep real volume far below it. */
const SAME_TEXT_SCAN_LIMIT = 600;
export { SEND_GUARD_HOLD_ERROR_CODE };

export interface SendGuardNotice {
  action: "warn" | "delay" | "hold";
  reason: SendGuardReason;
  retryAfterSeconds?: number;
  /** Outbound messages already in this chat in the last hour (warn only). */
  conversationCountLastHour?: number;
}

export interface SendGuardAssessment {
  origin: SendOrigin;
  decision: SendGuardDecision;
  /** Extra fields of the outbox intent: a delayed or held send is still queued durably. */
  outbox: { nextAttemptAt?: Date; status?: "failed"; lastErrorCode?: string };
  notice?: SendGuardNotice;
}

type GuardContext = {
  prisma: ServiceContext["prisma"];
  businessPrincipal: { kind: string };
};

export interface AssessSendArgs {
  clientMessageId: string;
  /** null when the chat does not exist yet (first message to a number). */
  conversationId: string | null;
  /** Text or caption; "" when there is none (voice notes). */
  text: string;
  now?: Date;
}

type MessageWhere = Record<string, unknown>;

function outboundWhere(since: Date): MessageWhere {
  return { direction: "outbound", messageType: { not: "activity" }, timestamp: { gte: since } };
}

async function secondsUntilSlotFrees(
  context: GuardContext,
  where: MessageWhere,
  limit: number,
  nowMs: number,
  fallbackSeconds: number,
): Promise<number> {
  const rows = await context.prisma.message.findMany({
    where,
    select: { timestamp: true },
    orderBy: { timestamp: "desc" },
    take: limit,
  });
  const edge = rows[limit - 1]?.timestamp;
  if (!edge) return fallbackSeconds;
  const seconds = Math.ceil(
    (edge.getTime() + WHATSAPP_SEND_GUARD.windowSeconds * 1000 - nowMs) / 1000,
  );
  return Math.min(fallbackSeconds, Math.max(1, seconds));
}

async function secondsSinceLastAutoSend(context: GuardContext, nowMs: number): Promise<number | null> {
  const [scheduled, recent] = await Promise.all([
    // A delayed automatic send waits in the outbox with a future time; the next
    // one must queue behind it, not beside it.
    context.prisma.outboxIntent.findFirst({
      where: {
        effectType: { in: [...SEND_GUARD_EFFECT_TYPES] },
        status: "queued",
        nextAttemptAt: { gt: new Date(nowMs) },
      },
      orderBy: { nextAttemptAt: "desc" },
      select: { nextAttemptAt: true },
    }),
    context.prisma.businessCommand.findFirst({
      where: {
        commandType: { in: [...QUEUE_COMMAND_TYPES] },
        createdAt: { gte: new Date(nowMs - PACING_LOOKBACK_SECONDS * 1000) },
        OR: [{ actor: { startsWith: "system:" } }, { actor: { startsWith: "ai:" } }],
      },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ]);
  const times = [scheduled?.nextAttemptAt, recent?.createdAt]
    .filter((value): value is Date => value instanceof Date)
    .map((value) => value.getTime());
  if (times.length === 0) return null;
  return (nowMs - Math.max(...times)) / 1000;
}

async function sameTextConversations(
  context: GuardContext,
  args: AssessSendArgs,
  nowMs: number,
): Promise<number> {
  const target = normalizeSendText(args.text);
  if (!target) return 1;
  const since = new Date(nowMs - WHATSAPP_SEND_GUARD.bulkWindowSeconds * 1000);
  const rows = await context.prisma.message.findMany({
    where: {
      ...outboundWhere(since),
      ...(args.conversationId ? { conversationId: { not: args.conversationId } } : {}),
      conversation: { channel: "whatsapp", lastMessageAt: { gte: since } },
    },
    select: { conversationId: true, body: true },
    orderBy: { timestamp: "desc" },
    take: SAME_TEXT_SCAN_LIMIT,
  });
  const chats = new Set<string>();
  for (const row of rows) {
    if (normalizeSendText(row.body) === target) chats.add(row.conversationId);
  }
  return chats.size + 1;
}

export async function assessWhatsAppSend(
  context: GuardContext,
  args: AssessSendArgs,
): Promise<SendGuardAssessment> {
  const origin = classifySendOrigin(context.businessPrincipal.kind);
  // An idempotent replay was judged when it was first queued.
  const existing = await context.prisma.message.findUnique({
    where: { id: args.clientMessageId },
    select: { id: true },
  });
  if (existing) {
    return { origin, decision: { action: "allow", reason: "ok" }, outbox: {} };
  }

  const now = args.now ?? new Date();
  const nowMs = now.getTime();
  const hourAgo = new Date(nowMs - WHATSAPP_SEND_GUARD.windowSeconds * 1000);
  const conversationWhere: MessageWhere | null = args.conversationId
    ? { ...outboundWhere(hourAgo), conversationId: args.conversationId }
    : null;
  const shopWhere: MessageWhere = {
    ...outboundWhere(hourAgo),
    conversation: { channel: "whatsapp", lastMessageAt: { gte: hourAgo } },
  };
  const [conversationCountLastHour, shopCountLastHour, sinceAuto, sameText] = await Promise.all([
    conversationWhere ? context.prisma.message.count({ where: conversationWhere }) : 0,
    context.prisma.message.count({ where: shopWhere }),
    origin === "automation" ? secondsSinceLastAutoSend(context, nowMs) : null,
    origin === "automation" ? sameTextConversations(context, args, nowMs) : 1,
  ]);

  const decision = evaluateSend({
    origin,
    now,
    conversationCountLastHour,
    shopCountLastHour,
    secondsSinceLastAutoSend: sinceAuto,
    sameTextConversationsLast15m: sameText,
  });
  if (decision.action !== "allow") {
    // Reason and class only: never the text, never the number.
    logger.warn("whatsapp.send_guard", { action: decision.action, reason: decision.reason, origin });
  }

  if (decision.action === "refuse") {
    const limits = origin === "human" ? WHATSAPP_SEND_GUARD.human : WHATSAPP_SEND_GUARD.automation;
    const perConversation = decision.reason.endsWith("conversation_hourly_limit");
    const where = perConversation && conversationWhere ? conversationWhere : shopWhere;
    const limit = perConversation ? limits.refuseConversationPerHour : limits.refuseShopPerHour;
    const wait = await secondsUntilSlotFrees(
      context,
      where,
      limit,
      nowMs,
      decision.retryAfterSeconds ?? WHATSAPP_SEND_GUARD.windowSeconds,
    );
    throw new WhatsAppSendGuardError(decision.reason, wait, origin);
  }
  if (decision.action === "delay") {
    return {
      origin,
      decision,
      outbox: { nextAttemptAt: decision.retryAt },
      notice: { action: "delay", reason: decision.reason, retryAfterSeconds: decision.retryAfterSeconds },
    };
  }
  if (decision.action === "hold") {
    return {
      origin,
      decision,
      outbox: { status: "failed", lastErrorCode: SEND_GUARD_HOLD_ERROR_CODE },
      notice: { action: "hold", reason: decision.reason },
    };
  }
  if (decision.action === "warn") {
    return {
      origin,
      decision,
      outbox: {},
      notice: { action: "warn", reason: decision.reason, conversationCountLastHour },
    };
  }
  return { origin, decision, outbox: {} };
}
