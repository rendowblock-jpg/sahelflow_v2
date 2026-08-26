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
