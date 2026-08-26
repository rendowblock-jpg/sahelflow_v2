import type { InboxMessage } from "@/components/inbox/inbox-workspace-types";

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
    return liveMessage;
  });

  merged.push(...remainingLiveById.values());
  return merged.sort((left, right) => left.timestamp - right.timestamp);
}

/**
 * Applies a provider receipt to the optimistic row and removes an earlier
 * socket-push copy of that same provider message if it raced the HTTP result.
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
  const targetIndex = localIndex >= 0 ? localIndex : providerIndex;
  if (targetIndex < 0) return [...current];

  const target = current[targetIndex];
  if (!target) return [...current];
  const reconciled: InboxMessage = {
    ...target,
    ...patch,
    id: providerMessageId ?? target.id,
  };

  return current.flatMap((message, index) => {
    if (index === targetIndex) return [reconciled];
    if (providerMessageId && message.id === providerMessageId) return [];
    return [message];
  });
}
