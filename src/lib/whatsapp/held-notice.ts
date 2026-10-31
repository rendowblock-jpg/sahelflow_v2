import { emitNotificationEvent, type NotificationEmitClient } from "@/lib/notifications/emit";
import type { SendGuardAssessment } from "./send-guard-store";

/**
 * A send the guard HOLDS tells the seller once ("a WhatsApp message is waiting for your OK").
 * Called from inside the command transaction that writes the held outbox row, with that `tx`, so a hold that
 * rolls back emits nothing. subject = the client message id: it is the identity of the held row (its outbox
 * payload carries the same id) and, unlike the outbox row id, it exists while the command runs. The event key is
 * kind + shop day + subject, so a replay of the same send never makes a second row. Release and Discard emit nothing:
 * the live count (live-state.ts) simply drops.
 */
export async function emitHeldSendNotice(
  tx: NotificationEmitClient,
  assessment: Pick<SendGuardAssessment, "decision">,
  messageId: string,
  shopId?: string,
): Promise<void> {
  if (assessment.decision.action !== "hold") return;
  await emitNotificationEvent(tx, { kind: "whatsapp.held", shopId, subject: messageId });
}
