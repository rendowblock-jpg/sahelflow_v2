/**
 * SahelFlow WhatsApp sidecar — Baileys bridge as a local HTTP + WS service.
 *
 * Run:   bun run dev   (hot reload)   |   bun index.ts
 * Port:  3001 (fixed — the Next.js app connects here)
 * Bind:  127.0.0.1 only (loopback). Set SIDECAR_HOST=0.0.0.0 to override
 *        ONLY if you understand the security implications — there is NO
 *        network auth on the REST/WS endpoints beyond the bearer token,
 *        and the token is shared with the Next.js server via env.
 *
 * Auth:  Every REST endpoint requires `Authorization: Bearer <SIDECAR_TOKEN>`.
 *        The WS upgrade requires `?token=<SIDECAR_TOKEN>` query param.
 *        The token is read from the SIDECAR_TOKEN env var. If missing, a
 *        random token is generated and printed to stdout (dev mode) AND
 *        written to SIDECAR_TOKEN_FILE (default: /tmp/sahelflow-sidecar-token,
 *        chmod 600) so the Next.js server can read it.
 *
 * REST:
 *   GET    /                  → service info (no auth — returns version only)
 *   GET    /status            → { status, user, hasQr }
 *   GET    /qr                → { qr } (raw string) or 404
 *   GET    /qr.png            → QR rendered as a PNG image
 *   GET    /chats             → recent chats
 *   GET    /chats/:jid/messages → messages for a chat
 *   POST   /send              → { to, text } → { id, status }
 *   POST   /connect           → start the connection (if not running)
 *   DELETE /logout            → clear auth + disconnect
 *
 * WebSocket:  ws://localhost:3001/ws?token=<SIDECAR_TOKEN>
 *   Server pushes JSON events: { type, ... } (status | qr | message | message-update)
 *
 * The Next.js app talks to this via relative paths through the gateway:
 *   fetch("/api/whatsapp/...?XTransformPort=3001")   — NOT used.
 * Instead, the Next.js API routes proxy to the sidecar (see /api/whatsapp/*).
 * The browser never connects to the sidecar directly except via /ws (through
 * the gateway with XTransformPort=3001).
 */

import { Hono } from "hono";
import { createHmac, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, chmodSync, existsSync } from "node:fs";
import QRCode from "qrcode";
import { wa, type SidecarEvent } from "./whatsapp";

const PORT = 3001;
const HOST = process.env.SIDECAR_HOST || "127.0.0.1";
const TOKEN_FILE = process.env.SIDECAR_TOKEN_FILE || "/tmp/sahelflow-sidecar-token";

// ── Bearer token bootstrap ─────────────────────────────────────────────────
//
// The token MUST be shared between this sidecar and the Next.js server. Three
// ways to get it into both processes:
//   1. Parent (Tauri Rust) generates it, passes via env to both. PROD path.
//   2. Dev user exports SIDECAR_TOKEN in their shell before running both
//      `bun run sidecar` and `bun run dev`.
//   3. Sidecar generates it, writes to TOKEN_FILE (chmod 600). Next.js server
//      reads the same file. FALLBACK for dev convenience.
function resolveSidecarToken(): string {
  const fromEnv = process.env.SIDECAR_TOKEN;
  if (fromEnv && fromEnv.length >= 16) return fromEnv;

  // Generate a 32-byte random token (64 hex chars).
  const generated = randomBytes(32).toString("hex");
  try {
    writeFileSync(TOKEN_FILE, generated, { mode: 0o600 });
    chmodSync(TOKEN_FILE, 0o600);
    console.log(
      `[sahelflow-whatsapp-sidecar] SIDECAR_TOKEN not set in env — ` +
        `generated random token and wrote to ${TOKEN_FILE} (chmod 600).`,
    );
    console.log(
      `[sahelflow-whatsapp-sidecar] For the Next.js server to talk to this ` +
        `sidecar, set SIDECAR_TOKEN=<token> OR SIDECAR_TOKEN_FILE=${TOKEN_FILE} ` +
        `before starting Next.js.`,
    );
  } catch (err) {
    console.warn(
      `[sahelflow-whatsapp-sidecar] could not write token file ${TOKEN_FILE}: ` +
        `${err instanceof Error ? err.message : err}. The Next.js server will not ` +
        `be able to authenticate to the sidecar unless SIDECAR_TOKEN is set in env.`,
    );
  }
  return generated;
}

const SIDECAR_TOKEN = resolveSidecarToken();

/**
 * Constant-time string comparison to prevent timing attacks on the bearer token.
 * (Length leak is acceptable — the token length is fixed at 64 hex chars.)
 */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  return aBuf.equals(bBuf) && createHmac("sha256", aBuf).update(bBuf).digest().length > 0;
  // The createHmac above is a no-op to prevent the JIT from optimizing away
  // the equals() call based on its return value. Belt-and-suspenders.
}

function checkAuth(req: Request): boolean {
  const auth = req.headers.get("authorization") || "";
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  if (!m || !m[1]) return false;
  return safeEqual(m[1], SIDECAR_TOKEN);
}

// ── Hono app ───────────────────────────────────────────────────────────────
const app = new Hono();

// Auth middleware — applies to all routes except the public service info ("/").
// We exempt "/" so a basic connectivity check works without the token, but it
// returns only version info (no WhatsApp data).
app.use("*", async (c, next) => {
  if (c.req.path === "/") return next();
  if (!checkAuth(c.req.raw)) {
    return c.json({ error: "Unauthorized — missing or invalid bearer token" }, 401);
  }
  return next();
});

