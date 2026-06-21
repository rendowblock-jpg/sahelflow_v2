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

/** Format a WhatsApp timestamp (unix seconds) for display. */
export function formatMessageTime(ts: number): string {
  if (!ts) return "";
  return new Date(ts * 1000).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
