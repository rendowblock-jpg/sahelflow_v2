/**
 * WhatsAppManager — singleton wrapper around Baileys.
 *
 * Responsibilities:
 *   - Manage the WhatsApp Web socket connection (connect/reconnect/logout)
 *   - Persist auth creds to data/whatsapp-auth/ (survives restarts)
 *   - Maintain an in-memory chat + message store
 *   - Emit events to subscribers (the HTTP/WS layer subscribes)
 *
 * Event types:
 *   - { type: "status", status, user? }
 *   - { type: "qr", qr }                 // qr = raw string
 *   - { type: "message", message }
 *   - { type: "message-update", ids, update }
 *
 * Port-agnostic: this module knows nothing about HTTP. The index.ts wires it
 * to Hono + Bun.serve.
 */

import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeInMemoryStore,
  DisconnectReason,
  type WASocket,
  type proto,
  type AuthenticationCreds,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import P from "pino";
import { mkdirSync, rmSync, existsSync, chmodSync } from "fs";
import { join, resolve } from "path";

// Resolve data dir the same way the main app does
const DATA_DIR = process.env.SF_DATA_DIR ?? join(process.cwd(), "data");
const AUTH_FOLDER = resolve(DATA_DIR, "whatsapp-auth");

const logger = P({ level: process.env.SF_LOG_LEVEL ?? "warn", name: "wa" });

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
  message: { conversation?: string; extendedTextMessage?: { text?: string } } & Record<string, unknown>;
  messageTimestamp: number;
  pushName?: string;
}

export interface SidecarEvent {
  type: "status" | "qr" | "message" | "message-update";
  status?: ConnectionStatus;
  user?: WhatsAppUser;
  qr?: string;
  message?: IncomingMessage;
}

type Subscriber = (event: SidecarEvent) => void;

class WhatsAppManager {
  private sock: WASocket | null = null;
  private store: ReturnType<typeof makeInMemoryStore> | null = null;
  private status: ConnectionStatus = "disconnected";
  private user: WhatsAppUser | null = null;
  private currentQr: string | null = null;
  private subscribers = new Set<Subscriber>();
  private connecting = false;
  private reconnectAttempts = 0;

