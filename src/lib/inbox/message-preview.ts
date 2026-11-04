import type { Locale } from "@/lib/i18n";
import { getInboxWorkspaceCopy, type InboxWorkspaceKey } from "@/lib/i18n/inbox-workspace";

/**
 * What a message looks like in one line: the conversation list row and the
 * placeholder inside a bubble that has nothing else to draw (F-0029).
 *
 * Pure: no DOM, no React. The icon is a NAME; the component maps it to a glyph.
 * Rules, in order:
 *   1. A deleted message says it was deleted, whatever text is still stored.
 *   2. A media type shows its icon and label, then the first line of the
 *      caption when there is one ("Photo · Colis prêt").
 *   3. Text shows its first non-empty line.
 *   4. Anything with nothing readable ("text" with an empty body, an unknown
 *      type, an undecryptable stub) says "Message could not be shown".
 *   5. No message at all is "none": no text, no icon.
 * The phrase "Saved history" is never a preview.
 */
export type MessagePreviewKind =
  | "none"
  | "text"
  | "image"
  | "video"
  | "voice"
  | "audio"
  | "document"
  | "sticker"
  | "contact"
  | "location"
  | "poll"
  | "reaction"
  | "deleted"
  | "unavailable";

export type MessagePreviewIcon =
  | "image"
  | "video"
  | "mic"
  | "audio"
  | "document"
  | "sticker"
  | "contact"
  | "location"
  | "poll"
  | "reaction"
  | "deleted"
  | "unavailable";

export interface MessagePreviewInput {
  /** Stored text, or the caption of a media message. */
  body?: string | null;
  /** Stored message type: text, image, video, audio, document, sticker, ... */
  messageType?: string | null;
  /** True when the provider told us the message was deleted. */
  deleted?: boolean;
  /** Only `voiceMessage` is read: it tells a voice note from an audio file. */
  attachment?: { voiceMessage?: boolean | null } | null;
}

export interface MessagePreview {
  kind: MessagePreviewKind;
  icon: MessagePreviewIcon | null;
  /** The localized name of the kind ("Photo"); null for plain text and none. */
  label: string | null;
  /** First line of the caption, or "" . */
  caption: string;
  /** What to print in one line: the text, the label, or label · caption. */
  text: string;
}

const MAX_PREVIEW_CHARACTERS = 160;
const CAPTION_SEPARATOR = " · ";

const KIND_BY_TYPE: Record<string, MessagePreviewKind> = {
  text: "text",
  template: "text",
  activity: "text",
  image: "image",
  video: "video",
  audio: "voice",
  voice: "voice",
  ptt: "voice",
  document: "document",
  sticker: "sticker",
  contact: "contact",
  contacts: "contact",
  location: "location",
  live_location: "location",
  poll: "poll",
  reaction: "reaction",
  deleted: "deleted",
  revoked: "deleted",
  unavailable: "unavailable",
  undecryptable: "unavailable",
  ciphertext: "unavailable",
};

const LABEL_KEY: Record<
  Exclude<MessagePreviewKind, "none" | "text">,
  { key: InboxWorkspaceKey; icon: MessagePreviewIcon }
> = {
  image: { key: "previewPhoto", icon: "image" },
  video: { key: "previewVideo", icon: "video" },
  voice: { key: "previewVoice", icon: "mic" },
  audio: { key: "previewAudio", icon: "audio" },
  document: { key: "previewDocument", icon: "document" },
  sticker: { key: "previewSticker", icon: "sticker" },
  contact: { key: "previewContact", icon: "contact" },
  location: { key: "previewLocation", icon: "location" },
  poll: { key: "previewPoll", icon: "poll" },
  reaction: { key: "previewReaction", icon: "reaction" },
  deleted: { key: "previewDeleted", icon: "deleted" },
  unavailable: { key: "previewUnavailable", icon: "unavailable" },
};

/** First non-empty line, trimmed, cut at MAX_PREVIEW_CHARACTERS. */
export function firstLine(value: string | null | undefined): string {
  if (!value) return "";
  const line = value.split(/\r\n|\r|\n/).map((part) => part.trim()).find(Boolean) ?? "";
  const characters = Array.from(line);
  return characters.length > MAX_PREVIEW_CHARACTERS
    ? `${characters.slice(0, MAX_PREVIEW_CHARACTERS).join("")}…`
    : line;
}

function classify(input: MessagePreviewInput, hasBody: boolean): MessagePreviewKind {
  if (input.deleted) return "deleted";
  const type = (input.messageType ?? "").trim().toLowerCase();
  const known = KIND_BY_TYPE[type];
  if (known === "voice" && input.attachment?.voiceMessage === false) return "audio";
  if (known === "text") return hasBody ? "text" : "unavailable";
  if (known) return known;
  // Missing or unrecognised type ("unknown"): show the words when there are
  // any, otherwise say honestly that nothing can be shown.
  return hasBody ? "text" : "unavailable";
}

export function messagePreview(
  message: MessagePreviewInput | null | undefined,
  locale: Locale,
): MessagePreview {
  if (!message) return { kind: "none", icon: null, label: null, caption: "", text: "" };
  const line = firstLine(message.body);
  const kind = classify(message, line.length > 0);
  if (kind === "none" || kind === "text") {
    return { kind: "text", icon: null, label: null, caption: "", text: line };
  }
  const { key, icon } = LABEL_KEY[kind];
  const label = getInboxWorkspaceCopy(locale, key);
  // Deleted and unavailable replace the content; the other kinds keep a caption.
  const keepsCaption = kind !== "deleted" && kind !== "unavailable";
  const caption = keepsCaption ? line : "";
  return {
    kind,
    icon,
    label,
    caption,
    text: caption ? `${label}${CAPTION_SEPARATOR}${caption}` : label,
  };
}
