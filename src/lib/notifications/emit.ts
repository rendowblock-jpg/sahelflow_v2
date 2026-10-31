import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import {
  KIND_SPECS,
  asSeverity,
  buildEventKey,
  linkFor,
  safeToken,
  type NotificationKind,
  type NotificationSeverity,
} from "./event-kinds";

export type NotificationEmitClient = Pick<Prisma.TransactionClient, "notificationEvent">;

export interface EmitInput {
  kind: NotificationKind;
  shopId: string;
  at?: Date;
  subject?: string;
  variant?: string;
  severity?: NotificationSeverity;
}

/** The only fields a marker may have. No name, amount, phone or text. */
export function buildNotificationMarker(input: EmitInput) {
  const spec = KIND_SPECS[input.kind];
  const at = input.at ?? new Date();
  const eventKey = buildEventKey({ kind: input.kind, at, subject: input.subject, variant: input.variant });
  const subject = safeToken(input.subject);
  return {
    id: `nev_${createHash("sha256").update(eventKey, "utf8").digest("hex").slice(0, 32)}`,
    eventKey,
    eventType: spec.eventType,
    category: "inbox",
    severity: asSeverity(input.severity ?? spec.severity),
    requiredAction: spec.requiredAction,
    targetType: input.kind === "whatsapp.received" ? "conversation" : "shop",
    targetId: input.kind === "whatsapp.received" && subject !== "none" ? subject : safeToken(input.shopId),
    sourceRecordId: eventKey,
    link: linkFor(input.kind, input.subject),
    occurredAt: at,
    expiresAt: new Date(at.getTime() + spec.expiresDays * 24 * 60 * 60_000),
  };
}

/**
 * Writes the marker (or finds it already there). Pass the transaction of the
 * command that caused the event so both commit together. It NEVER throws into
 * the caller: a broken notification must not undo an order. The log line holds
 * the kind and an error code, never the error text (it can quote data).
 */
export async function emitNotificationEvent(
  client: NotificationEmitClient,
  input: EmitInput,
): Promise<{ emitted: boolean; eventKey: string | null }> {
  try {
    const marker = buildNotificationMarker(input);
    await client.notificationEvent.upsert({
      where: { eventKey: marker.eventKey },
      create: marker,
      update: {},
    });
    return { emitted: true, eventKey: marker.eventKey };
  } catch (error) {
    const code = typeof (error as { code?: unknown } | null)?.code === "string"
      ? String((error as { code: string }).code).slice(0, 32)
      : "unknown";
    try {
      // eslint-disable-next-line no-console
      console.warn("notification.emit_failed", { kind: input.kind, code });
    } catch {
      // A broken logger must not break the caller either.
    }
    return { emitted: false, eventKey: null };
  }
}