  /** Subscribe to events. Returns an unsubscribe function. */
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
    return { status: this.status, user: this.user, hasQr: this.currentQr !== null };
  }

  /** The raw QR string (null if none / already connected). */
  getQr(): string | null {
    return this.currentQr;
  }

  /** Start the connection. Idempotent — no-op if already connecting/connected. */
  async start(): Promise<void> {
    if (this.connecting || this.sock) return;
    this.connecting = true;
    await this.connect();
  }

  private async connect(): Promise<void> {
    this.status = "connecting";
    this.currentQr = null;
    this.emit({ type: "status", status: "connecting" });

    if (!existsSync(AUTH_FOLDER)) {
      // mode 0o700 — only the current user can read/write the WhatsApp auth
      // credentials (which would let another local process clone the session
      // and impersonate the user). The umask may relax this, so we chmod
      // explicitly after creation as well.
      mkdirSync(AUTH_FOLDER, { recursive: true, mode: 0o700 });
    }
    try {
      chmodSync(AUTH_FOLDER, 0o700);
    } catch {
      // best-effort — if chmod fails, the creds are still protected by the
      // directory's default permissions (typically 0755) and the sidecar's
      // 127.0.0.1 bind + bearer-token auth.
    }

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
    const { version } = await fetchLatestBaileysVersion();

    // In-memory chat/message cache. Rebuilds from WhatsApp's history sync on
    // reconnect — no file persistence needed (the creds file is the source of
    // truth for auth; the store is just a runtime cache).
    this.store = makeInMemoryStore({ logger });

    this.sock = makeWASocket({
      version,
      auth: state as unknown as AuthenticationCreds,
      logger,
      printQRInTerminal: false,
      browser: ["SahelFlow", "Chrome", "3.0.0"],
      markOnlineOnConnect: false,
      getMessage: async (key) => {
        if (this.store) {
          const msg = await this.store.loadMessage(key.remoteJid ?? "", key.id ?? "");
          return (msg?.message ?? undefined) as proto.IMessage | undefined;
        }
        return undefined;
      },
    });

    // Bind store to the socket events
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
        this.emit({ type: "status", status: "connected", user: this.user ?? undefined });
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
          // Logged out — clear auth so a fresh QR is generated
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
          logger.warn({ code, attempt: this.reconnectAttempts, delay }, "reconnecting");
          setTimeout(() => void this.connect(), delay);
        } else {
          this.status = "disconnected";
          this.emit({ type: "status", status: "disconnected" });
          logger.error({ code }, "gave up reconnecting");
        }
      }
    });

    this.sock.ev.on("messages.upsert", ({ messages, type }) => {
      // type === 'notify' = new messages; 'append' = history sync
      if (type !== "notify") return;
      for (const m of messages) {
        const incoming = this.toIncoming(m);
        if (!incoming) continue;
        this.emit({ type: "message", message: incoming });
      }
    });

    this.sock.ev.on("messages.update", (updates) => {
      const ids = updates
        .filter((u) => u.key.remoteJid && u.key.id)
        .map((u) => ({ jid: u.key.remoteJid ?? "", id: u.key.id ?? "", update: u.update ?? {} }));
      if (ids.length) {
        this.emit({ type: "message-update", message: { key: { remoteJid: "", fromMe: false, id: "" }, message: {}, messageTimestamp: 0 } });
        void ids; // (event shape kept simple; WS consumers re-fetch)
      }
    });

    this.connecting = false;
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

  /** Send a text message. Accepts a phone (local or intl) or a JID. */
  async sendMessage(to: string, text: string): Promise<{ id: string; status: string }> {
    if (!this.sock || this.status !== "connected") {
      throw new Error(`Not connected (status=${this.status})`);
    }
    const jid = this.toJid(to);
    const sent = await this.sock.sendMessage(jid, { text });
    return {
      id: sent?.key?.id ?? "",
      status: sent?.status ?? "sent",
    };
  }

  /** List recent chats from the in-memory store. */
  listChats(limit = 50): Array<{
    jid: string;
    name: string;
    lastMessage?: { text: string; timestamp: number; fromMe: boolean };
    unread: number;
  }> {
    if (!this.store) return [];
    const chats = this.store.chats.all();
    return chats
      .slice(0, limit)
      .map((c) => {
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
                timestamp: typeof last.messageTimestamp === "number"
                  ? (last.messageTimestamp as number)
                  : 0,
                fromMe: last.key?.fromMe ?? false,
              }
            : undefined,
          unread: c.unreadCount ?? 0,
        };
      });
  }

  /** Get messages for a chat from the in-memory store. */
  getMessages(jid: string, limit = 100): IncomingMessage[] {
    if (!this.store) return [];
    const arr = this.store.messages[jid]?.array ?? [];
    return arr
      .slice(-limit)
      .map((m) => this.toIncoming(m))
      .filter((m): m is IncomingMessage => m !== null);
  }

  /** Logout: clear auth + disconnect. Next start() generates a fresh QR. */
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
      if (existsSync(AUTH_FOLDER)) {
        rmSync(AUTH_FOLDER, { recursive: true, force: true });
      }
    } catch {
      /* best effort */
    }
  }

  /** Normalize a phone number or JID to a WhatsApp JID. */
  private toJid(input: string): string {
    const trimmed = input.trim();
    if (trimmed.includes("@")) return trimmed; // already a JID
    // Strip everything but digits
    let digits = trimmed.replace(/\D/g, "");
    // Algeria: local 0XXXXXXXXX → 213XXXXXXXXX
    if (digits.startsWith("0")) {
      digits = "213" + digits.slice(1);
    }
    return `${digits}@s.whatsapp.net`;
  }
}

// Singleton
export const wa = new WhatsAppManager();
