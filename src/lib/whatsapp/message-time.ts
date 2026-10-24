/**
 * The time a provider message is stored and sorted by.
 *
 * The sidecar sends 0 when the provider gave no usable time. Reading that as a
 * date puts a new thread in 1970, last in the inbox. In that case use the time
 * the sidecar first received the message (`receivedAt`, kept in the sealed
 * ingress payload and never rewritten by a replay), so a retry stores the same
 * time. A real provider time is returned unchanged.
 */
export function storedMessageTime(
  providerTime: Date | null,
  messageTimestampSeconds: number,
  receivedAt: string,
): Date {
  const provider =
    providerTime ?? new Date(messageTimestampSeconds * 1_000);
  if (provider.getTime() > 0) return provider;
  return new Date(receivedAt);
}
