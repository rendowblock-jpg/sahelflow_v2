import { messageText, type IncomingMessage } from "@/lib/whatsapp/types";
import type { InboxMessage } from "@/components/inbox/inbox-workspace-types";

/**
 * Projects one persisted WhatsApp message from the history API
 * (`/api/whatsapp/chats/[jid]/messages`) into the renderer's InboxMessage.
 *
 * The quoted-reply fields MUST survive this projection: the composer renders
 * the quote chip from them, so dropping them here makes every quote chip
 * vanish on chat switch, background refresh, or app restart even though the
 * send itself (and the quote on the recipient's phone) is intact (#317 B1/B2).
 */
export function toInboxMessageFromWhatsApp(
  message: IncomingMessage & { messageType?: string },
): InboxMessage {
  return {
    id: message.key.id,
    body: messageText(message.message),
    direction: message.key.fromMe ? "outbound" : "inbound",
    timestamp: message.messageTimestamp * 1000,
    messageType: message.messageType,
    deliveryStatus: message.deliveryStatus,
    outboxEffectKey: message.effectKey,
    outboxState: message.effectState,
    outboxErrorCode: message.effectErrorCode ?? null,
    attachment: message.attachment,
    quotedMessageId: message.quotedMessageId,
    quoted: message.quoted,
  };
}

const DELIVERY_STATUS_RANK: Partial<
  Record<NonNullable<InboxMessage["deliveryStatus"]>, number>
> = {
  sending: 0,
  sent: 1,
  delivered: 2,
  read: 3,
};

function mostAdvancedDeliveryStatus(
  ...statuses: Array<InboxMessage["deliveryStatus"]>
): InboxMessage["deliveryStatus"] {
  return statuses.reduce<InboxMessage["deliveryStatus"]>((advanced, status) => {
    if (!status) return advanced;
    if (!advanced) return status;
    const advancedRank = DELIVERY_STATUS_RANK[advanced] ?? -1;
    const statusRank = DELIVERY_STATUS_RANK[status] ?? -1;
    return statusRank > advancedRank ? status : advanced;
  }, undefined);
}

function resolveProjectedDeliveryStatus(
  persisted: InboxMessage["deliveryStatus"],
  live: InboxMessage["deliveryStatus"],
): InboxMessage["deliveryStatus"] {
  // Failure is a terminal outbox outcome, not a lower delivery receipt. A
  // live failure supersedes only pre-delivery snapshots; durable delivered/read
  // receipts prove the provider committed and must suppress duplicate-prone
  // retry UI. Conversely, a live retry/success supersedes a persisted failure.
  if (live === "failed") {
    return persisted === "delivered" || persisted === "read"
      ? persisted
      : "failed";
  }
  if (persisted === "failed") return live ?? "failed";
  return mostAdvancedDeliveryStatus(persisted, live);
}

/**
 * Restores persisted history without erasing live mutations that landed while
 * the projection request was in flight. Outbox effect keys remain stable when
 * a client-generated message ID is replaced by the provider receipt ID.
 */
export function mergeInboxMessageProjection(
  persisted: readonly InboxMessage[],
  live: readonly InboxMessage[],
): InboxMessage[] {
  const remainingLiveById = new Map(
    live.map((message) => [message.id, message]),
  );
  const liveIdByEffectKey = new Map(
    live.flatMap((message) =>
      message.outboxEffectKey
        ? [[message.outboxEffectKey, message.id] as const]
        : [],
    ),
  );

  const merged = persisted.map((message) => {
    const effectMatchId = message.outboxEffectKey
      ? liveIdByEffectKey.get(message.outboxEffectKey)
      : undefined;
    const liveMessage =
      remainingLiveById.get(message.id) ??
      (effectMatchId ? remainingLiveById.get(effectMatchId) : undefined);
    if (!liveMessage) return message;

    remainingLiveById.delete(liveMessage.id);
    if (liveMessage.outboxEffectKey) {
      liveIdByEffectKey.delete(liveMessage.outboxEffectKey);
    }
    const deliveryStatus = resolveProjectedDeliveryStatus(
      message.deliveryStatus,
      liveMessage.deliveryStatus,
    );
    return {
      ...liveMessage,
      ...(deliveryStatus ? { deliveryStatus } : {}),
    };
  });

  merged.push(...remainingLiveById.values());
  return merged.sort((left, right) => left.timestamp - right.timestamp);
}

/**
 * Reconciles a durable outbox transition through client ID, provider ID, or
 * stable effect key and collapses any socket-push copy of the same message.
 */
export function reconcileInboxProviderMessage(
  current: readonly InboxMessage[],
  localMessageId: string,
  providerMessageId: string | null | undefined,
  patch: Partial<InboxMessage>,
): InboxMessage[] {
  const providerIndex = providerMessageId
    ? current.findIndex((message) => message.id === providerMessageId)
    : -1;
  const localIndex = current.findIndex(
    (message) => message.id === localMessageId,
  );
  const effectIndex = patch.outboxEffectKey
    ? current.findIndex(
        (message) => message.outboxEffectKey === patch.outboxEffectKey,
      )
    : -1;
  const targetIndex =
    localIndex >= 0
      ? localIndex
      : providerIndex >= 0
        ? providerIndex
        : effectIndex;
  if (targetIndex < 0) return [...current];

  const target = current[targetIndex];
  if (!target) return [...current];
  const providerMessage =
    providerIndex >= 0 ? current[providerIndex] : undefined;
  const effectMessage = effectIndex >= 0 ? current[effectIndex] : undefined;
  const currentDeliveryStatus = mostAdvancedDeliveryStatus(
    target.deliveryStatus,
    providerMessage?.deliveryStatus,
    effectMessage?.deliveryStatus,
  );
  const deliveryStatus = resolveProjectedDeliveryStatus(
    currentDeliveryStatus,
    patch.deliveryStatus,
  );
  const reconciled: InboxMessage = {
    ...target,
    ...patch,
    id: providerMessageId ?? target.id,
    ...(deliveryStatus ? { deliveryStatus } : {}),
  };

  return current.flatMap((message, index) => {
    if (index === targetIndex) return [reconciled];
    if (
      index === providerIndex ||
      index === effectIndex ||
      (providerMessageId && message.id === providerMessageId)
    ) {
      return [];
    }
    return [message];
  });
}
