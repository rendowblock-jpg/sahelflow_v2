/**
 * Held WhatsApp sends: the pure decisions shared by the approve route, the
 * history route and the inbox. A send the guard held is an outbox intent with
 * status `failed`, outcome `none` and the hold code; no I/O, no clock.
 */
import { SEND_GUARD_HOLD_ERROR_CODE, WHATSAPP_SEND_GUARD } from "./send-guard";

/** Typed code of the 403 a non-owner gets from the approve route. */
export const HELD_SEND_OWNER_ONLY_CODE = "HELD_SEND_OWNER_ONLY";

/** The hold fires on the Nth chat, so N-1 other chats already got the text. */
export const HELD_SEND_OTHER_CHATS = WHATSAPP_SEND_GUARD.automation.holdSameTextConversations - 1;

export interface OutboxIntentFacts {
  status: string;
  outcomeState: string | null;
  lastErrorCode: string | null;
}

export function isHeldOutboxIntent(intent: OutboxIntentFacts): boolean {
  return (
    intent.status === "failed" &&
    intent.outcomeState === "none" &&
    intent.lastErrorCode === SEND_GUARD_HOLD_ERROR_CODE
  );
}

/**
 * The owner threw a held send away: a dead-lettered row that still carries the
 * hold code. (The hold code is only ever set on a held row, and a discard keeps it.)
 */
export function isDiscardedOutboxIntent(intent: OutboxIntentFacts): boolean {
  return intent.status === "dead_letter" && intent.lastErrorCode === SEND_GUARD_HOLD_ERROR_CODE;
}

/** The state the inbox history shows for an intent (an ambiguous outcome always wins). */
export function projectOutboxEffectState(intent: OutboxIntentFacts): string {
  if (intent.status === "failed" && intent.outcomeState === "ambiguous") return "ambiguous";
  if (isHeldOutboxIntent(intent)) return "held";
  if (isDiscardedOutboxIntent(intent)) return "discarded";
  return intent.status;
}

export type HeldApprovalDecision = "release" | "already_approved" | "not_held";

/** `hasApprovalAudit`: the approval audit row exists for this intent (it was released before). */
export function decideHeldApproval(
  intent: OutboxIntentFacts,
  hasApprovalAudit: boolean,
): HeldApprovalDecision {
  if (isHeldOutboxIntent(intent)) return "release";
  return hasApprovalAudit ? "already_approved" : "not_held";
}

export type HeldDiscardDecision = "discard" | "already_discarded" | "already_released" | "not_held";

/**
 * `hasApprovalAudit`: the release audit row exists (the send may have gone out).
 * `hasDiscardAudit`: the discard audit row exists. A released send is never
 * discarded and a discarded send is never released: the release proof wins.
 */
export function decideHeldDiscard(
  intent: OutboxIntentFacts,
  hasApprovalAudit: boolean,
  hasDiscardAudit: boolean,
): HeldDiscardDecision {
  if (hasApprovalAudit) return "already_released";
  if (isHeldOutboxIntent(intent)) return "discard";
  return hasDiscardAudit ? "already_discarded" : "not_held";
}

/** Only the shop owner releases a held send; a team member never does. */
export function isOwnerActor(actor: { kind: string; role?: string }): boolean {
  return (
    (actor.kind === "compatibility_local_owner" || actor.kind === "person") &&
    actor.role === "owner"
  );
}

export type HeldSendView = "none" | "owner_can_release" | "ask_owner" | "discarded";

export function heldSendView(
  message: {
    direction: "inbound" | "outbound" | "system";
    outboxState?: string | undefined;
    outboxEffectKey?: string | undefined;
  },
  canApprove: boolean,
): HeldSendView {
  if (message.direction !== "outbound") return "none";
  if (!message.outboxEffectKey) return "none";
  if (message.outboxState === "discarded") return "discarded";
  if (message.outboxState !== "held") return "none";
  return canApprove ? "owner_can_release" : "ask_owner";
}
