/**
 * Shared chat message bound (ledger AI-17 residual — composer char counter).
 *
 * One authority for the composer's `maxLength`, the near-limit counter and
 * BOTH server zod schemas (`/messages`, `/messages/stream`): the client can
 * never advertise a bound the server would reject, and the server bound can
 * never drift from the visible counter.
 */
export const AI_CHAT_MESSAGE_MAX_LENGTH = 4000;

/** The counter appears once the draft passes this share of the bound —
 * always-visible counters are noise for the common short prompt. */
export const AI_CHAT_COUNTER_VISIBLE_SHARE = 0.7;
