/**
 * SahelFlow WhatsApp sidecar — local authenticated HTTP + WS bridge.
 */
import { Hono } from "hono";
import { createHmac, randomBytes } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import QRCode from "qrcode";
import { wa, type SidecarEvent } from "./whatsapp";

const configuredPort = Number.parseInt(process.env.SIDECAR_PORT ?? "3001", 10);
if (!Number.isInteger(configuredPort) || configuredPort < 1 || configuredPort > 65535) {
  throw new Error("SIDECAR_PORT must be a valid TCP port");
}
const PORT = configuredPort;
const HOST = process.env.SIDECAR_HOST || "127.0.0.1";
const TOKEN_FILE =
  process.env.SIDECAR_TOKEN_FILE || join(tmpdir(), "sahelflow-sidecar-token");
const SIDECAR_DATA_DIR =
  process.env.SF_DATA_DIR || join(process.cwd(), "data");
const SEND_RECEIPT_FILE =
  process.env.SIDECAR_SEND_RECEIPT_FILE ||
  join(SIDECAR_DATA_DIR, "whatsapp-send-receipts.json");

type SendReceiptState = "sending" | "sent" | "ambiguous";

interface SendReceipt {
  state: SendReceiptState;
  id: string;
  status: string;
  updatedAt: string;
}

class AmbiguousSendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AmbiguousSendError";
  }
}

