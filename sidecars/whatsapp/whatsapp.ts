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

import {
  makeWASocket,
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
import { mkdirSync, rmSync, existsSync, chmodSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { tmpdir } from "os";

// Resolve data dir the same way the main app does
const DATA_DIR = process.env.SF_DATA_DIR ?? join(process.cwd(), "data");
const AUTH_FOLDER = resolve(DATA_DIR, "whatsapp-auth");

const logger = P({ level: process.env.SF_LOG_LEVEL ?? "warn", name: "wa" });

// ─── W3-12: message delivery-ack persistence ─────────────────────────────────
//
// The sidecar emits message-update events via WS (the browser updates the UI
// optimistically), but failed-message status is ephemeral — a page reload
// loses it. To persist failures (so the seller sees a red indicator even
// after reloading the inbox), the sidecar POSTs delivery-ack updates to the
// Next.js app's /api/whatsapp/message-status endpoint.
//
// Auth: the sidecar sends its SIDECAR_TOKEN as a Bearer header (the same
// token the Next.js app uses to call the sidecar). The endpoint verifies it.
//
// Fire-and-forget: a failed POST (Next.js app down, network error) is logged
// but never breaks the sidecar's event loop. The POST is non-blocking
// (void, not awaited) so the WS emission + in-memory store update stay fast.

/** Next.js app base URL (where /api/whatsapp/message-status lives). */
const APP_URL =
  process.env.SF_APP_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  "http://localhost:3000";

/**
 * Resolve the sidecar bearer token — same logic as index.ts (env > file).
 * Lazy: read on first use so the token file (written by index.ts on boot)
 * exists by the time a message-update event fires.
 */
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
    // token file not written yet / unreadable — POST will go out unauth'd
    // and the endpoint will 401. Acceptable: the WS event still updates the
    // UI optimistically; only DB persistence is skipped.
  }
  return undefined;
}

/**
 * Map a Baileys message-status (proto number or string) to our deliveryStatus
 * enum (matches the MessageStatus component + Message.deliveryStatus field).
 * Baileys: PENDING=0, SENT=1, DELIVERY_ACK=2, READ=3, PLAYED=4.
 */
function mapBaileysStatus(status: unknown): string | null {
  if (status === undefined || status === null) return null;
  const s = typeof status === "number" ? status : String(status).toUpperCase();
  if (s === 0 || s === "PENDING") return "sending";
  if (s === 1 || s === "SENT") return "sent";
  if (s === 2 || s === "DELIVERY" || s === "DELIVERY_ACK" || s === "DELIVERED") return "delivered";
  if (s === 3 || s === "READ") return "read";
  if (s === 4 || s === "PLAYED") return "read"; // treat PLAYED as READ
  return null;
}

/**
 * POST a delivery-ack update to the Next.js app for DB persistence.
 * Fire-and-forget (caller does `void postMessageStatus(...)`). Never throws.
 */
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
  if (token) headers["Authorization"] = `Bearer ${token}`;
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
    // Next.js app down / network error — log + swallow. The WS event still
    // reached the browser; only DB persistence is lost for this update.
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
  message: { conversation?: string; extendedTextMessage?: { text?: string } } & Record<string, unknown>;
  messageTimestamp: number;
  pushName?: string;
}

export interface SidecarEvent {
  type: "status" | "qr" | "message" | "message-update";
  // Session 30 (AUDIT-6 I4): message-update now carries the actual updates
  // (was a hardcoded empty message object).
  updates?: Array<{ jid: string; id: string; fromMe: boolean; update: Record<string, unknown> }>;
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

    // Session 30 (AUDIT-6 I4): emit the ACTUAL update data (not empty).
    // Previously this emitted a hardcoded empty message object — consumers
    // (the dashboard WS hook) had no way to know which message was updated
    // or what the new status was. Now we emit { updates: [{ jid, id, update }] }.
    this.sock.ev.on("messages.update", (updates) => {
      const updateList = updates
        .filter((u) => u.key.remoteJid && u.key.id)
        .map((u) => ({
          jid: u.key.remoteJid ?? "",
          id: u.key.id ?? "",
          fromMe: u.key.fromMe ?? false,
          update: u.update ?? {},
        }));
      if (updateList.length) {
        this.emit({ type: "message-update", updates: updateList } as SidecarEvent);
      }

      // W3-12: persist delivery-ack updates (esp. failures) to the Next.js
      // app's DB so they survive inbox reloads. We POST for OUTBOUND messages
      // (fromMe=true) only — inbound message status isn't a delivery ack we
      // track. Failures (update.error present) always POST; status changes
      // (sent/delivered/read) POST too so the DB stays in sync if/when
      // WhatsApp messages are persisted to Message rows.
      for (const u of updates) {
        if (!u.key.fromMe) continue;
        const upd = u.update ?? {};
        const hasError = upd.error !== undefined && upd.error !== null;
        const mappedStatus = mapBaileysStatus(upd.status);
        if (hasError) {
          // Failure — always surface to the app for audit logging +
          // best-effort Message row update.
          void postMessageStatus({
            waMessageId: u.key.id ?? "",
            jid: u.key.remoteJid ?? "",
            fromMe: true,
            deliveryStatus: "failed",
            error: String(upd.error),
          });
        } else if (mappedStatus) {
          // Status change (sent → delivered → read). POST so the endpoint
          // can update a matching Message row if one exists.
          void postMessageStatus({
            waMessageId: u.key.id ?? "",
            jid: u.key.remoteJid ?? "",
            fromMe: true,
            deliveryStatus: mappedStatus,
          });
        }
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