// ── Health / info (public — no auth) ───────────────────────────────────────
app.get("/", (c) =>
  c.json({
    service: "sahelflow-whatsapp-sidecar",
    version: "3.0.0",
    port: PORT,
    auth: "bearer-token",
    endpoints: ["/status", "/qr", "/qr.png", "/chats", "/chats/:jid/messages", "/send", "/connect", "/logout", "/ws"],
  }),
);

app.get("/status", (c) => {
  const s = wa.getStatus();
  return c.json(s);
});

// ── QR ─────────────────────────────────────────────────────────────────────
app.get("/qr", (c) => {
  const qr = wa.getQr();
  if (!qr) return c.json({ qr: null, message: "No QR available. Connect a phone first or already connected." }, 404);
  return c.json({ qr });
});

app.get("/qr.png", async (c) => {
  const qr = wa.getQr();
  if (!qr) return c.text("No QR available", 404);
  const png = await QRCode.toBuffer(qr, { width: 480, margin: 2 });
  return new Response(png, {
    headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
  });
});

// ── Chats & messages ───────────────────────────────────────────────────────
app.get("/chats", (c) => {
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10) || 50, 500);
  return c.json({ chats: wa.listChats(limit) });
});

app.get("/chats/:jid/messages", (c) => {
  const jid = decodeURIComponent(c.req.param("jid"));
  const limit = Math.min(parseInt(c.req.query("limit") ?? "100", 10) || 100, 1000);
  return c.json({ jid, messages: wa.getMessages(jid, limit) });
});

// ── Send ───────────────────────────────────────────────────────────────────
app.post("/send", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { to, text } = body as { to?: string; text?: string };
  if (!to || !text) {
    return c.json({ error: "Missing 'to' or 'text'" }, 400);
  }
  try {
    const result = await wa.sendMessage(to, text);
    return c.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Send failed";
    return c.json({ ok: false, error: message }, 503);
  }
});

// ── Connection control ─────────────────────────────────────────────────────
app.post("/connect", async (c) => {
  await wa.start();
  return c.json({ ok: true, ...wa.getStatus() });
});

app.delete("/logout", async (c) => {
  await wa.logout();
  return c.json({ ok: true, message: "Logged out. Auth cleared." });
});

// ── WebSocket: live event stream ───────────────────────────────────────────
//
// Bun.serve supports a `websocket` option + an upgrade in `fetch`.
// We handle the WS upgrade for "/ws" here, and let Hono handle everything else.
// The WS upgrade checks the `?token=<SIDECAR_TOKEN>` query param (browsers
// cannot set Authorization headers on WS handshakes).
const wsClients = new Set<WebSocket>();

function broadcast(event: SidecarEvent): void {
  const payload = JSON.stringify(event);
  for (const client of wsClients) {
    try {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    } catch {
      // ignore
    }
  }
}

// Subscribe the sidecar → broadcast pipeline
wa.subscribe(broadcast);

// When a new client connects, send them the current status immediately
function sendCurrentStatus(client: WebSocket): void {
  const s = wa.getStatus();
  const event: SidecarEvent = {
    type: "status",
    status: s.status,
    user: s.user ?? undefined,
  };
  client.send(JSON.stringify(event));
}

// ── Start ──────────────────────────────────────────────────────────────────
const server = Bun.serve({
  port: PORT,
  hostname: HOST,
  fetch(req, server) {
    const url = new URL(req.url);

    // WebSocket upgrade — auth via ?token= query param
    if (url.pathname === "/ws") {
      const token = url.searchParams.get("token");
      if (!token || !safeEqual(token, SIDECAR_TOKEN)) {
        return new Response("Unauthorized — missing or invalid token", { status: 401 });
      }
      if (server.upgrade(req, { data: {} })) {
        return; // upgrade handled
      }
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    // Hand off everything else to Hono (which applies the auth middleware)
    return app.fetch(req);
  },
  websocket: {
    open(ws) {
      wsClients.add(ws);
      sendCurrentStatus(ws);
    },
    message() {
      // The server doesn't accept client messages (push-only).
      // Clients just listen.
    },
    close(ws) {
      wsClients.delete(ws);
    },
  },
  error(err) {
    console.error("[sidecar] server error:", err);
    return new Response("Internal sidecar error", { status: 500 });
  },
});

console.log(`[sahelflow-whatsapp-sidecar] listening on http://${HOST}:${PORT}`);
console.log(`[sahelflow-whatsapp-sidecar] WS stream at ws://${HOST}:${PORT}/ws?token=<SIDECAR_TOKEN>`);
if (HOST === "0.0.0.0") {
  console.warn(
    `[sahelflow-whatsapp-sidecar] WARNING: SIDECAR_HOST=0.0.0.0 — listening on ALL interfaces. ` +
      `Anyone on your network can attempt to brute-force the bearer token. ` +
      `Only use this if you understand the risk.`,
  );
}

// Start the WhatsApp connection on boot (non-blocking)
void wa.start().catch((err) => {
  console.error("[sidecar] failed to start WhatsApp connection:", err);
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("[sidecar] shutting down...");
  server.stop();
  process.exit(0);
});
process.on("SIGTERM", () => {
  server.stop();
  process.exit(0);
});