function resolveSidecarToken(): string {
  const fromEnv = process.env.SIDECAR_TOKEN;
  if (fromEnv && fromEnv.length >= 16) return fromEnv;

  const generated = randomBytes(32).toString("hex");
  try {
    mkdirSync(dirname(TOKEN_FILE), { recursive: true });
    writeFileSync(TOKEN_FILE, generated, { mode: 0o600 });
    chmodSync(TOKEN_FILE, 0o600);
    console.log(
      `[sahelflow-whatsapp-sidecar] SIDECAR_TOKEN not set — generated a token at ${TOKEN_FILE}.`,
    );
  } catch (error) {
    console.warn(
      `[sahelflow-whatsapp-sidecar] could not write token file ${TOKEN_FILE}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  return generated;
}

function normalizeReceipt(value: unknown): SendReceipt | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<SendReceipt>;
  if (typeof candidate.id !== "string" || typeof candidate.status !== "string") {
    return null;
  }
  const state: SendReceiptState =
    candidate.state === "sending" ||
    candidate.state === "sent" ||
    candidate.state === "ambiguous"
      ? candidate.state
      : "sent";
  return {
    state,
    id: candidate.id,
    status: candidate.status,
    updatedAt:
      typeof candidate.updatedAt === "string"
        ? candidate.updatedAt
        : new Date(0).toISOString(),
  };
}

function loadSendReceipts(): Map<string, SendReceipt> {
  try {
    if (!existsSync(SEND_RECEIPT_FILE)) return new Map();
    const parsed = JSON.parse(readFileSync(SEND_RECEIPT_FILE, "utf8")) as unknown;
    if (!Array.isArray(parsed)) return new Map();
    const rows: Array<[string, SendReceipt]> = [];
    for (const row of parsed) {
      if (!Array.isArray(row) || typeof row[0] !== "string" || row[0].length < 8) {
        continue;
      }
      const receipt = normalizeReceipt(row[1]);
      if (receipt) rows.push([row[0], receipt]);
    }
    return new Map(rows);
  } catch (error) {
    console.warn(
      `[sahelflow-whatsapp-sidecar] could not read send receipts: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return new Map();
  }
}

// Receipt retention is intentionally unbounded until the application provides a
// durable reconciliation acknowledgement. Evicting either an ambiguous receipt
// or a sent-but-not-yet-acknowledged receipt can turn a crash recovery into a
// duplicate customer message.
const sendReceipts = loadSendReceipts();
const inFlightSends = new Map<string, Promise<SendReceipt>>();

function persistSendReceipt(key: string, receipt: SendReceipt): void {
  const previous = sendReceipts.get(key);
  sendReceipts.delete(key);
  sendReceipts.set(key, receipt);

  const temporary = `${SEND_RECEIPT_FILE}.${process.pid}.tmp`;
  try {
    mkdirSync(dirname(SEND_RECEIPT_FILE), { recursive: true });
    writeFileSync(temporary, JSON.stringify([...sendReceipts.entries()]), {
      mode: 0o600,
    });
    chmodSync(temporary, 0o600);
    renameSync(temporary, SEND_RECEIPT_FILE);
  } catch (error) {
    if (previous) sendReceipts.set(key, previous);
    else sendReceipts.delete(key);
    throw error;
  }
}

async function sendWithDurableReceipt(
  idempotencyKey: string,
  to: string,
  text: string,
): Promise<SendReceipt> {
  const prior = sendReceipts.get(idempotencyKey);
  if (prior?.state === "sent") return prior;
  if (prior?.state === "sending" || prior?.state === "ambiguous") {
    throw new AmbiguousSendError(
      "A previous WhatsApp send may have committed; manual reconciliation is required",
    );
  }

  persistSendReceipt(idempotencyKey, {
    state: "sending",
    id: "",
    status: "sending",
    updatedAt: new Date().toISOString(),
  });

  let result: { id: string; status: string };
  try {
    result = await wa.sendMessage(to, text);
  } catch (error) {
    try {
      persistSendReceipt(idempotencyKey, {
        state: "ambiguous",
        id: "",
        status: "ambiguous",
        updatedAt: new Date().toISOString(),
      });
    } catch {
      // The durable `sending` marker already fails closed after restart.
    }
    throw new AmbiguousSendError(
      error instanceof Error
        ? `WhatsApp send result is ambiguous: ${error.message}`
        : "WhatsApp send result is ambiguous",
    );
  }

  try {
    const receipt: SendReceipt = {
      state: "sent",
      id: result.id,
      status: result.status,
      updatedAt: new Date().toISOString(),
    };
    persistSendReceipt(idempotencyKey, receipt);
    return receipt;
  } catch (error) {
    try {
      persistSendReceipt(idempotencyKey, {
        state: "ambiguous",
        id: result.id,
        status: "ambiguous",
        updatedAt: new Date().toISOString(),
      });
    } catch {
      // The in-memory marker still prevents an immediate duplicate in this process.
    }
    throw new AmbiguousSendError(
      `WhatsApp sent but its durable receipt failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

const SIDECAR_TOKEN = resolveSidecarToken();

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  return aBuf.equals(bBuf) && createHmac("sha256", aBuf).update(bBuf).digest().length > 0;
}

function checkAuth(req: Request): boolean {
  const auth = req.headers.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(auth);
  return Boolean(match?.[1] && safeEqual(match[1], SIDECAR_TOKEN));
}

const app = new Hono();
app.use("*", async (context, next) => {
  if (context.req.path === "/") return next();
  if (!checkAuth(context.req.raw)) {
    return context.json(
      { error: "Unauthorized — missing or invalid bearer token" },
      401,
    );
  }
  return next();
});

app.get("/", (context) =>
  context.json({
    service: "sahelflow-whatsapp-sidecar",
    version: "3.0.0",
    port: PORT,
    auth: "bearer-token",
    endpoints: [
      "/status",
      "/qr",
      "/qr.png",
      "/chats",
      "/chats/:jid/messages",
      "/send",
      "/connect",
      "/logout",
      "/ws",
    ],
  }),
);

app.get("/status", (context) => context.json(wa.getStatus()));

app.get("/qr", (context) => {
  const qr = wa.getQr();
  if (!qr) {
    return context.json(
      { qr: null, message: "No QR available. Connect a phone first or already connected." },
      404,
    );
  }
  return context.json({ qr });
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
  const limit = Math.min(
    parseInt(context.req.query("limit") ?? "50", 10) || 50,
    500,
  );
  return context.json({ chats: wa.listChats(limit) });
});

app.get("/chats/:jid/messages", (context) => {
  const jid = decodeURIComponent(context.req.param("jid"));
  const limit = Math.min(
    parseInt(context.req.query("limit") ?? "100", 10) || 100,
    1_000,
  );
  return context.json({ jid, messages: wa.getMessages(jid, limit) });
});

app.post("/send", async (context) => {
  const body = await context.req.json().catch(() => ({}));
  const { to, text, idempotencyKey } = body as {
    to?: string;
    text?: string;
    idempotencyKey?: string;
  };
  if (!to || !text) {
    return context.json({ error: "Missing 'to' or 'text'" }, 400);
  }
  if (idempotencyKey && idempotencyKey.length < 8) {
    return context.json({ error: "Invalid idempotencyKey" }, 400);
  }

  if (!idempotencyKey) {
    try {
      const result = await wa.sendMessage(to, text);
      return context.json({ ok: true, ...result, replayed: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Send failed";
      return context.json({ ok: false, error: message }, 503);
    }
  }

  const prior = sendReceipts.get(idempotencyKey);
  if (prior?.state === "sent") {
    return context.json({ ok: true, ...prior, replayed: true });
  }
  if (
    (prior?.state === "sending" || prior?.state === "ambiguous") &&
    !inFlightSends.has(idempotencyKey)
  ) {
    return context.json(
      {
        ok: false,
        ambiguous: true,
        error: "A previous WhatsApp send may have committed; manual reconciliation is required",
      },
      409,
    );
  }

  let pending = inFlightSends.get(idempotencyKey);
  if (!pending) {
    pending = sendWithDurableReceipt(idempotencyKey, to, text);
    inFlightSends.set(idempotencyKey, pending);
  }

  try {
    const receipt = await pending;
    return context.json({ ok: true, ...receipt, replayed: prior?.state === "sent" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Send failed";
    if (error instanceof AmbiguousSendError) {
      return context.json({ ok: false, ambiguous: true, error: message }, 503);
    }
    return context.json({ ok: false, error: message }, 503);
  } finally {
    if (inFlightSends.get(idempotencyKey) === pending) {
      inFlightSends.delete(idempotencyKey);
    }
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

const wsClients = new Set<WebSocket>();

function broadcast(event: SidecarEvent): void {
  const payload = JSON.stringify(event);
  for (const client of wsClients) {
    try {
      if (client.readyState === WebSocket.OPEN) client.send(payload);
    } catch {
      // Best-effort fanout.
    }
  }
}

wa.subscribe(broadcast);

function sendCurrentStatus(client: WebSocket): void {
  const status = wa.getStatus();
  const event: SidecarEvent = {
    type: "status",
    status: status.status,
    user: status.user ?? undefined,
  };
  client.send(JSON.stringify(event));
}

const server = Bun.serve({
  port: PORT,
  hostname: HOST,
  fetch(request, bunServer) {
    const url = new URL(request.url);
    if (url.pathname === "/ws") {
      const token = url.searchParams.get("token");
      if (!token || !safeEqual(token, SIDECAR_TOKEN)) {
        return new Response("Unauthorized — missing or invalid token", { status: 401 });
      }
      if (bunServer.upgrade(request, { data: {} })) return;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }
    return app.fetch(request);
  },
  websocket: {
    open(socket) {
      wsClients.add(socket);
      sendCurrentStatus(socket);
    },
    message() {
      // Push-only stream.
    },
    close(socket) {
      wsClients.delete(socket);
    },
  },
  error(error) {
    console.error("[sidecar] server error:", error);
    return new Response("Internal sidecar error", { status: 500 });
  },
});

console.log(`[sahelflow-whatsapp-sidecar] listening on http://${HOST}:${PORT}`);
console.log(
  `[sahelflow-whatsapp-sidecar] WS stream at ws://${HOST}:${PORT}/ws?token=<SIDECAR_TOKEN>`,
);
if (HOST === "0.0.0.0") {
  console.warn(
    "[sahelflow-whatsapp-sidecar] WARNING: listening on all interfaces.",
  );
}

void wa.start().catch((error) => {
  console.error("[sidecar] failed to start WhatsApp connection:", error);
});

process.on("SIGINT", () => {
  console.log("[sidecar] shutting down...");
  server.stop();
  process.exit(0);
});
process.on("SIGTERM", () => {
  server.stop();
  process.exit(0);
});
