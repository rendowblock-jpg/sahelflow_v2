/**
 * WhatsAppManager — singleton wrapper around Baileys.
 *
 * Responsibilities:
 *   - Manage the WhatsApp Web socket connection (connect/reconnect/logout)
 *   - Persist protected auth credentials across restarts
 *   - Maintain an in-memory chat + message store
 *   - Emit events to subscribers (the HTTP/WS layer subscribes)
 */

import {
  makeWASocket,
  fetchLatestWaWebVersion,
  makeInMemoryStore,
  DisconnectReason,
  downloadMediaMessage,
  type WASocket,
  type proto,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import P from "pino";
import { readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import {
  clearProtectedWhatsAppAuthState,
  useProtectedWhatsAppAuthState,
} from "./protected-auth-state";

const WA_VERSION_LOOKUP_TIMEOUT_MS = 10_000;
// Voice/audio outbound shares the 32 MiB encrypted-storage audio ceiling.
const MAX_OUTBOUND_VOICE_BYTES = 32 * 1024 * 1024;

const logger = P({ level: process.env.SF_LOG_LEVEL ?? "warn", name: "wa" });

const APP_URL =
  process.env.SF_APP_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  "http://localhost:3000";

function getSidecarToken(): string | undefined {
  const fromEnv = process.env.SIDECAR_TOKEN;
  if (fromEnv && fromEnv.length >= 16) return fromEnv;
  const tokenFile =
    process.env.SIDECAR_TOKEN_FILE ??
    join(tmpdir(), "sahelflow-sidecar-token");
  try {
    const fromFile = readFileSync(tokenFile, "utf8").trim();
    if (fromFile.length >= 16) return fromFile;
  } catch {
    // The sidecar may still be starting. Live WS delivery remains available;
    // only best-effort status persistence is skipped until the token exists.
  }
  return undefined;
}

function mapBaileysStatus(status: unknown): string | null {
  if (status === undefined || status === null) return null;
  const s = typeof status === "number" ? status : String(status).toUpperCase();
  if (s === 0 || s === "PENDING") return "sending";
  if (s === 1 || s === "SENT") return "sent";
  if (
    s === 2 ||
    s === "DELIVERY" ||
    s === "DELIVERY_ACK" ||
    s === "DELIVERED"
  ) {
    return "delivered";
  }
  if (s === 3 || s === "READ" || s === 4 || s === "PLAYED") return "read";
  return null;
}

async function postMessageStatus(payload: {
  waMessageId: string;
  jid: string;
  fromMe: boolean;
  deliveryStatus: string;
  error?: string;
}): Promise<void> {
  const token = getSidecarToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    try {
      await fetch(`${APP_URL}/api/whatsapp/message-status`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    logger.warn({ err }, "[W3-12] failed to POST message-status to app");
  }
}

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "qr"
  | "connected";

export interface WhatsAppUser {
  id: string;
  name?: string;
}

export interface IncomingMessage {
  key: {
    remoteJid: string;
    fromMe: boolean;
    id: string;
    participant?: string;
  };
  message: {
    conversation?: string;
    extendedTextMessage?: { text?: string };
  } & Record<string, unknown>;
  messageTimestamp: number;
  pushName?: string;
}

export interface SidecarEvent {
  type: "status" | "qr" | "message" | "message-update";
  updates?: Array<{
    jid: string;
    id: string;
    fromMe: boolean;
    update: Record<string, unknown>;
  }>;
  status?: ConnectionStatus;
  user?: WhatsAppUser;
  qr?: string;
  message?: IncomingMessage;
}

type Subscriber = (event: SidecarEvent) => void;

export class WhatsAppManager {
  private sock: WASocket | null = null;
  private store: ReturnType<typeof makeInMemoryStore> | null = null;
  private status: ConnectionStatus = "disconnected";
  private user: WhatsAppUser | null = null;
  private currentQr: string | null = null;
  private subscribers = new Set<Subscriber>();
  private connecting = false;
  private reconnectAttempts = 0;

  subscribe(fn: Subscriber): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  private emit(event: SidecarEvent): void {
    for (const fn of this.subscribers) {
      try {
        fn(event);
      } catch (err) {
        logger.error({ err }, "subscriber threw");
      }
    }
  }

  getStatus(): {
    status: ConnectionStatus;
    user: WhatsAppUser | null;
    hasQr: boolean;
  } {
    return {
      status: this.status,
      user: this.user,
      hasQr: this.currentQr !== null,
    };
  }

  getQr(): string | null {
    return this.currentQr;
  }

  async start(): Promise<void> {
    if (this.connecting || this.sock) return;
    this.connecting = true;
    try {
      await this.connect();
    } catch (error) {
      // A failed setup must be both retryable and truthful. Do not leave the
      // UI indefinitely reporting "connecting" after no socket was created.
      this.sock = null;
      this.status = "disconnected";
      this.user = null;
      this.currentQr = null;
      this.emit({ type: "status", status: "disconnected" });
      throw error;
    } finally {
      this.connecting = false;
    }
  }

  private async connect(): Promise<void> {
    this.status = "connecting";
    this.currentQr = null;
    this.emit({ type: "status", status: "connecting" });

    const { state, saveCreds } = await useProtectedWhatsAppAuthState();
    const versionResult = await fetchLatestWaWebVersion({
      signal: AbortSignal.timeout(WA_VERSION_LOOKUP_TIMEOUT_MS),
    });

    // Fresh device linking is version-sensitive. Current Baileys has had cases
    // where its repository/default version was accepted far enough to show a QR
    // but WhatsApp refused the final link. For an unregistered session, fail
    // truthfully rather than display a QR produced with an unverified fallback.
    if (!versionResult.isLatest && !state.creds.registered) {
      throw new Error("Current WhatsApp Web version could not be verified for device pairing");
    }
    if (!versionResult.isLatest) {
      logger.warn(
        { version: versionResult.version },
        "using Baileys fallback version for an already registered WhatsApp session",
      );
    }
    const version = versionResult.version;

    this.store = makeInMemoryStore({ logger });

    this.sock = makeWASocket({
      version,
      auth: state,
      logger,
      printQRInTerminal: false,
      browser: ["SahelFlow", "Chrome", "3.0.0"],
      markOnlineOnConnect: false,
      getMessage: async (key) => {
        if (this.store) {
          const msg = await this.store.loadMessage(
            key.remoteJid ?? "",
            key.id ?? "",
          );
          return (msg?.message ?? undefined) as proto.IMessage | undefined;
        }
        return undefined;
      },
    });

    this.store.bind(this.sock.ev);
    this.sock.ev.on("creds.update", saveCreds);

    this.sock.ev.on("connection.update", (update) => {
      const { connection, qr, lastDisconnect } = update;

      if (qr) {
        this.currentQr = qr;
        this.status = "qr";
        this.emit({ type: "qr", qr });
      }

      if (connection === "open") {
        this.currentQr = null;
        this.status = "connected";
        this.reconnectAttempts = 0;
        const u = this.sock?.user;
        this.user = u
          ? { id: u.id ?? "", name: u.name ?? undefined }
          : null;
        this.emit({
          type: "status",
          status: "connected",
          user: this.user ?? undefined,
        });
        logger.info({ user: this.user }, "connected");
      }

      if (connection === "close") {
        const code = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const shouldReconnect =
          code !== DisconnectReason.loggedOut &&
          code !== 401 &&
          this.reconnectAttempts < 5;

        this.sock = null;
        if (code === DisconnectReason.loggedOut || code === 401) {
          this.clearAuth();
          this.status = "disconnected";
          this.user = null;
          this.emit({ type: "status", status: "disconnected" });
          logger.warn("logged out — auth cleared");
        } else if (shouldReconnect) {
          this.reconnectAttempts++;
          const delay = Math.min(2000 * this.reconnectAttempts, 15000);
          this.status = "connecting";
          this.emit({ type: "status", status: "connecting" });
          logger.warn(
            { code, attempt: this.reconnectAttempts, delay },
            "reconnecting",
          );
          setTimeout(() => void this.connect(), delay);
        } else {
          this.status = "disconnected";
          this.emit({ type: "status", status: "disconnected" });
          logger.error({ code }, "gave up reconnecting");
        }
      }
    });

    this.sock.ev.on("messages.upsert", ({ messages, type }) => {
      if (type !== "notify") return;
      for (const m of messages) {
        const incoming = this.toIncoming(m);
        if (!incoming) continue;
        this.emit({ type: "message", message: incoming });
      }
    });

    this.sock.ev.on("messages.update", (updates) => {
      const updateList = updates
        .filter((u) => u.key.remoteJid && u.key.id)
        .map((u) => ({
          jid: u.key.remoteJid ?? "",
          id: u.key.id ?? "",
          fromMe: u.key.fromMe ?? false,
          update: (u.update ?? {}) as Record<string, unknown>,
        }));
      if (updateList.length) {
        this.emit({
          type: "message-update",
          updates: updateList,
        } as SidecarEvent);
      }

      for (const u of updates) {
        if (!u.key.fromMe) continue;
        const upd = (u.update ?? {}) as Record<string, unknown>;
        const providerError = upd.error;
        const hasError = providerError !== undefined && providerError !== null;
        const mappedStatus = mapBaileysStatus(upd.status);
        if (hasError) {
          void postMessageStatus({
            waMessageId: u.key.id ?? "",
            jid: u.key.remoteJid ?? "",
            fromMe: true,
            deliveryStatus: "failed",
            error: String(providerError),
          });
        } else if (mappedStatus) {
          void postMessageStatus({
            waMessageId: u.key.id ?? "",
            jid: u.key.remoteJid ?? "",
            fromMe: true,
            deliveryStatus: mappedStatus,
          });
        }
      }
    });
  }

  private toIncoming(m: proto.IWebMessageInfo): IncomingMessage | null {
    const key = m.key;
    if (!key?.remoteJid) return null;
    return {
      key: {
        remoteJid: key.remoteJid,
        fromMe: key.fromMe ?? false,
        id: key.id ?? "",
        participant: key.participant ?? undefined,
      },
      message: (m.message ?? {}) as IncomingMessage["message"],
      messageTimestamp:
        typeof m.messageTimestamp === "number"
          ? m.messageTimestamp
          : typeof m.messageTimestamp === "object" && m.messageTimestamp
            ? (m.messageTimestamp as { low?: number }).low ?? 0
            : 0,
      pushName: m.pushName ?? undefined,
    };
  }

  async sendMessage(
    to: string,
    text: string,
    messageId?: string,
  ): Promise<{ id: string; status: string }> {
    if (!this.sock || this.status !== "connected") {
      throw new Error(`Not connected (status=${this.status})`);
    }
    const jid = this.toJid(to);
    const sent = await this.sock.sendMessage(
      jid,
      { text },
      messageId ? { messageId } : undefined,
    );
    return {
      id: sent?.key?.id ?? "",
      status: String(sent?.status ?? "sent"),
    };
  }

  async sendImage(
    to: string,
    image: Uint8Array,
    mimetype: string,
    caption: string,
    messageId?: string,
  ): Promise<{ id: string; status: string }> {
    if (!this.sock || this.status !== "connected") {
      throw new Error(`Not connected (status=${this.status})`);
    }
    if (!/^(image\/(?:jpeg|png|webp))$/i.test(mimetype) || image.byteLength <= 0) {
      throw new Error("Image send requires bounded JPEG, PNG or WebP bytes");
    }
    const jid = this.toJid(to);
    const sent = await this.sock.sendMessage(
      jid,
      {
        image: Buffer.from(image.buffer, image.byteOffset, image.byteLength),
        mimetype: mimetype.toLowerCase(),
        ...(caption ? { caption } : {}),
      },
      messageId ? { messageId } : undefined,
    );
    return {
      id: sent?.key?.id ?? "",
      status: String(sent?.status ?? "sent"),
    };
  }

  async sendVideo(
    to: string,
    video: Uint8Array,
    mimetype: string,
    caption: string,
    messageId?: string,
  ): Promise<{ id: string; status: string }> {
    if (!this.sock || this.status !== "connected") {
      throw new Error(`Not connected (status=${this.status})`);
    }
    if (mimetype.toLowerCase() !== "video/mp4" || video.byteLength <= 0) {
      throw new Error("Video send requires bounded MP4 bytes");
    }
    const jid = this.toJid(to);
    const sent = await this.sock.sendMessage(
      jid,
      {
        video: Buffer.from(video.buffer, video.byteOffset, video.byteLength),
        mimetype: "video/mp4",
        ...(caption ? { caption } : {}),
      },
      messageId ? { messageId } : undefined,
    );
    return {
      id: sent?.key?.id ?? "",
      status: String(sent?.status ?? "sent"),
    };
  }

  async sendDocument(
    to: string,
    document: Uint8Array,
    mimetype: string,
    fileName: string,
    caption: string,
    messageId?: string,
  ): Promise<{ id: string; status: string }> {
    if (!this.sock || this.status !== "connected") {
      throw new Error(`Not connected (status=${this.status})`);
    }
    // The media type is the authenticated sniffed classification from the
    // encrypted storage authority; the title is the bounded safe file name.
    const normalizedType = mimetype.toLowerCase();
    if (
      !/^(application\/(?:pdf|zip|x-ole-storage)|text\/plain)$/.test(
        normalizedType,
      ) ||
      document.byteLength <= 0 ||
      !fileName ||
      fileName.length > 180
    ) {
      throw new Error("Document send requires bounded classified bytes and a file name");
    }
    const jid = this.toJid(to);
    const sent = await this.sock.sendMessage(
      jid,
      {
        document: Buffer.from(
          document.buffer,
          document.byteOffset,
          document.byteLength,
        ),
        mimetype: normalizedType,
        fileName,
        ...(caption ? { caption } : {}),
      },
      messageId ? { messageId } : undefined,
    );
    return {
      id: sent?.key?.id ?? "",
      status: String(sent?.status ?? "sent"),
    };
  }

  async sendVoice(
    to: string,
    audio: Uint8Array,
    mimetype: string,
    voiceMessage: boolean,
    durationSeconds: number | null,
    messageId?: string,
  ): Promise<{ id: string; status: string }> {
    if (!this.sock || this.status !== "connected") {
      throw new Error(`Not connected (status=${this.status})`);
    }
    // The media type is the authenticated sniffed classification from the
    // encrypted storage authority. A WhatsApp voice note (PTT) is only ever
    // the canonical OGG/Opus provider form; every other authenticated audio
    // container is sent as a plain audio attachment.
    const normalizedType = mimetype.toLowerCase();
    if (
      !/^audio\/(?:ogg|wav|mpeg|aac|mp4)$/.test(normalizedType) ||
      audio.byteLength <= 0 ||
      audio.byteLength > MAX_OUTBOUND_VOICE_BYTES
    ) {
      throw new Error("Voice send requires bounded classified audio bytes");
    }
    if (voiceMessage && normalizedType !== "audio/ogg") {
      throw new Error("WhatsApp voice notes require authenticated OGG/Opus audio");
    }
    const jid = this.toJid(to);
    const sent = await this.sock.sendMessage(
      jid,
      {
        audio: Buffer.from(audio.buffer, audio.byteOffset, audio.byteLength),
        mimetype: voiceMessage ? "audio/ogg; codecs=opus" : normalizedType,
        ptt: voiceMessage,
        // Baileys forwards this as the provider `seconds` field; a
        // value authenticated from the staged bytes keeps recipient
        // duration display truthful.
        ...(durationSeconds ? { seconds: durationSeconds } : {}),
      },
      messageId ? { messageId } : undefined,
    );
    return {
      id: sent?.key?.id ?? "",
      status: String(sent?.status ?? "sent"),
    };
  }

  async downloadMedia(message: IncomingMessage): Promise<AsyncIterable<Uint8Array>> {
    if (!this.sock || this.status !== "connected") {
      throw new Error(`Not connected (status=${this.status})`);
    }
    if (message.key.fromMe || !message.key.remoteJid || !message.key.id) {
      throw new Error("Media download requires an exact inbound WhatsApp message identity");
    }
    const activeSocket = this.sock;
    const downloaded = await downloadMediaMessage(
      message as proto.IWebMessageInfo,
      "stream",
      {},
      {
        logger,
        reuploadRequest: (providerMessage) =>
          activeSocket.updateMediaMessage(providerMessage),
      },
    );
    if (Buffer.isBuffer(downloaded)) {
      throw new Error("Baileys returned a buffer for a stream media request");
    }
    return downloaded as unknown as AsyncIterable<Uint8Array>;
  }

  listChats(limit = 50): Array<{
    jid: string;
    name: string;
    lastMessage?: { text: string; timestamp: number; fromMe: boolean };
    unread: number;
  }> {
    if (!this.store) return [];
    const chats = this.store.chats.all();
    return chats.slice(0, limit).map((c) => {
      const msgs = this.store?.messages[c.id]?.array ?? [];
      const last = msgs[msgs.length - 1];
      const lastText =
        last?.message?.conversation ??
        last?.message?.extendedTextMessage?.text ??
        "";
      return {
        jid: c.id,
        name: c.name ?? c.id,
        lastMessage: last
          ? {
              text: lastText,
              timestamp:
                typeof last.messageTimestamp === "number"
                  ? (last.messageTimestamp as number)
                  : 0,
              fromMe: last.key?.fromMe ?? false,
            }
          : undefined,
        unread: c.unreadCount ?? 0,
      };
    });
  }

  getMessages(jid: string, limit = 100): IncomingMessage[] {
    if (!this.store) return [];
    const arr = this.store.messages[jid]?.array ?? [];
    return arr
      .slice(-limit)
      .map((m) => this.toIncoming(m))
      .filter((m): m is IncomingMessage => m !== null);
  }

  async logout(): Promise<void> {
    if (this.sock) {
      try {
        await this.sock.logout();
      } catch {
        // best effort
      }
      this.sock = null;
    }
    this.clearAuth();
    this.status = "disconnected";
    this.user = null;
    this.currentQr = null;
    this.emit({ type: "status", status: "disconnected" });
  }

  private clearAuth(): void {
    try {
      clearProtectedWhatsAppAuthState();
    } catch {
      // best effort
    }
  }

  private toJid(input: string): string {
    const trimmed = input.trim();
    if (trimmed.includes("@")) return trimmed;
    let digits = trimmed.replace(/\D/g, "");
    if (digits.startsWith("0")) {
      digits = "213" + digits.slice(1);
    }
    return `${digits}@s.whatsapp.net`;
  }
}

export const wa = new WhatsAppManager();
