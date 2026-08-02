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

/** Extract the readable text from a Baileys message object. */
export function messageText(msg: IncomingMessage["message"]): string {
  if (!msg) return "";
  if (msg.conversation) return msg.conversation;
  if (msg.extendedTextMessage?.text) return msg.extendedTextMessage.text;
  // image/video/audio with caption
  const imageCaption = (msg as { imageMessage?: { caption?: string } }).imageMessage?.caption;
  if (imageCaption) return imageCaption;
  const videoCaption = (msg as { videoMessage?: { caption?: string } }).videoMessage?.caption;
  if (videoCaption) return videoCaption;
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
  const local = value.endsWith("@s.whatsapp.net")
    ? value.slice(0, -"@s.whatsapp.net".length).split(":")[0] ?? ""
    : value;
  let digits = local.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = `213${digits.slice(1)}`;
  if (!/^213[5-7]\d{8}$/.test(digits)) {
    throw new Error("WhatsApp recipient must be a valid Algerian mobile number");
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
