/**
 * Agents image input: the one set of bounds shared by the composer (which
 * gates the picker, paste and drop) and the stream route (which re-checks
 * every image from its decoded bytes).
 *
 * The composer downsizes photos before sending (longest edge
 * `AI_CHAT_ATTACHMENT_MAX_EDGE`), so real uploads sit far below the byte
 * ceiling; the ceiling only stops a crafted request.
 */
export const AI_CHAT_ATTACHMENT_MAX_COUNT = 4;
export const AI_CHAT_ATTACHMENT_MAX_BYTES = 4 * 1024 * 1024;
/** Source files larger than this are refused before any decoding. */
export const AI_CHAT_ATTACHMENT_SOURCE_MAX_BYTES = 20 * 1024 * 1024;
export const AI_CHAT_ATTACHMENT_MAX_EDGE = 2048;
export const AI_CHAT_ATTACHMENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export type AiChatAttachmentType = (typeof AI_CHAT_ATTACHMENT_TYPES)[number];
export const AI_CHAT_ATTACHMENT_ACCEPT = AI_CHAT_ATTACHMENT_TYPES.join(",");

/** What the client and history carry for a stored image (never its bytes). */
export interface AiChatAttachmentMeta {
  id: string;
  mediaType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
}

export function aiChatAttachmentUrl(id: string): string {
  return `/api/ai/attachments/${encodeURIComponent(id)}`;
}
