/**
 * Canonical Baileys message-status mapping shared by the WhatsApp sidecar and
 * the SahelFlow renderer (imported client-side through the repo-relative path,
 * same precedent as send-receipts.ts on the message-status route).
 *
 * WHY THIS MODULE EXISTS: the renderer and the sidecar each carried a private
 * mapper that assumed the proto enum {PENDING:0, SENT:1, DELIVERY:2, READ:3}.
 * The installed dependency (@whiskeysockets/baileys 6.17.16) actually emits
 * WebMessageInfo.Status as {ERROR:0, PENDING:1, SERVER_ACK:2, DELIVERY_ACK:3,
 * READ:4, PLAYED:5} — verified at runtime against the installed package and
 * pinned by delivery-status.test.ts. Under the old assumption every outbound
 * bubble lied: a SERVER_ACK (2) rendered "delivered" before the phone had the
 * message, a DELIVERY_ACK (3) rendered the blue "read" check, and a real
 * failure (ERROR = 0) was rendered as "sending" forever. One canonical module
 * prevents the copies from diverging again.
 *
 * This module MUST stay dependency-free: it is imported by the sidecar (Bun)
 * and bundled into the renderer (browser).
 */

export type WhatsAppDeliveryStatus =
  | "sending"
  | "sent"
  | "delivered"
  | "read"
  | "failed";

/**
 * WebMessageInfo.Status as emitted by the installed Baileys
 * (WAProto/index.d.ts:36695-36702, runtime-verified against
 * @whiskeysockets/baileys 6.17.16).
 */
export const BAILEYS_MESSAGE_STATUS = {
  ERROR: 0,
  PENDING: 1,
  SERVER_ACK: 2,
  DELIVERY_ACK: 3,
  READ: 4,
  PLAYED: 5,
} as const;

/**
 * Maps a Baileys message status (proto number or uppercase string form) to
 * the truthful SahelFlow delivery status.
 *
 * - ERROR(0)   → "failed"    (device/provider rejected the stanza)
 * - PENDING(1) → "sending"   (accepted, not yet server-acknowledged)
 * - SERVER_ACK(2) → "sent"   (server accepted; the phone may not have it yet)
 * - DELIVERY_ACK(3) → "delivered" (device confirmed receipt)
 * - READ(4)    → "read"
 * - PLAYED(5)  → "read"      (media played; implies seen — the SahelFlow
 *                             status enum has no separate "played" state)
 *
 * Unknown values return null so callers can skip rather than mislabel.
 */
export function mapBaileysDeliveryStatus(
  status: unknown,
): WhatsAppDeliveryStatus | null {
  if (status === undefined || status === null) return null;
  const numeric =
    typeof status === "number"
      ? status
      : typeof status === "string" && /^\d+$/.test(status.trim())
        ? Number(status.trim())
        : null;
  if (numeric !== null) {
    switch (numeric) {
      case BAILEYS_MESSAGE_STATUS.ERROR:
        return "failed";
      case BAILEYS_MESSAGE_STATUS.PENDING:
        return "sending";
      case BAILEYS_MESSAGE_STATUS.SERVER_ACK:
        return "sent";
      case BAILEYS_MESSAGE_STATUS.DELIVERY_ACK:
        return "delivered";
      case BAILEYS_MESSAGE_STATUS.READ:
      case BAILEYS_MESSAGE_STATUS.PLAYED:
        return "read";
      default:
        return null;
    }
  }
  if (typeof status !== "string") return null;
  const normalized = status.trim().toUpperCase();
  switch (normalized) {
    case "ERROR":
      return "failed";
    case "PENDING":
      return "sending";
    case "SERVER_ACK":
      return "sent";
    case "DELIVERY_ACK":
    case "DELIVERY":
    case "DELIVERED":
      return "delivered";
    case "READ":
    case "PLAYED":
      return "read";
    default:
      return null;
  }
}

/**
 * Status projection for a whole Baileys `messages.update` entry: an explicit
 * error field always means failure (the legacy sidecar contract), otherwise
 * the status enum decides. Returns null when nothing can be concluded.
 */
export function mapBaileysStatusUpdate(
  update: Record<string, unknown> | null | undefined,
): WhatsAppDeliveryStatus | null {
  if (!update) return null;
  if (update.error !== undefined && update.error !== null) return "failed";
  return mapBaileysDeliveryStatus(update.status);
}

/**
 * Best-effort human-readable failure detail from a failed `messages.update`:
 * prefers the explicit `error` field, then Baileys message stub parameters
 * (device-failure receipts carry `{status: ERROR, messageStubParameters}` with
 * NO `error` field). Returns null when neither carries text.
 */
export function baileysFailureText(
  update: Record<string, unknown> | null | undefined,
): string | null {
  if (!update) return null;
  const error = update.error;
  if (error !== undefined && error !== null) {
    const text = String(error).trim();
    if (text) return text.slice(0, 2000);
  }
  const stub = update.messageStubParameters;
  if (Array.isArray(stub)) {
    const text = stub
      .filter((entry): entry is string => typeof entry === "string")
      .join("; ")
      .trim();
    if (text) return text.slice(0, 2000);
  }
  return null;
}
