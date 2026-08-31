import { Hono } from "hono";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { chmodSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import QRCode from "qrcode";

import {
  effectKeyMatchesWhatsAppAccount,
  getWhatsAppEffectAccountHash,
  verifySidecarWebSocketGrant,
} from "./auth-tokens";
import { WhatsAppInboundSpool } from "./inbound-spool";
import {
  deterministicWhatsAppMessageId,
  findDurableSendReceipt,
  recordDurableSendReceipt,
} from "./send-receipts";
import {
  isIndividualInboundJid,
  parseWhatsAppQuotedContext,
  wa,
  type IncomingMessage,
  type SidecarEvent,
} from "./whatsapp";
import { declaredOutboundMimeType } from "./outbound-media-mime";

const configuredPort = Number.parseInt(process.env.SIDECAR_PORT ?? "3001", 10);
if (!Number.isInteger(configuredPort) || configuredPort < 1 || configuredPort > 65535) {
  throw new Error("SIDECAR_PORT must be a valid TCP port");
}
const PORT = configuredPort;
const HOST = process.env.SIDECAR_HOST || "127.0.0.1";
const TOKEN_FILE =
  process.env.SIDECAR_TOKEN_FILE || join(tmpdir(), "sahelflow-sidecar-token");
const APP_URL =
  process.env.SF_APP_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  "http://localhost:3000";
const MAX_MEDIA_REQUEST_BYTES = 512 * 1024;
const MAX_OUTBOUND_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_OUTBOUND_IMAGE_FORM_BYTES = MAX_OUTBOUND_IMAGE_BYTES + 256 * 1024;
const SAFE_OUTBOUND_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const MAX_OUTBOUND_VIDEO_BYTES = 64 * 1024 * 1024;
const MAX_OUTBOUND_VIDEO_FORM_BYTES = MAX_OUTBOUND_VIDEO_BYTES + 256 * 1024;
const MAX_OUTBOUND_DOCUMENT_BYTES = 64 * 1024 * 1024;
const MAX_OUTBOUND_DOCUMENT_FORM_BYTES =
  MAX_OUTBOUND_DOCUMENT_BYTES + 256 * 1024;
// Document media types are the sniffed classifications produced by the app's
// encrypted storage authority; browser declarations never cross this boundary.
const SAFE_OUTBOUND_DOCUMENT_TYPES = new Set([
  "application/pdf",
  "application/zip",
  "application/x-ole-storage",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/plain",
  "text/csv",
]);
const MAX_OUTBOUND_VOICE_BYTES = 32 * 1024 * 1024;
const MAX_OUTBOUND_VOICE_FORM_BYTES = MAX_OUTBOUND_VOICE_BYTES + 256 * 1024;
// Voice media types are the sniffed classifications from the encrypted
// storage authority. AMR is excluded: it cannot be metadata-authenticated.
const SAFE_OUTBOUND_VOICE_TYPES = new Set([
  "audio/ogg",
  "audio/wav",
  "audio/mpeg",
  "audio/aac",
  "audio/mp4",
]);
const SAFE_OUTBOUND_VIDEO_TYPES = new Set(["video/mp4"]);

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

function isInboundMediaRequest(message: unknown): message is IncomingMessage {
  if (!message || typeof message !== "object") return false;
  const candidate = message as Partial<IncomingMessage>;
  return Boolean(
    candidate.key &&
      candidate.key.fromMe === false &&
      typeof candidate.key.remoteJid === "string" &&
      candidate.key.remoteJid.length > 0 &&
      candidate.key.remoteJid.length <= 256 &&
      typeof candidate.key.id === "string" &&
      candidate.key.id.length > 0 &&
      candidate.key.id.length <= 256 &&
      candidate.message &&
      typeof candidate.message === "object" &&
      Number.isSafeInteger(candidate.messageTimestamp) &&
      (candidate.messageTimestamp ?? -1) >= 0,
  );
}

function imageEffectKey(value: string): boolean {
  return /:image:[A-Za-z0-9_-]{1,80}$/.test(value) && Boolean(getWhatsAppEffectAccountHash(value));
}

function videoEffectKey(value: string): boolean {
  return /:video:[A-Za-z0-9_-]{1,80}$/.test(value) && Boolean(getWhatsAppEffectAccountHash(value));
}

function documentEffectKey(value: string): boolean {
  return /:document:[A-Za-z0-9_-]{1,80}$/.test(value) && Boolean(getWhatsAppEffectAccountHash(value));
}

function voiceEffectKey(value: string): boolean {
  return /:voice:[A-Za-z0-9_-]{1,80}$/.test(value) && Boolean(getWhatsAppEffectAccountHash(value));
}

async function readBoundedImageForm(
  request: Request,
): Promise<FormData | "too_large" | null> {
  const contentType = request.headers.get("content-type")?.trim() ?? "";
  if (!/^multipart\/form-data(?:;|$)/i.test(contentType) || !request.body) {
    return null;
  }

  const reader = request.body.getReader();
  const bounded = new Uint8Array(MAX_OUTBOUND_IMAGE_FORM_BYTES);
  let offset = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      if (
        offset + next.value.byteLength >
        MAX_OUTBOUND_IMAGE_FORM_BYTES
      ) {
        await reader.cancel().catch(() => undefined);
        return "too_large";
      }
      bounded.set(next.value, offset);
      offset += next.value.byteLength;
    }
  } catch {
    await reader.cancel().catch(() => undefined);
    return null;
  } finally {
    reader.releaseLock();
  }

  try {
    return await new Response(bounded.subarray(0, offset), {
      headers: { "Content-Type": contentType },
    }).formData();
  } catch {
    return null;
  }
}

