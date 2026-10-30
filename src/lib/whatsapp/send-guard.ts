/**
 * WhatsApp send guard: the pure policy.
 *
 * SahelFlow talks to WhatsApp through an unofficial client, so the seller's own
 * business number is what gets restricted when sending looks automatic or
 * bulk. This module only DECIDES; `send-guard-store.ts` gathers the counts from
 * the persisted rows and `durable-send.ts` acts on the decision. No I/O, no
 * clock reads: the caller passes `now`, so every edge is table-testable.
 */
import { SahelFlowError } from "@/types/errors";

/** lastErrorCode of an outbox intent the guard held (pure module so the inbox can read it too). */
export const SEND_GUARD_HOLD_ERROR_CODE = "SEND_GUARD_BULK_SAME_TEXT";

/** Every tunable number of the policy lives here and nowhere else. */
export const WHATSAPP_SEND_GUARD = {
  /** Rolling window of the per-conversation and per-shop counts. */
  windowSeconds: 3600,
  /** Rolling window of the same-text bulk pattern. */
  bulkWindowSeconds: 900,
  human: {
    /** Already this many in the hour: still sent, but the person is warned. */
    warnConversationPerHour: 40,
    refuseConversationPerHour: 90,
    refuseShopPerHour: 500,
  },
  automation: {
    minSecondsBetweenSends: 3,
    refuseConversationPerHour: 20,
    refuseShopPerHour: 200,
    /** The send that would reach this many distinct chats with one text is held. */
    holdSameTextConversations: 6,
  },
} as const;

export type SendOrigin = "human" | "automation";
export type SendGuardAction = "allow" | "warn" | "delay" | "refuse" | "hold";
export type SendGuardReason =
  | "ok"
  | "human_conversation_volume_warning"
  | "human_conversation_hourly_limit"
  | "human_shop_hourly_limit"
  | "automation_conversation_hourly_limit"
  | "automation_shop_hourly_limit"
  | "automation_bulk_same_text"
  | "automation_pacing";

export interface SendGuardInput {
  origin: SendOrigin;
  now: Date | number;
  /** Outbound messages already sent to this conversation in the last hour (this send not counted). */
  conversationCountLastHour: number;
  /** Outbound messages already sent by the whole shop in the last hour (this send not counted). */
  shopCountLastHour: number;
  /**
   * Seconds since the latest automatic send of the shop, null when there is
   * none. Negative when that send is itself scheduled in the future (it was
   * delayed), which pushes the next one behind it.
   */
  secondsSinceLastAutoSend: number | null;
  /**
   * Distinct conversations that got (or, with this send, would get) the same
   * normalized text in the last 15 minutes. THIS send counts as one, so the
   * minimum is 1.
   */
  sameTextConversationsLast15m: number;
}

export interface SendGuardDecision {
  action: SendGuardAction;
  reason: SendGuardReason;
  /** delay: when to try again. refuse: upper bound until a slot frees up. */
  retryAfterSeconds?: number;
  retryAt?: Date;
}

function requireCount(name: string, value: number, min: number): void {
  if (!Number.isInteger(value) || value < min) {
    throw new RangeError(`send guard: ${name} must be an integer >= ${min}`);
  }
}

function withRetry(
  action: SendGuardAction,
  reason: SendGuardReason,
  nowMs: number,
  retryAfterSeconds: number,
): SendGuardDecision {
  return {
    action,
    reason,
    retryAfterSeconds,
    retryAt: new Date(nowMs + retryAfterSeconds * 1000),
  };
}

export function evaluateSend(input: SendGuardInput): SendGuardDecision {
  const nowMs = input.now instanceof Date ? input.now.getTime() : input.now;
  if (!Number.isFinite(nowMs)) throw new RangeError("send guard: now must be a valid time");
  if (input.origin !== "human" && input.origin !== "automation") {
    throw new RangeError("send guard: unknown origin");
  }
  requireCount("conversationCountLastHour", input.conversationCountLastHour, 0);
  requireCount("shopCountLastHour", input.shopCountLastHour, 0);
  requireCount("sameTextConversationsLast15m", input.sameTextConversationsLast15m, 1);
  const since = input.secondsSinceLastAutoSend;
  if (since !== null && !Number.isFinite(since)) {
    throw new RangeError("send guard: secondsSinceLastAutoSend must be a number or null");
  }
  const window = WHATSAPP_SEND_GUARD.windowSeconds;

  if (input.origin === "human") {
    const limits = WHATSAPP_SEND_GUARD.human;
    if (input.conversationCountLastHour >= limits.refuseConversationPerHour) {
      return withRetry("refuse", "human_conversation_hourly_limit", nowMs, window);
    }
    if (input.shopCountLastHour >= limits.refuseShopPerHour) {
      return withRetry("refuse", "human_shop_hourly_limit", nowMs, window);
    }
    if (input.conversationCountLastHour >= limits.warnConversationPerHour) {
      return { action: "warn", reason: "human_conversation_volume_warning" };
    }
    return { action: "allow", reason: "ok" };
  }

  const limits = WHATSAPP_SEND_GUARD.automation;
  if (input.conversationCountLastHour >= limits.refuseConversationPerHour) {
    return withRetry("refuse", "automation_conversation_hourly_limit", nowMs, window);
  }
  if (input.shopCountLastHour >= limits.refuseShopPerHour) {
    return withRetry("refuse", "automation_shop_hourly_limit", nowMs, window);
  }
  if (input.sameTextConversationsLast15m >= limits.holdSameTextConversations) {
    return { action: "hold", reason: "automation_bulk_same_text" };
  }
  if (since !== null && since < limits.minSecondsBetweenSends) {
    return withRetry(
      "delay",
      "automation_pacing",
      nowMs,
      Math.ceil(limits.minSecondsBetweenSends - since),
    );
  }
  return { action: "allow", reason: "ok" };
}

/**
 * Who is sending, from the trusted principal kind: only a signed-in person is
 * human. Schedulers, automations, AI and provider/source principals are
 * automatic. The class never comes from a request body.
 */
export function classifySendOrigin(principalKind: string): SendOrigin {
  return principalKind === "authenticated-owner" || principalKind === "test"
    ? "human"
    : "automation";
}

/**
 * Key of the bulk pattern: the same words with different order numbers, case
 * or spacing are ONE text. Digits of every script are removed first (Latin,
 * Arabic-Indic, Persian, full-width), then spaces collapse, so "a 1 b" and
 * "a b" match. An all-digit text normalizes to "" and is never a pattern.
 */
export function normalizeSendText(text: string): string {
  return text.toLowerCase().replace(/\p{Nd}/gu, "").replace(/\s+/gu, " ").trim();
}

/** Thrown when a send is refused. Callers that cannot show it log and keep the item queued. */
export const SEND_GUARD_REFUSED_CODE = "SEND_GUARD_REFUSED";

export class WhatsAppSendGuardError extends SahelFlowError {
  constructor(
    public readonly reason: SendGuardReason,
    public readonly retryAfterSeconds: number,
    public readonly origin: SendOrigin,
  ) {
    super(
      `WhatsApp sending is paused to protect the shop number (${reason})`,
      SEND_GUARD_REFUSED_CODE,
      429,
    );
  }
}
