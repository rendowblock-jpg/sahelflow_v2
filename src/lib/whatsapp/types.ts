/**
 * Shared types between the sidecar and the Next.js app.
 * Mirrors the sidecar's `whatsapp.ts` shapes (kept here so the Next.js
 * type-check doesn't need the sidecar's deps).
 */

export type WhatsAppStatus = "disconnected" | "connecting" | "qr" | "connected";

export interface WhatsAppUser {
  id: string;
  name?: string;
}

export interface SidecarStatus {
  status: WhatsAppStatus;
  user: WhatsAppUser | null;
  hasQr: boolean;
}

export interface InboxLocalMediaProjection {
  state: "pending" | "ready" | "failed";
  /** Same-origin canonical Message status projection used only while pending. */
  statusUrl?: string;
  readUrl?: string;
  downloadUrl?: string;
  /** Derived bounded JPEG variant (#317); may 404 when none was generated. */
  thumbnailUrl?: string;
}

export type ProjectedWhatsAppAttachment =
  import("./message-attachments").WhatsAppMessageAttachment & {
    /** Local-only seller read authority. Never populated by the provider. */
    localMedia?: InboxLocalMediaProjection;
  };

export interface IncomingMessage {
  key: {
    remoteJid: string;
    fromMe: boolean;
    id: string;
    participant?: string;
  };
  message: { conversation?: string; extendedTextMessage?: { text?: string } } & Record<string, unknown>;
  messageTimestamp: number;
  pushName?: string;
  /** Durable local status, present when the app merged a persisted outbound row. */
  deliveryStatus?: "sending" | "sent" | "delivered" | "read" | "failed";
  /** Local durable effect identity/state; never supplied by the provider. */
  effectKey?: string;
  effectState?: "queued" | "processing" | "retrying" | "succeeded" | "ambiguous" | "dead_letter";
  /** Protected canonical attachment projection supplied by the app, never raw provider paths. */
  attachment?: ProjectedWhatsAppAttachment | null;
}

export interface SidecarChat {
  jid: string;
  name: string;
  lastMessage?: { text: string; timestamp: number; fromMe: boolean };
  unread: number;
}

export interface SidecarEvent {
  type: "status" | "qr" | "message" | "message-update";
  status?: WhatsAppStatus;
  user?: WhatsAppUser;
  qr?: string;
  message?: IncomingMessage;
  /** Session 30 (AUDIT-6 I4): message-update events carry the actual updates. */
  updates?: Array<{ jid: string; id: string; fromMe: boolean; update: Record<string, unknown> }>;
}

const MESSAGE_WRAPPER_FIELDS = [
  "ephemeralMessage",
  "viewOnceMessage",
  "viewOnceMessageV2",
  "viewOnceMessageV2Extension",
  "documentWithCaptionMessage",
  "editedMessage",
] as const;

function messageRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Boundedly unwrap Baileys future-proof message containers before classifying,
 * extracting text, or persisting attachment metadata. This never follows URLs
 * or provider retrieval fields and stops on cycles or after eight wrappers.
 */
export function normalizeWhatsAppMessageContent(
  message: IncomingMessage["message"],
): IncomingMessage["message"] {
  let current = message as Record<string, unknown>;
  const seen = new Set<Record<string, unknown>>();
  for (let depth = 0; depth < 8; depth += 1) {
    if (seen.has(current)) break;
    seen.add(current);

    let next: Record<string, unknown> | null = null;
    for (const field of MESSAGE_WRAPPER_FIELDS) {
      const wrapper = messageRecord(current[field]);
      if (!wrapper) continue;
      next = messageRecord(wrapper.message) ?? wrapper;
      break;
    }
    if (!next) {
      const protocol = messageRecord(current.protocolMessage);
      next = messageRecord(protocol?.editedMessage);
    }
    if (!next) break;
    current = next;
  }
  return current as IncomingMessage["message"];
}

/** Extract the readable text from a Baileys message object. */
export function messageText(msg: IncomingMessage["message"]): string {
  if (!msg) return "";
  msg = normalizeWhatsAppMessageContent(msg);
  if (msg.conversation) return msg.conversation;
  if (msg.extendedTextMessage?.text) return msg.extendedTextMessage.text;
  // media with caption
  const imageCaption = (msg as { imageMessage?: { caption?: string } }).imageMessage?.caption;
  if (imageCaption) return imageCaption;
  const videoCaption = (msg as { videoMessage?: { caption?: string } }).videoMessage?.caption;
  if (videoCaption) return videoCaption;
  const documentCaption = (msg as { documentMessage?: { caption?: string } })
    .documentMessage?.caption;
  if (documentCaption) return documentCaption;
  return "";
}

/** Pretty-print a JID as a phone number. */
export function jidToPhone(jid: string): string {
  return jid.replace(/@.+$/, "").replace(/^213/, "0");
}

/**
 * Normalize an Algerian phone number or an existing WhatsApp JID to the exact
 * individual-chat JID used by both the app and sidecar. Group/broadcast JIDs
 * are intentionally rejected by the durable text-send vertical.
 */
export function normalizeWhatsAppJid(input: string): string {
  const value = input.trim();
  // WhatsApp now exposes some individual chats through a privacy-preserving
  // LID instead of the contact's phone-number JID. Preserve that provider
  // identity exactly so a reply stays in the inbound conversation. Groups,
  // broadcasts and every other opaque JID domain remain rejected.
  if (/^[1-9]\d{0,19}@lid$/.test(value)) return value;
  if (value.includes("@") && !value.endsWith("@s.whatsapp.net")) {
    throw new Error("Unsupported WhatsApp recipient JID domain");
  }
  const local = value.endsWith("@s.whatsapp.net")
    ? value.slice(0, -"@s.whatsapp.net".length).split(":")[0] ?? ""
    : value;
  let digits = local.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = `213${digits.slice(1)}`;
  if (!/^213[5-7]\d{8}$/.test(digits)) {
    throw new Error(
      "WhatsApp recipient must be a valid Algerian mobile number or individual LID",
    );
  }
  return `${digits}@s.whatsapp.net`;
}

/** Format a WhatsApp timestamp (unix seconds) for display. */
export function formatMessageTime(ts: number): string {
  if (!ts) return "";
  return new Date(ts * 1000).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
