import type { InboxLocalMediaProjection } from "./types";

/**
 * Browser-safe local media lifecycle projection. The canonical Message ID is
 * the only identity exposed; object IDs, provider retrieval secrets and file
 * paths remain server-side.
 */
export function projectInboxLocalMedia(
  messageId: string,
  status: string | undefined,
  outcomeState: string | undefined,
): InboxLocalMediaProjection {
  const encoded = encodeURIComponent(messageId);
  const statusUrl = `/api/inbox/media/${encoded}/status`;
  if (status === "succeeded" && outcomeState === "receipt") {
    return {
      state: "ready",
      statusUrl,
      readUrl: `/api/inbox/media/${encoded}`,
      downloadUrl: `/api/inbox/media/${encoded}?download=1`,
      thumbnailUrl: `/api/inbox/media/${encoded}?variant=thumbnail`,
    };
  }
  if (status === "dead_letter" || status === "failed") {
    return { state: "failed", statusUrl };
  }
  return { state: "pending", statusUrl };
}
