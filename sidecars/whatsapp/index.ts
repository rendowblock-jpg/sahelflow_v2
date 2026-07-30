import { Hono } from "hono";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { chmodSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import QRCode from "qrcode";

import { verifySidecarWebSocketGrant } from "./auth-tokens";
import {
  deterministicWhatsAppMessageId,
  findDurableSendReceipt,
  recordDurableSendReceipt,
} from "./send-receipts";
import { wa, type SidecarEvent } from "./whatsapp";

const configuredPort = Number.parseInt(process.env.SIDECAR_PORT ?? "3001", 10);
if (!Number.isInteger(configuredPort) || configuredPort < 1 || configuredPort > 65535) {
  throw new Error("SIDECAR_PORT must be a valid TCP port");
}
const PORT = configuredPort;
const HOST = process.env.SIDECAR_HOST || "127.0.0.1";
const TOKEN_FILE = process.env.SIDECAR_TOKEN_FILE || join(tmpdir(), "sahelflow-sidecar-token");

function resolveSidecarToken(): string {
  const fromEnv = process.env.SIDECAR_TOKEN;
  if (fromEnv && fromEnv.length >= 16) return fromEnv;
  const generated = randomBytes(32).toString("hex");
  try {
    writeFileSync(TOKEN_FILE, generated, { mode: 0o600 });
    chmodSync(TOKEN_FILE, 0o600);
    console.log(
      `[sahelflow-whatsapp-sidecar] generated a local REST token at ${TOKEN_FILE}`,
    );
  } catch (error) {
    console.warn(
      `[sahelflow-whatsapp-sidecar] could not publish the token file: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  return generated;
}

const SIDECAR_REST_TOKEN = resolveSidecarToken();

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function checkRestAuth(req: Request): boolean {
  const match = /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") ?? "");
  return Boolean(match?.[1] && safeEqual(match[1], SIDECAR_REST_TOKEN));
}

const app = new Hono();
app.use("*", async (context, next) => {
  if (context.req.path === "/") return next();
  if (!checkRestAuth(context.req.raw)) {
    return context.json({ error: "Unauthorized" }, 401);
  }
  return next();
});

app.get("/", (context) =>
  context.json({
    service: "sahelflow-whatsapp-sidecar",
    version: "3.0.0",
    auth: "private-rest-token-and-expiring-websocket-grants",
  }),
);

app.get("/status", (context) => context.json(wa.getStatus()));

app.get("/qr", (context) => {
  const qr = wa.getQr();
  return qr
    ? context.json({ qr })
    : context.json({ qr: null, message: "No QR available" }, 404);
});

app.get("/qr.png", async (context) => {
  const qr = wa.getQr();
  if (!qr) return context.text("No QR available", 404);
  const png = await QRCode.toBuffer(qr, { width: 480, margin: 2 });
  return new Response(png, {
    headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
  });
});

app.get("/chats", (context) => {
  const requested = Number.parseInt(context.req.query("limit") ?? "50", 10);
  const limit = Number.isFinite(requested) ? Math.max(1, Math.min(requested, 500)) : 50;
  return context.json({ chats: wa.listChats(limit) });
});

app.get("/chats/:jid/messages", (context) => {
  const requested = Number.parseInt(context.req.query("limit") ?? "100", 10);
  const limit = Number.isFinite(requested) ? Math.max(1, Math.min(requested, 1000)) : 100;
  const jid = decodeURIComponent(context.req.param("jid"));
  return context.json({ jid, messages: wa.getMessages(jid, limit) });
});

const durableSendsInFlight = new Map<
  string,
  {
    requestBinding: string;
    promise: Promise<{ id: string; status: string; replayed: boolean }>;
  }
>();

async function executeDurableSend(
  effectKey: string,
  to: string,
  text: string,
  requestBinding: string,
): Promise<{ id: string; status: string; replayed: boolean }> {
  const existing = findDurableSendReceipt(effectKey, requestBinding);
  if (existing) return { id: existing.id, status: existing.status, replayed: true };

  const active = durableSendsInFlight.get(effectKey);
  if (active) {
    if (active.requestBinding !== requestBinding) {
      throw new Error("WhatsApp effect key is already bound to different content");
    }
    return active.promise;
  }

  const promise = (async () => {
    const recheck = findDurableSendReceipt(effectKey, requestBinding);
    if (recheck) return { id: recheck.id, status: recheck.status, replayed: true };
    const result = await wa.sendMessage(
      to,
      text,
      deterministicWhatsAppMessageId(effectKey),
    );
    if (!result.id) throw new Error("WhatsApp returned no message receipt");
    recordDurableSendReceipt(effectKey, {
      requestBinding,
      id: result.id,
      status: result.status,
      completedAt: new Date().toISOString(),
    });
    return { ...result, replayed: false };
  })();

  durableSendsInFlight.set(effectKey, { requestBinding, promise });
  try {
    return await promise;
  } finally {
    const current = durableSendsInFlight.get(effectKey);
    if (current?.promise === promise) durableSendsInFlight.delete(effectKey);
  }
}

app.post("/send", async (context) => {
  const body = await context.req.json().catch(() => ({}));
  const { to, text, effectKey, requestBinding } = body as {
    to?: string;
    text?: string;
    effectKey?: string;
    requestBinding?: string;
  };

  if (!to || !text) {
    return context.json(
      {
        error: "Missing recipient or text",
        code: "INVALID_SEND_REQUEST",
        retryable: false,
        ambiguous: false,
      },
      400,
    );
  }
  if (effectKey && !/^[A-Za-z0-9:_-]{1,200}$/.test(effectKey)) {
    return context.json(
      {
        error: "Invalid effect key",
        code: "INVALID_EFFECT_KEY",
        retryable: false,
        ambiguous: false,
      },
      400,
    );
  }
  if (effectKey && !/^[0-9a-f]{64}$/.test(requestBinding ?? "")) {
    return context.json(
      {
        error: "Invalid request binding",
        code: "INVALID_REQUEST_BINDING",
        retryable: false,
        ambiguous: false,
      },
      400,
    );
  }

  try {
    if (wa.getStatus().status !== "connected") {
      return context.json(
        {
          ok: false,
          error: "WhatsApp is not connected",
          code: "WHATSAPP_NOT_CONNECTED",
          retryable: true,
          ambiguous: false,
        },
        503,
      );
    }

    if (!effectKey) {
      const result = await wa.sendMessage(to, text);
      return context.json({ ok: true, ...result, replayed: false, durable: false });
    }

    return context.json({
      ok: true,
      ...(await executeDurableSend(effectKey, to, text, requestBinding!)),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Send failed";
    const conflict = /already bound to different content/i.test(message);
    return context.json(
      {
        ok: false,
        error: conflict
          ? message
          : "WhatsApp send outcome requires reconciliation",
        code: conflict ? "EFFECT_KEY_CONFLICT" : "WHATSAPP_SEND_AMBIGUOUS",
        retryable: false,
        ambiguous: !conflict,
      },
      conflict ? 409 : 502,
    );
  }
});

app.post("/connect", async (context) => {
  await wa.start();
  return context.json({ ok: true, ...wa.getStatus() });
});

app.delete("/logout", async (context) => {
  await wa.logout();
  return context.json({ ok: true, message: "Logged out. Auth cleared." });
});

const wsClients = new Map<WebSocket, number>();
function closeExpiredClient(client: WebSocket, expiresAt: number): boolean {
  if (expiresAt > Date.now()) return false;
  wsClients.delete(client);
  try {
    client.close(1008, "WebSocket grant expired");
  } catch {
    // The close may race with a browser disconnect.
  }
  return true;
}

function broadcast(event: SidecarEvent): void {
  const payload = JSON.stringify(event);
  for (const [client, expiresAt] of wsClients) {
    if (closeExpiredClient(client, expiresAt)) continue;
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  }
}
wa.subscribe(broadcast);

function sendCurrentStatus(client: WebSocket): void {
  const status = wa.getStatus();
  client.send(
    JSON.stringify({
      type: "status",
      status: status.status,
      user: status.user ?? undefined,
    } satisfies SidecarEvent),
  );
}

const wsExpirySweep = setInterval(() => {
  for (const [client, expiresAt] of wsClients) {
    closeExpiredClient(client, expiresAt);
  }
}, 1_000);
wsExpirySweep.unref?.();

const server = Bun.serve<{ expiresAt: number }>({
  port: PORT,
  hostname: HOST,
  fetch(request, bunServer) {
    const url = new URL(request.url);
    if (url.pathname === "/ws") {
      const token = url.searchParams.get("token");
      const grant = token
        ? verifySidecarWebSocketGrant(token, SIDECAR_REST_TOKEN)
        : null;
      if (!grant) {
        return new Response("Unauthorized", { status: 401 });
      }
      if (bunServer.upgrade(request, { data: { expiresAt: grant.expiresAt } })) {
        return;
      }
      return new Response("WebSocket upgrade failed", { status: 400 });
    }
    return app.fetch(request);
  },
  websocket: {
    open(socket) {
      const client = socket as unknown as WebSocket;
      wsClients.set(client, socket.data.expiresAt);
      sendCurrentStatus(client);
    },
    message() {
      // Push-only stream; client frames are ignored.
    },
    close(socket) {
      wsClients.delete(socket as unknown as WebSocket);
    },
  },
  error(error) {
    console.error("[sidecar] server error:", error);
    return new Response("Internal sidecar error", { status: 500 });
  },
});

console.log(`[sahelflow-whatsapp-sidecar] listening on http://${HOST}:${PORT}`);
if (HOST === "0.0.0.0") {
  console.warn("[sahelflow-whatsapp-sidecar] listening on all interfaces");
}

void wa.start().catch((error) => {
  console.error("[sidecar] failed to start WhatsApp connection:", error);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    clearInterval(wsExpirySweep);
    server.stop();
    process.exit(0);
  });
}