async function readBoundedVideoForm(
  request: Request,
): Promise<FormData | "too_large" | null> {
  const contentType = request.headers.get("content-type")?.trim() ?? "";
  if (!/^multipart\/form-data(?:;|$)/i.test(contentType) || !request.body) {
    return null;
  }

  const reader = request.body.getReader();
  const bounded = new Uint8Array(MAX_OUTBOUND_VIDEO_FORM_BYTES);
  let offset = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      if (
        offset + next.value.byteLength >
        MAX_OUTBOUND_VIDEO_FORM_BYTES
      ) {
        await reader.cancel().catch(() => undefined);
        return "too_large";
      }
      bounded.set(next.value, offset);
      offset += next.value.byteLength;
    }
  } catch {
    await reader.cancel().catch(() => undefined);
    return null;
  } finally {
    reader.releaseLock();
  }

  try {
    return await new Response(bounded.subarray(0, offset), {
      headers: { "Content-Type": contentType },
    }).formData();
  } catch {
    return null;
  }
}

async function readBoundedDocumentForm(
  request: Request,
): Promise<FormData | "too_large" | null> {
  const contentType = request.headers.get("content-type")?.trim() ?? "";
  if (!/^multipart\/form-data(?:;|$)/i.test(contentType) || !request.body) {
    return null;
  }

  const reader = request.body.getReader();
  const bounded = new Uint8Array(MAX_OUTBOUND_DOCUMENT_FORM_BYTES);
  let offset = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      if (
        offset + next.value.byteLength >
        MAX_OUTBOUND_DOCUMENT_FORM_BYTES
      ) {
        await reader.cancel().catch(() => undefined);
        return "too_large";
      }
      bounded.set(next.value, offset);
      offset += next.value.byteLength;
    }
  } catch {
    await reader.cancel().catch(() => undefined);
    return null;
  } finally {
    reader.releaseLock();
  }

  try {
    return await new Response(bounded.subarray(0, offset), {
      headers: { "Content-Type": contentType },
    }).formData();
  } catch {
    return null;
  }
}

