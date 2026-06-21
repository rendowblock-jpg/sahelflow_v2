/**
 * SahelFlow WhatsApp sidecar — Baileys bridge as a local HTTP + WS service.
 *
 * Run:   bun run dev   (hot reload)   |   bun index.ts
 * Port:  3001 (fixed — the Next.js app connects here)
 *
 * REST:
 *   GET    /                  → service info
 *   GET    /status            → { status, user, hasQr }
 *   GET    /qr                → { qr } (raw string) or 404
 *   GET    /qr.png            → QR rendered as a PNG image
 *   GET    /chats             → recent chats
 *   GET    /chats/:jid/messages → messages for a chat
 *   POST   /send              → { to, text } → { id, status }
 *   POST   /connect           → start the connection (if not running)
 *   DELETE /logout            → clear auth + disconnect
 *
 * WebSocket:  ws://localhost:3001/ws
 *   Server pushes JSON events: { type, ... } (status | qr | message | message-update)
 *
 * The Next.js app talks to this via relative paths through the gateway:
 *   fetch("/api/whatsapp/...?XTransformPort=3001")   — NOT used.
 * Instead, the Next.js API routes proxy to the sidecar (see /api/whatsapp/*).
 * The browser never connects to the sidecar directly except via /ws (through
 * the gateway with XTransformPort=3001).
 */

import { Hono } from "hono";
import QRCode from "qrcode";
import { wa, type SidecarEvent } from "./whatsapp";

const PORT = 3001;

const app = new Hono();

// ── Health / info ──────────────────────────────────────────────────────────
app.get("/", (c) =>
  c.json({
    service: "sahelflow-whatsapp-sidecar",
    version: "3.0.0",
    port: PORT,
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
  const limit = Number(c.req.query("limit") ?? "50");
  return c.json({ chats: wa.listChats(limit) });
});

app.get("/chats/:jid/messages", (c) => {
  const jid = decodeURIComponent(c.req.param("jid"));
  const limit = Number(c.req.query("limit") ?? "100");
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
  fetch(req, server) {
    const url = new URL(req.url);

    // WebSocket upgrade
    if (url.pathname === "/ws") {
      if (server.upgrade(req, { data: {} })) {
        return; // upgrade handled
      }
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    // Hand off everything else to Hono
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

console.log(`[sahelflow-whatsapp-sidecar] listening on http://localhost:${PORT}`);
console.log(`[sahelflow-whatsapp-sidecar] WS stream at ws://localhost:${PORT}/ws`);

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
