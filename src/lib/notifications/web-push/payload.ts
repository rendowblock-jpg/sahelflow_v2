// What may travel to a push service: a kind, a count, a time and a random id.
// Never a name, an amount, a phone number, a product, an order number or text.
import { createHmac, randomBytes } from "node:crypto";

export const PUSH_KINDS = [
  "orders",
  "whatsapp",
  "delivery_failed",
  "held",
  "backup_failed",
  "licence",
] as const;

export type PushKind = (typeof PUSH_KINDS)[number];
export type PushUrgency = "very-low" | "low" | "normal" | "high";

// TTL and Urgency travel outside the encryption (RFC 8030).
export const PUSH_POLICY: Readonly<Record<PushKind, { ttlSeconds: number; urgency: PushUrgency }>> = {
  orders: { ttlSeconds: 6 * 3600, urgency: "normal" },
  whatsapp: { ttlSeconds: 2 * 3600, urgency: "normal" },
  delivery_failed: { ttlSeconds: 12 * 3600, urgency: "normal" },
  held: { ttlSeconds: 4 * 3600, urgency: "high" },
  backup_failed: { ttlSeconds: 24 * 3600, urgency: "normal" },
  licence: { ttlSeconds: 24 * 3600, urgency: "low" },
};

export type PushPayload = { v: 1; k: PushKind; n: number; t: number; id: string };

export type PayloadErrorCode = "unknown_kind" | "bad_count" | "bad_time" | "bad_id" | "bad_secret";

export class PayloadError extends Error {
  readonly code: PayloadErrorCode;

  constructor(code: PayloadErrorCode, message: string) {
    super(message);
    this.name = "PayloadError";
    this.code = code;
  }
}

export function isPushKind(value: unknown): value is PushKind {
  return typeof value === "string" && (PUSH_KINDS as readonly string[]).includes(value);
}

export function assertPushKind(value: unknown): PushKind {
  if (!isPushKind(value)) throw new PayloadError("unknown_kind", "Unknown push kind.");
  return value;
}

export function assertCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new PayloadError("bad_count", "Count must be a whole number, 0 or more.");
  }
  return value;
}

export function assertTime(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new PayloadError("bad_time", "Time must be milliseconds since the epoch.");
  }
  return value;
}

/** Only the five allowed fields are copied; anything else the caller passes is dropped. */
export function buildPayload(input: { kind: PushKind; count: number; now: number; id?: string }): PushPayload {
  const kind = assertPushKind(input.kind);
  const count = assertCount(input.count);
  const now = assertTime(input.now);
  const id = input.id === undefined ? randomBytes(8).toString("hex") : input.id;
  if (typeof id !== "string" || !/^[0-9a-f]{16}$/.test(id)) {
    throw new PayloadError("bad_id", "Payload id must be 16 lowercase hex characters.");
  }
  return { v: 1, k: kind, n: count, t: Math.floor(now / 1000), id };
}

/** Fixed key order and a second allow-list: nothing but the five fields is written. */
export function serializePayload(payload: PushPayload): Uint8Array {
  return Buffer.from(
    JSON.stringify({ v: 1, k: payload.k, n: payload.n, t: payload.t, id: payload.id }),
    "utf8",
  );
}

/** RFC 8030 Topic. A keyed hash, so the push service cannot read the kind. */
export function topicFor(authSecret: Uint8Array, kind: PushKind): string {
  assertPushKind(kind);
  if (authSecret.length !== 16) throw new PayloadError("bad_secret", "Auth secret must be 16 bytes.");
  return createHmac("sha256", authSecret).update(kind).digest("base64url").slice(0, 22);
}