async function readBoundedVoiceForm(
  request: Request,
): Promise<FormData | "too_large" | null> {
  const contentType = request.headers.get("content-type")?.trim() ?? "";
  if (!/^multipart\/form-data(?:;|$)/i.test(contentType) || !request.body) {
    return null;
  }

  const reader = request.body.getReader();
  const bounded = new Uint8Array(MAX_OUTBOUND_VOICE_FORM_BYTES);
  let offset = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      if (
        offset + next.value.byteLength >
        MAX_OUTBOUND_VOICE_FORM_BYTES
      ) {
        await reader.cancel().catch(() => undefined);
        return "too_large";
      }
      bounded.set(next.value, offset);
      offset += next.value.byteLength;
    }
  } catch {
    await reader.cancel().catch(() => undefined);
    return null;
  } finally {
    reader.releaseLock();
  }

  try {
    return await new Response(bounded.subarray(0, offset), {
      headers: { "Content-Type": contentType },
    }).formData();
  } catch {
    return null;
  }
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
  const limit = Number.isFinite(requested)
    ? Math.max(1, Math.min(requested, 500))
    : 50;
  return context.json({ chats: wa.listChats(limit) });
});

app.get("/chats/:jid/messages", (context) => {
  const requested = Number.parseInt(context.req.query("limit") ?? "100", 10);
  const limit = Number.isFinite(requested)
    ? Math.max(1, Math.min(requested, 1000))
    : 100;
  const jid = decodeURIComponent(context.req.param("jid"));
  return context.json({ jid, messages: wa.getMessages(jid, limit) });
});

app.post("/media/download", async (context) => {
  const declaredLength = Number.parseInt(
    context.req.header("content-length") ?? "0",
    10,
  );
  if (Number.isFinite(declaredLength) && declaredLength > MAX_MEDIA_REQUEST_BYTES) {
    return context.json(
      {
        error: "Media request is too large",
        code: "INVALID_MEDIA_REQUEST",
        retryable: false,
        ambiguous: false,
      },
      413,
    );
  }
  const body = await context.req.json().catch(() => null);
  if (
    !body ||
    typeof body !== "object" ||
    JSON.stringify(body).length > MAX_MEDIA_REQUEST_BYTES ||
    !isInboundMediaRequest((body as { message?: unknown }).message)
  ) {
    return context.json(
      {
        error: "Invalid inbound media request",
        code: "INVALID_MEDIA_REQUEST",
        retryable: false,
        ambiguous: false,
      },
      400,
    );
  }

  try {
    const source = await wa.downloadMedia(
      (body as { message: IncomingMessage }).message,
    );
    const iterator = source[Symbol.asyncIterator]();
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const next = await iterator.next();
          if (next.done) controller.close();
          else controller.enqueue(
            next.value instanceof Uint8Array
              ? next.value
              : new Uint8Array(next.value),
          );
        } catch (error) {
          controller.error(error);
        }
      },
      async cancel() {
        await iterator.return?.();
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const statusCode =
      error &&
      typeof error === "object" &&
      "output" in error &&
      (error as { output?: { statusCode?: unknown } }).output &&
      typeof (error as { output?: { statusCode?: unknown } }).output?.statusCode === "number"
        ? ((error as { output: { statusCode: number } }).output.statusCode)
        : null;
    const disconnected =
      error instanceof Error && /Not connected/i.test(error.message);
    const invalid =
      error instanceof Error && /exact inbound WhatsApp message identity/i.test(error.message);
    return context.json(
      {
        error: invalid
          ? "Invalid inbound media identity"
          : disconnected
            ? "WhatsApp is not connected"
            : "WhatsApp media is temporarily unavailable",
        code: invalid
          ? "INVALID_MEDIA_REQUEST"
          : disconnected
            ? "WHATSAPP_NOT_CONNECTED"
            : "WHATSAPP_MEDIA_UNAVAILABLE",
        retryable: !invalid,
        ambiguous: false,
        providerStatus: statusCode && statusCode >= 400 ? statusCode : undefined,
      },
      invalid ? 400 : disconnected ? 503 : 502,
    );
  }
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
  requestBinding: string,
  dispatch: () => Promise<{ id: string; status: string }>,
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
    const result = await dispatch();
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

app.post("/send-receipt", async (context) => {
  const body = await context.req.json().catch(() => ({}));
  const { effectKey, requestBinding } = body as {
    effectKey?: string;
    requestBinding?: string;
  };
  if (!effectKey || !getWhatsAppEffectAccountHash(effectKey)) {
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
  if (!/^[0-9a-f]{64}$/.test(requestBinding ?? "")) {
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
    const receipt = findDurableSendReceipt(effectKey, requestBinding!);
    return context.json({
      receipt: receipt ? { id: receipt.id, status: receipt.status } : null,
    });
  } catch (error) {
    const conflict =
      error instanceof Error &&
      /already bound to different content/i.test(error.message);
    return context.json(
      {
        error: conflict ? error.message : "Receipt journal is unavailable",
        code: conflict ? "EFFECT_KEY_CONFLICT" : "RECEIPT_JOURNAL_UNAVAILABLE",
        retryable: !conflict,
        ambiguous: false,
      },
      conflict ? 409 : 503,
    );
  }
});

app.post("/send", async (context) => {
  const body = await context.req.json().catch(() => ({}));
  const { to, text, effectKey, requestBinding, quoted } = body as {
    to?: string;
    text?: string;
    effectKey?: string;
    requestBinding?: string;
    quoted?: unknown;
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
  let quotedContext: ReturnType<typeof parseWhatsAppQuotedContext>;
  try {
    quotedContext = parseWhatsAppQuotedContext(quoted);
  } catch (error) {
    return context.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Invalid WhatsApp quoted context",
        code: "INVALID_QUOTED_CONTEXT",
        retryable: false,
        ambiguous: false,
      },
      400,
    );
  }
  if (effectKey && !getWhatsAppEffectAccountHash(effectKey)) {
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
    const status = wa.getStatus();
    if (status.status !== "connected") {
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

    if (effectKey) {
      if (!status.user?.id) {
        return context.json(
          {
            ok: false,
            error: "WhatsApp account identity is unavailable",
            code: "WHATSAPP_ACCOUNT_UNAVAILABLE",
            retryable: true,
            ambiguous: false,
          },
          503,
        );
      }
      if (!effectKeyMatchesWhatsAppAccount(effectKey, status.user.id)) {
        return context.json(
          {
            ok: false,
            error: "The paired WhatsApp account changed after this send was queued",
            code: "WHATSAPP_ACCOUNT_CHANGED",
            retryable: false,
            ambiguous: false,
          },
          409,
        );
      }
      return context.json({
        ok: true,
        ...(await executeDurableSend(effectKey, requestBinding!, () =>
          wa.sendMessage(
            to,
            text,
            deterministicWhatsAppMessageId(effectKey),
            quotedContext,
          ),
        )),
      });
    }

    const result = await wa.sendMessage(to, text, undefined, quotedContext);
    return context.json({ ok: true, ...result, replayed: false, durable: false });
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

app.post("/send-image", async (context) => {
  const declaredLength = Number.parseInt(
    context.req.header("content-length") ?? "0",
    10,
  );
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_OUTBOUND_IMAGE_FORM_BYTES
  ) {
    return context.json(
      {
        error: "Image send request is too large",
        code: "INVALID_IMAGE_SEND_REQUEST",
        retryable: false,
        ambiguous: false,
      },
      413,
    );
  }

  const form = await readBoundedImageForm(context.req.raw);
  if (form === "too_large") {
    return context.json(
      {
        error: "Image send request is too large",
        code: "INVALID_IMAGE_SEND_REQUEST",
        retryable: false,
        ambiguous: false,
      },
      413,
    );
  }
  const to = form?.get("to");
  const caption = form?.get("caption");
  const effectKey = form?.get("effectKey");
  const requestBinding = form?.get("requestBinding");
  const image = form?.get("image");
  // The declared media type is the sniffed classification sent by the app as
  // an explicit form field. The parsed file-part Content-Type is never
  // trusted: sidecar multipart parsing can drop it (campaign row B3).
  const declaredMime = declaredOutboundMimeType(
    form?.get("mimeType"),
    SAFE_OUTBOUND_IMAGE_TYPES,
  );
  let quotedContext: ReturnType<typeof parseWhatsAppQuotedContext>;
  try {
    quotedContext = parseWhatsAppQuotedContext(form?.get("quoted"));
  } catch (error) {
    return context.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Invalid WhatsApp quoted context",
        code: "INVALID_QUOTED_CONTEXT",
        retryable: false,
        ambiguous: false,
      },
      400,
    );
  }
  if (
    typeof to !== "string" ||
    !to ||
    to.length > 256 ||
    typeof caption !== "string" ||
    caption.length > 4000 ||
    typeof effectKey !== "string" ||
    !imageEffectKey(effectKey) ||
    typeof requestBinding !== "string" ||
    !/^[0-9a-f]{64}$/.test(requestBinding) ||
    !(image instanceof File) ||
    image.size <= 0 ||
    image.size > MAX_OUTBOUND_IMAGE_BYTES ||
    !declaredMime
  ) {
    return context.json(
      {
        error: "Invalid durable image send request",
        code: "INVALID_IMAGE_SEND_REQUEST",
        retryable: false,
        ambiguous: false,
      },
      400,
    );
  }

  const status = wa.getStatus();
  if (status.status !== "connected") {
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
  if (!status.user?.id) {
    return context.json(
      {
        ok: false,
        error: "WhatsApp account identity is unavailable",
        code: "WHATSAPP_ACCOUNT_UNAVAILABLE",
        retryable: true,
        ambiguous: false,
      },
      503,
    );
  }
  if (!effectKeyMatchesWhatsAppAccount(effectKey, status.user.id)) {
    return context.json(
      {
        ok: false,
        error: "The paired WhatsApp account changed after this send was queued",
        code: "WHATSAPP_ACCOUNT_CHANGED",
        retryable: false,
        ambiguous: false,
      },
      409,
    );
  }

  const bytes = Buffer.from(await image.arrayBuffer());
  try {
    return context.json({
      ok: true,
      ...(await executeDurableSend(effectKey, requestBinding, () =>
        wa.sendImage(
          to,
          bytes,
          declaredMime,
          caption,
          deterministicWhatsAppMessageId(effectKey),
          quotedContext,
        ),
      )),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Image send failed";
    const conflict = /already bound to different content/i.test(message);
    return context.json(
      {
        ok: false,
        error: conflict
          ? message
          : "WhatsApp image send outcome requires reconciliation",
        code: conflict ? "EFFECT_KEY_CONFLICT" : "WHATSAPP_SEND_AMBIGUOUS",
        retryable: false,
        ambiguous: !conflict,
      },
      conflict ? 409 : 502,
    );
  } finally {
    bytes.fill(0);
  }
});

app.post("/send-video", async (context) => {
  const declaredLength = Number.parseInt(
    context.req.header("content-length") ?? "0",
    10,
  );
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_OUTBOUND_VIDEO_FORM_BYTES
  ) {
    return context.json(
      {
        error: "Video send request is too large",
        code: "INVALID_VIDEO_SEND_REQUEST",
        retryable: false,
        ambiguous: false,
      },
      413,
    );
  }

  const form = await readBoundedVideoForm(context.req.raw);
  if (form === "too_large") {
    return context.json(
      {
        error: "Video send request is too large",
        code: "INVALID_VIDEO_SEND_REQUEST",
        retryable: false,
        ambiguous: false,
      },
      413,
    );
  }
  const to = form?.get("to");
  const caption = form?.get("caption");
  const effectKey = form?.get("effectKey");
  const requestBinding = form?.get("requestBinding");
  const video = form?.get("video");
  // Declared media mimetype only — never the parsed file-part type (B3).
  const declaredMime = declaredOutboundMimeType(
    form?.get("mimeType"),
    SAFE_OUTBOUND_VIDEO_TYPES,
  );
  let quotedContext: ReturnType<typeof parseWhatsAppQuotedContext>;
  try {
    quotedContext = parseWhatsAppQuotedContext(form?.get("quoted"));
  } catch (error) {
    return context.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Invalid WhatsApp quoted context",
        code: "INVALID_QUOTED_CONTEXT",
        retryable: false,
        ambiguous: false,
      },
      400,
    );
  }
  if (
    typeof to !== "string" ||
    !to ||
    to.length > 256 ||
    typeof caption !== "string" ||
    caption.length > 4000 ||
    typeof effectKey !== "string" ||
    !videoEffectKey(effectKey) ||
    typeof requestBinding !== "string" ||
    !/^[0-9a-f]{64}$/.test(requestBinding) ||
    !(video instanceof File) ||
    video.size <= 0 ||
    video.size > MAX_OUTBOUND_VIDEO_BYTES ||
    !declaredMime
  ) {
    return context.json(
      {
        error: "Invalid durable video send request",
        code: "INVALID_VIDEO_SEND_REQUEST",
        retryable: false,
        ambiguous: false,
      },
      400,
    );
  }

  const status = wa.getStatus();
  if (status.status !== "connected") {
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
  if (!status.user?.id) {
    return context.json(
      {
        ok: false,
        error: "WhatsApp account identity is unavailable",
        code: "WHATSAPP_ACCOUNT_UNAVAILABLE",
        retryable: true,
        ambiguous: false,
      },
      503,
    );
  }
  if (!effectKeyMatchesWhatsAppAccount(effectKey, status.user.id)) {
    return context.json(
      {
        ok: false,
        error: "The paired WhatsApp account changed after this send was queued",
        code: "WHATSAPP_ACCOUNT_CHANGED",
        retryable: false,
        ambiguous: false,
      },
      409,
    );
  }

  const bytes = Buffer.from(await video.arrayBuffer());
  try {
    return context.json({
      ok: true,
      ...(await executeDurableSend(effectKey, requestBinding, () =>
        wa.sendVideo(
          to,
          bytes,
          declaredMime,
          caption,
          deterministicWhatsAppMessageId(effectKey),
          quotedContext,
        ),
      )),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Video send failed";
    const conflict = /already bound to different content/i.test(message);
    return context.json(
      {
        ok: false,
        error: conflict
          ? message
          : "WhatsApp video send outcome requires reconciliation",
        code: conflict ? "EFFECT_KEY_CONFLICT" : "WHATSAPP_SEND_AMBIGUOUS",
        retryable: false,
        ambiguous: !conflict,
      },
      conflict ? 409 : 502,
    );
  } finally {
    bytes.fill(0);
  }
});

app.post("/send-document", async (context) => {
  const declaredLength = Number.parseInt(
    context.req.header("content-length") ?? "0",
    10,
  );
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_OUTBOUND_DOCUMENT_FORM_BYTES
  ) {
    return context.json(
      {
        error: "Document send request is too large",
        code: "INVALID_DOCUMENT_SEND_REQUEST",
        retryable: false,
        ambiguous: false,
      },
      413,
    );
  }

  const form = await readBoundedDocumentForm(context.req.raw);
  if (form === "too_large") {
    return context.json(
      {
        error: "Document send request is too large",
        code: "INVALID_DOCUMENT_SEND_REQUEST",
        retryable: false,
        ambiguous: false,
      },
      413,
    );
  }
  const to = form?.get("to");
  const caption = form?.get("caption");
  const effectKey = form?.get("effectKey");
  const requestBinding = form?.get("requestBinding");
  const fileName = form?.get("fileName");
  const document = form?.get("document");
  // Declared media mimetype only — never the parsed file-part type (B3).
  const declaredMime = declaredOutboundMimeType(
    form?.get("mimeType"),
    SAFE_OUTBOUND_DOCUMENT_TYPES,
  );
  let quotedContext: ReturnType<typeof parseWhatsAppQuotedContext>;
  try {
    quotedContext = parseWhatsAppQuotedContext(form?.get("quoted"));
  } catch (error) {
    return context.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Invalid WhatsApp quoted context",
        code: "INVALID_QUOTED_CONTEXT",
        retryable: false,
        ambiguous: false,
      },
      400,
    );
  }
  if (
    typeof to !== "string" ||
    !to ||
    to.length > 256 ||
    typeof caption !== "string" ||
    caption.length > 4000 ||
    typeof effectKey !== "string" ||
    !documentEffectKey(effectKey) ||
    typeof requestBinding !== "string" ||
    !/^[0-9a-f]{64}$/.test(requestBinding) ||
    typeof fileName !== "string" ||
    !fileName ||
    fileName.length > 180 ||
    // Reject path-like and control-character titles before any provider call.
    /[\u0000-\u001f\u007f\\]/.test(fileName) ||
    !(document instanceof File) ||
    document.size <= 0 ||
    document.size > MAX_OUTBOUND_DOCUMENT_BYTES ||
    !declaredMime
  ) {
    return context.json(
      {
        error: "Invalid durable document send request",
        code: "INVALID_DOCUMENT_SEND_REQUEST",
        retryable: false,
        ambiguous: false,
      },
      400,
    );
  }

  const status = wa.getStatus();
  if (status.status !== "connected") {
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
  if (!status.user?.id) {
    return context.json(
      {
        ok: false,
        error: "WhatsApp account identity is unavailable",
        code: "WHATSAPP_ACCOUNT_UNAVAILABLE",
        retryable: true,
        ambiguous: false,
      },
      503,
    );
  }
  if (!effectKeyMatchesWhatsAppAccount(effectKey, status.user.id)) {
    return context.json(
      {
        ok: false,
        error: "The paired WhatsApp account changed after this send was queued",
        code: "WHATSAPP_ACCOUNT_CHANGED",
        retryable: false,
        ambiguous: false,
      },
      409,
    );
  }

  const bytes = Buffer.from(await document.arrayBuffer());
  try {
    return context.json({
      ok: true,
      ...(await executeDurableSend(effectKey, requestBinding, () =>
        wa.sendDocument(
          to,
          bytes,
          declaredMime,
          fileName,
          caption,
          deterministicWhatsAppMessageId(effectKey),
          quotedContext,
        ),
      )),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Document send failed";
    const conflict = /already bound to different content/i.test(message);
    return context.json(
      {
        ok: false,
        error: conflict
          ? message
          : "WhatsApp document send outcome requires reconciliation",
        code: conflict ? "EFFECT_KEY_CONFLICT" : "WHATSAPP_SEND_AMBIGUOUS",
        retryable: false,
        ambiguous: !conflict,
      },
      conflict ? 409 : 502,
    );
  } finally {
    bytes.fill(0);
  }
});

app.post("/send-voice", async (context) => {
  const declaredLength = Number.parseInt(
    context.req.header("content-length") ?? "0",
    10,
  );
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_OUTBOUND_VOICE_FORM_BYTES
  ) {
    return context.json(
      {
        error: "Voice send request is too large",
        code: "INVALID_VOICE_SEND_REQUEST",
        retryable: false,
        ambiguous: false,
      },
      413,
    );
  }

  const form = await readBoundedVoiceForm(context.req.raw);
  if (form === "too_large") {
    return context.json(
      {
        error: "Voice send request is too large",
        code: "INVALID_VOICE_SEND_REQUEST",
        retryable: false,
        ambiguous: false,
      },
      413,
    );
  }
  const to = form?.get("to");
  const effectKey = form?.get("effectKey");
  const requestBinding = form?.get("requestBinding");
  const voiceMessage = form?.get("voiceMessage");
  const seconds = form?.get("seconds");
  const audio = form?.get("audio");
  // Declared media mimetype only — never the parsed file-part type (B3).
  const declaredMime = declaredOutboundMimeType(
    form?.get("mimeType"),
    SAFE_OUTBOUND_VOICE_TYPES,
  );
  let quotedContext: ReturnType<typeof parseWhatsAppQuotedContext>;
  try {
    quotedContext = parseWhatsAppQuotedContext(form?.get("quoted"));
  } catch (error) {
    return context.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Invalid WhatsApp quoted context",
        code: "INVALID_QUOTED_CONTEXT",
        retryable: false,
        ambiguous: false,
      },
      400,
    );
  }
  // The authenticated duration is optional; when present it is a positive
  // integer second count derived from the staged bytes.
  const secondsAbsent = seconds === null || seconds === "";
  const secondsValid =
    secondsAbsent ||
    (typeof seconds === "string" && /^[1-9][0-9]{0,4}$/.test(seconds));
  if (
    typeof to !== "string" ||
    !to ||
    to.length > 256 ||
    typeof effectKey !== "string" ||
    !voiceEffectKey(effectKey) ||
    typeof requestBinding !== "string" ||
    !/^[0-9a-f]{64}$/.test(requestBinding) ||
    typeof voiceMessage !== "string" ||
    !/^(true|false)$/.test(voiceMessage) ||
    !secondsValid ||
    !(audio instanceof File) ||
    audio.size <= 0 ||
    audio.size > MAX_OUTBOUND_VOICE_BYTES ||
    !declaredMime
  ) {
    return context.json(
      {
        error: "Invalid durable voice send request",
        code: "INVALID_VOICE_SEND_REQUEST",
        retryable: false,
        ambiguous: false,
      },
      400,
    );
  }

  const status = wa.getStatus();
  if (status.status !== "connected") {
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
  if (!status.user?.id) {
    return context.json(
      {
        ok: false,
        error: "WhatsApp account identity is unavailable",
        code: "WHATSAPP_ACCOUNT_UNAVAILABLE",
        retryable: true,
        ambiguous: false,
      },
      503,
    );
  }
  if (!effectKeyMatchesWhatsAppAccount(effectKey, status.user.id)) {
    return context.json(
      {
        ok: false,
        error: "The paired WhatsApp account changed after this send was queued",
        code: "WHATSAPP_ACCOUNT_CHANGED",
        retryable: false,
        ambiguous: false,
      },
      409,
    );
  }

  const bytes = Buffer.from(await audio.arrayBuffer());
  const authenticatedSeconds =
    typeof seconds === "string" && seconds
      ? Number.parseInt(seconds, 10)
      : null;
  try {
    return context.json({
      ok: true,
      ...(await executeDurableSend(effectKey, requestBinding, () =>
        wa.sendVoice(
          to,
          bytes,
          declaredMime,
          voiceMessage === "true",
          authenticatedSeconds,
          deterministicWhatsAppMessageId(effectKey),
          quotedContext,
        ),
      )),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Voice send failed";
    const conflict = /already bound to different content/i.test(message);
    return context.json(
      {
        ok: false,
        error: conflict
          ? message
          : "WhatsApp voice send outcome requires reconciliation",
        code: conflict ? "EFFECT_KEY_CONFLICT" : "WHATSAPP_SEND_AMBIGUOUS",
        retryable: false,
        ambiguous: !conflict,
      },
      conflict ? 409 : 502,
    );
  } finally {
    bytes.fill(0);
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

const inboundSpool = new WhatsAppInboundSpool({
  appUrl: APP_URL,
  bearerToken: SIDECAR_REST_TOKEN,
  onCommitted(envelope) {
    // Browser publication is explicitly after the app acknowledged the durable
    // ProviderIngressEvent commit. Database readers remain source of truth;
    // WebSocket delivery is a low-latency projection only.
    broadcast({ type: "message", message: envelope.message });
  },
});

wa.subscribe((event) => {
  if (event.type !== "message" || !event.message || event.message.key.fromMe) {
    broadcast(event);
    return;
  }
  // C1 ingress scope: group/status/broadcast surfaces are intentionally
  // unsupported (ledger #317). Skip them before the spool so they can never
  // loop against the app or appear as phantom conversations.
  if (!isIndividualInboundJid(event.message.key.remoteJid)) {
    console.warn(
      `[sahelflow-whatsapp-sidecar] skipping non-individual inbound jid ${event.message.key.remoteJid ?? "<empty>"}`,
    );
    return;
  }
  const status = wa.getStatus();
  if (status.status !== "connected" || !status.user?.id) {
    console.error(
      "[sahelflow-whatsapp-sidecar] refusing inbound publication without paired account authority",
    );
    return;
  }
  try {
    // enqueue() performs an atomic synchronous file commit before returning.
    // It schedules app delivery; this callback intentionally does not broadcast.
    inboundSpool.enqueue(status.user.id, event.message);
  } catch (error) {
    console.error(
      "[sahelflow-whatsapp-sidecar] failed to durably spool inbound message",
      error instanceof Error ? error.message : String(error),
    );
  }
});
inboundSpool.start();

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
    inboundSpool.stop();
    clearInterval(wsExpirySweep);
    server.stop();
    process.exit(0);
  });
}
