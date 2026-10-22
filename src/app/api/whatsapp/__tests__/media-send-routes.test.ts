import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// POST /api/whatsapp/send-image, send-document, send-video and send-voice are the four routes through which the inbox
// sends a file to a customer on WhatsApp. They share one skeleton and differ only in a few parameters (the form field,
// the size limit, the accepted types, whether there is a caption or a file name, and an image-only thumbnail step), so
// ONE table drives all four. What matters: only a person who may reply AND may see the customer's contact gets in,
// before anything is read; the upload is bounded twice (by the declared length and by what is really read); the
// paired WhatsApp account is checked before the file is parsed; only the listed types and sizes pass; the recipient is
// normalised by the real normaliser and a LID reply needs earlier inbound provenance; the bytes that were uploaded are
// the bytes handed to the queue; nothing the browser adds to the form reaches the queue; and the HTTP status follows
// the state of the send (200 sent, 202 still being sent, 409 for ambiguous and dead_letter: an ambiguous send may have reached the customer, and its body then carries requiresDuplicateConfirmation).
//
// Real code under test: the four routes, withErrorHandler (so each refusal has the real status and body), zod,
// SahelFlowError, normalizeWhatsAppJid, and the Phase 2 permission catalog and role table. Stand-ins: the two permission
// helpers (requireTrustedAction and assertTrustedAction: the real ones need a signed-in session), the business
// principal, the database lookup of a conversation, the sidecar status call, the four queue functions and
// processWhatsAppEffect (the durable outbox: not run here), the thumbnail derive and write (image only) and the
// logger/monitoring hooks withErrorHandler calls (its shop-authority and licence hooks only run when NODE_ENV is
// production, so those two mocks are inert here and the production checks that run before the route are NOT tested).
// NOT tested at all: the encrypted media store, the content sniffing that decides what the bytes really are (this layer
// only reads the type the browser DECLARED), the real queue, retries, and the WhatsApp provider.
const h = vi.hoisted(() => ({
  requireAction: vi.fn(),
  assertAction: vi.fn(),
  principal: vi.fn(),
  status: vi.fn(),
  findConversation: vi.fn(),
  queueImage: vi.fn(),
  queueDocument: vi.fn(),
  queueVideo: vi.fn(),
  queueVoice: vi.fn(),
  processEffect: vi.fn(),
  deriveThumb: vi.fn(),
  writeThumb: vi.fn(),
}));

vi.mock("@/lib/identity/authorization", () => ({
  requireTrustedAction: h.requireAction,
  assertTrustedAction: h.assertAction,
}));
vi.mock("@/lib/business-truth/principal", () => ({ businessPrincipalFromTrustedActor: h.principal }));
vi.mock("@/lib/db", () => ({
  db: { conversation: { findUnique: h.findConversation } },
  shopContext: { shopId: "default", registryRevision: 1, workspaceId: "1".repeat(32) },
}));
vi.mock("@/lib/whatsapp/sidecar-client", () => ({ sidecar: { status: h.status } }));
vi.mock("@/lib/whatsapp/durable-send", () => ({ processWhatsAppEffect: h.processEffect }));
vi.mock("@/lib/whatsapp/outbound-image-queue", () => ({ queueWhatsAppImage: h.queueImage }));
vi.mock("@/lib/whatsapp/outbound-document-queue", () => ({ queueWhatsAppDocument: h.queueDocument }));
vi.mock("@/lib/whatsapp/outbound-video-queue", () => ({ queueWhatsAppVideo: h.queueVideo }));
vi.mock("@/lib/whatsapp/outbound-voice-queue", () => ({ queueWhatsAppVoice: h.queueVoice }));
vi.mock("@/lib/whatsapp/media-object-store", () => ({ writeWhatsAppMediaObjectThumbnail: h.writeThumb }));
vi.mock("@/lib/whatsapp/media-thumbnail", () => ({ deriveWhatsAppThumbnail: h.deriveThumb }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/monitoring/sentry", () => ({ captureError: vi.fn() }));
vi.mock("@/lib/redact-pii", () => ({ redactError: (error: unknown) => error }));
vi.mock("@/lib/shops/authority", () => ({ assertProcessShopAuthority: vi.fn() }));
vi.mock("@/lib/license/license-authority", () => ({ requireLicenseEntitlement: vi.fn() }));

import * as documentRoute from "@/app/api/whatsapp/send-document/route";
import * as imageRoute from "@/app/api/whatsapp/send-image/route";
import * as videoRoute from "@/app/api/whatsapp/send-video/route";
import * as voiceRoute from "@/app/api/whatsapp/send-voice/route";
import { db } from "@/lib/db";
import {
  PHASE2_ACTIONS,
  getPhase2PresetPermissions,
  hasPhase2Permission,
  type Phase2Action,
} from "@/lib/identity/permissions";
import { SahelFlowError } from "@/types/errors";

type Spy = ReturnType<typeof vi.fn>;
type Kind = {
  name: string;
  mod: { POST: (req: NextRequest) => Promise<Response>; dynamic: string };
  field: string;
  fileName: string;
  maxBytes: number;
  goodType: string;
  okTypes: string[];
  badTypes: string[];
  caption: boolean;
  fileNameForwarded: boolean;
  queue: Spy;
};

const MiB = 1024 * 1024;
const FORM_SLACK = 256 * 1024;
const UUID = "3f2b8c1e-5d4a-4e6b-9a7c-1d2e3f4a5b6c";
const PHONE = "0555123456";
const JID = "213555123456@s.whatsapp.net";
const LID = "123456789012345@lid";
const SECRET_IN_ERROR = "SECRET-DB-PASSWORD-0003";
const ACTOR_CONTEXT = {
  actor: { kind: "person" as const, personId: "5".repeat(32), role: "operator" as const },
  shop: { shopId: "shop-a", name: "Shop A" },
};
const PRINCIPAL = { marker: "business-principal" };
const QUEUED = { messageId: "msg-queued-1", effectKey: "effect-key-1", replayed: false };
// The effect's own key and message id differ from the queue's on purpose: the answer must carry the QUEUE's.
const EFFECT = {
  effectKey: "effect-key-from-the-effect",
  messageId: "msg-from-the-effect",
  providerMessageId: "3EB0PROVIDER",
  state: "succeeded",
  attemptCount: 1,
  nextAttemptAt: null as string | null,
  errorCode: null as string | null,
  requiresDuplicateConfirmation: false,
};
const CONNECTED = { status: "connected", user: { id: "213555000111@s.whatsapp.net" }, hasQr: false };

const KINDS: readonly Kind[] = [
  {
    name: "image",
    mod: imageRoute,
    field: "image",
    fileName: "photo.jpg",
    maxBytes: 20 * MiB,
    goodType: "image/jpeg",
    okTypes: ["image/jpeg", "image/png", "image/webp"],
    badTypes: ["image/gif", "image/svg+xml", "image/heic", "application/pdf", "text/html", "application/octet-stream"],
    caption: true,
    fileNameForwarded: true,
    queue: h.queueImage,
  },
  {
    name: "document",
    mod: documentRoute,
    field: "document",
    fileName: "invoice.pdf",
    maxBytes: 64 * MiB,
    goodType: "application/pdf",
    okTypes: [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "text/plain",
      "text/csv",
    ],
    badTypes: ["application/zip", "text/html", "application/x-msdownload", "image/png", "application/vnd.ms-powerpoint", "application/octet-stream"],
    caption: true,
    fileNameForwarded: true,
    queue: h.queueDocument,
  },
  {
    name: "video",
    mod: videoRoute,
    field: "video",
    fileName: "clip.mp4",
    maxBytes: 64 * MiB,
    goodType: "video/mp4",
    okTypes: ["video/mp4"],
    badTypes: ["video/webm", "video/quicktime", "video/x-matroska", "audio/mp4", "image/png", "application/octet-stream"],
    caption: true,
    fileNameForwarded: true,
    queue: h.queueVideo,
  },
  {
    name: "voice",
    mod: voiceRoute,
    field: "audio",
    fileName: "note.ogg",
    maxBytes: 32 * MiB,
    goodType: "audio/ogg",
    okTypes: ["audio/ogg", "audio/opus", "audio/mpeg", "audio/mp4", "audio/aac", "audio/wav", "audio/x-wav"],
    // audio/webm, which is what a Chromium recorder produces, is refused here by design: the inbox recorder remuxes WebM/Opus
    // to Ogg Opus before it posts (stated in src/components/inbox/__tests__/inbox-outbound-voice-source-contract.test.ts,
    // a source-text test; the remux itself is not run here).
    badTypes: ["audio/webm", "audio/flac", "video/mp4", "image/png", "application/octet-stream"],
    caption: false,
    fileNameForwarded: false,
    queue: h.queueVoice,
  },
];
const IMAGE = KINDS[0] as Kind;
// vitest writes a string taken from `$name` between quotes (send-'image'), which no plain search for send-image finds.
// A [name, kind] table with %s gives the plain title.
const KIND_TABLE = KINDS.map((kind): [string, Kind] => [kind.name, kind]);

// A fifth media route added next to these four would escape the table above without this guard (`send` itself is the
// text route and has its own tests).
describe("the table above", () => {
  it("has one entry for every send-* route directory", () => {
    const directory = fileURLToPath(new URL("..", import.meta.url));
    const found = readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith("send-"))
      .map((entry) => entry.name)
      .sort();
    expect(found).toEqual(KINDS.map((kind) => `send-${kind.name}`).sort());
  });
});

function payload(size = 64) {
  const out = new Uint8Array(size);
  for (let i = 0; i < size; i += 1) out[i] = (i * 31 + 7) % 256;
  return out;
}

function fileOf(kind: Kind, over: { type?: string; name?: string; data?: BlobPart } = {}): File {
  return new File([over.data ?? payload()], over.name ?? kind.fileName, { type: over.type ?? kind.goodType });
}

/** A file of an exact size, made of one 1 MiB block repeated. Node copies Blob parts, so a 64 MiB file really takes 64 MiB. */
function bigFile(kind: Kind, size: number, type = kind.goodType): File {
  const block = new ArrayBuffer(MiB);
  const parts: BlobPart[] = [];
  let left = size;
  while (left >= MiB) {
    parts.push(block);
    left -= MiB;
  }
  if (left > 0) parts.push(new ArrayBuffer(left));
  return new File(parts, kind.fileName, { type });
}

type Over = {
  file?: File | string | null;
  meta?: Record<string, string | undefined>;
  headers?: Record<string, string>;
};

function formRequest(kind: Kind, over: Over = {}): NextRequest {
  const form = new FormData();
  const file = over.file === undefined ? fileOf(kind) : over.file;
  if (file !== null) form.set(kind.field, file);
  const meta: Record<string, string | undefined> = { clientMessageId: UUID, to: PHONE, ...over.meta };
  for (const [key, value] of Object.entries(meta)) {
    if (value !== undefined) form.set(key, value);
  }
  return new NextRequest(`http://localhost/api/whatsapp/send-${kind.name}`, {
    method: "POST",
    body: form,
    headers: over.headers,
  });
}

function call(kind: Kind, over: Over = {}) {
  return kind.mod.POST(formRequest(kind, over));
}

function rawRequest(kind: Kind, init: { contentType?: string; body?: string; headers?: Record<string, string> }): NextRequest {
  return new NextRequest(`http://localhost/api/whatsapp/send-${kind.name}`, {
    method: "POST",
    body: init.body,
    headers: { ...(init.contentType ? { "content-type": init.contentType } : {}), ...(init.headers ?? {}) },
  });
}

function endlessBody(totalChunks: number) {
  const state = { pulled: 0, cancelled: false };
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (state.pulled >= totalChunks) {
        controller.close();
        return;
      }
      state.pulled += 1;
      controller.enqueue(new Uint8Array(MiB));
    },
    cancel() {
      state.cancelled = true;
    },
  });
  return { stream, state };
}

/** A body of exactly `total` bytes, read in 1 MiB chunks, with no declared length. */
function sizedBody(total: number) {
  let sent = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= total) {
        controller.close();
        return;
      }
      const size = Math.min(MiB, total - sent);
      sent += size;
      controller.enqueue(new Uint8Array(size));
    },
  });
}

function firstCall(spy: { mock: { calls: unknown[][] } }): unknown[] {
  const first = spy.mock.calls[0];
  if (!first) throw new Error("the stand-in was never called");
  return first;
}

function firstOrder(spy: { mock: { invocationCallOrder: number[] } }): number {
  const first = spy.mock.invocationCallOrder[0];
  if (first === undefined) throw new Error("the stand-in was never called");
  return first;
}

function queueInput(kind: Kind): Record<string, unknown> {
  return firstCall(kind.queue)[1] as Record<string, unknown>;
}

function expectNothingStaged(): void {
  for (const spy of [h.queueImage, h.queueDocument, h.queueVideo, h.queueVoice, h.processEffect, h.deriveThumb, h.writeThumb]) {
    expect(spy).not.toHaveBeenCalled();
  }
}

async function bodyOf(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

beforeEach(() => {
  h.requireAction.mockReset().mockResolvedValue(ACTOR_CONTEXT);
  h.assertAction.mockReset().mockReturnValue(undefined);
  h.principal.mockReset().mockReturnValue(PRINCIPAL);
  h.status.mockReset().mockResolvedValue({ ...CONNECTED });
  h.findConversation.mockReset().mockResolvedValue(null);
  for (const queue of [h.queueImage, h.queueDocument, h.queueVideo, h.queueVoice]) {
    queue.mockReset().mockResolvedValue({ ...QUEUED });
  }
  h.processEffect.mockReset().mockResolvedValue({ ...EFFECT });
  h.deriveThumb.mockReset().mockResolvedValue(null);
  h.writeThumb.mockReset().mockResolvedValue({});
});

describe.each(KIND_TABLE)("POST /api/whatsapp/send-%s: who may use it", (_name, kind) => {
  it("is never statically rendered or cached by the framework", () => {
    expect(kind.mod.dynamic).toBe("force-dynamic");
  });

  it("exports POST and nothing else (a later GET or a new route option would be noticed here)", () => {
    expect(Object.keys(kind.mod).sort()).toEqual(["POST", "dynamic"]);
  });

  // The two helpers are stand-ins, so they cannot notice a misspelt permission. The real catalog and role table can.
  it("demands conversations.reply, then customers.contact.read for the actor's own shop, and both are real permissions", async () => {
    await call(kind);
    expect(h.requireAction).toHaveBeenCalledTimes(1);
    expect(h.requireAction).toHaveBeenCalledWith("conversations.reply");
    expect(h.assertAction).toHaveBeenCalledTimes(1);
    expect(h.assertAction).toHaveBeenCalledWith(ACTOR_CONTEXT, "customers.contact.read", { shopId: "shop-a" });
    const demanded = [firstCall(h.requireAction)[0], firstCall(h.assertAction)[1]] as Phase2Action[];
    for (const action of demanded) expect(PHASE2_ACTIONS as readonly string[], action).toContain(action);
    const holders = (["owner", "manager", "operator", "viewer"] as const).filter((role) =>
      demanded.every((action) => hasPhase2Permission(getPhase2PresetPermissions(role), action)),
    );
    expect(holders).toEqual(["owner", "manager", "operator"]);
  });

  it("stops at the first permission: no account check, no staging, no recipient lookup, and before the size check", async () => {
    h.requireAction.mockRejectedValue(new SahelFlowError("Forbidden", "ACTION_FORBIDDEN", 403));
    // A declared length over the limit would be a 413 if the size check ran before the permission.
    const response = await call(kind, { meta: { to: LID }, headers: { "content-length": String(kind.maxBytes + FORM_SLACK + 1) } });
    expect(response.status).toBe(403);
    expect(await bodyOf(response)).toMatchObject({ code: "ACTION_FORBIDDEN" });
    expect(h.assertAction).not.toHaveBeenCalled();
    expect(h.status).not.toHaveBeenCalled();
    expect(h.findConversation).not.toHaveBeenCalled();
    expectNothingStaged();
  });

  it("stops at the second permission: no account check, no staging, no recipient lookup, and before the size check", async () => {
    h.assertAction.mockImplementation(() => {
      throw new SahelFlowError("Forbidden", "ACTION_FORBIDDEN", 403);
    });
    const response = await call(kind, { meta: { to: LID }, headers: { "content-length": String(kind.maxBytes + FORM_SLACK + 1) } });
    expect(response.status).toBe(403);
    expect(await bodyOf(response)).toMatchObject({ code: "ACTION_FORBIDDEN" });
    expect(h.status).not.toHaveBeenCalled();
    expect(h.findConversation).not.toHaveBeenCalled();
    expectNothingStaged();
  });

  it("checks the permissions, then the account, then stages, then sends, in that order", async () => {
    await call(kind);
    const order = [h.requireAction, h.assertAction, h.status, kind.queue, h.processEffect].map(firstOrder);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
});

describe.each(KIND_TABLE)("POST /api/whatsapp/send-%s: how much it reads", (_name, kind) => {
  const formMax = kind.maxBytes + FORM_SLACK;

  it("refuses a declared length above the limit with 413, without asking the account", async () => {
    const response = await call(kind, { headers: { "content-length": String(formMax + 1) } });
    expect(response.status).toBe(413);
    expect(await bodyOf(response)).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(h.status).not.toHaveBeenCalled();
    expectNothingStaged();
  });

  it.each([
    ["exactly the limit", String(formMax)],
    ["a value that is not a number", "abc"],
    ["a negative number", "-5"],
    ["an empty value", ""],
  ])("lets a declared length of %s through to the normal checks", async (_label, length) => {
    const response = await call(kind, { headers: { "content-length": length } });
    expect(response.status).toBe(200);
    expect(h.status).toHaveBeenCalledTimes(1);
  });

  it("stops reading a body that has no declared length once it passes the limit, and refuses it with 413", async () => {
    const totalChunks = Math.ceil(formMax / MiB) + 40;
    const { stream, state } = endlessBody(totalChunks);
    const request = new NextRequest(`http://localhost/api/whatsapp/send-${kind.name}`, {
      method: "POST",
      body: stream,
      headers: { "content-type": "multipart/form-data; boundary=x" },
      duplex: "half",
    } as ConstructorParameters<typeof NextRequest>[1]);
    const response = await kind.mod.POST(request);
    expect(response.status).toBe(413);
    expect(await bodyOf(response)).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(state.cancelled).toBe(true);
    expect(state.pulled).toBeLessThan(totalChunks);
    expect(state.pulled).toBeLessThanOrEqual(Math.ceil(formMax / MiB) + 2);
    expectNothingStaged();
  }, 60_000);

  // The ceiling is exact: a body of precisely the limit is read in full (it is then found not to be valid multipart: 400),
  // one byte more is refused as too large (413).
  it.each([
    ["exactly the limit: read in full, then found not to be valid multipart", formMax, 400, new RegExp(`WhatsApp ${kind.name} multipart body is invalid`)],
    ["one byte over the limit: refused as too large", formMax + 1, 413, new RegExp(`WhatsApp ${kind.name} upload is larger than the accepted request boundary`)],
  ])("a body with no declared length that is %s", async (_label, total, expected, message) => {
    const request = new NextRequest(`http://localhost/api/whatsapp/send-${kind.name}`, {
      method: "POST",
      body: sizedBody(total),
      headers: { "content-type": "multipart/form-data; boundary=x" },
      duplex: "half",
    } as ConstructorParameters<typeof NextRequest>[1]);
    const response = await kind.mod.POST(request);
    expect(response.status).toBe(expected);
    // The message tells a body that was read in full and then found invalid from every other 400.
    expect(await bodyOf(response)).toMatchObject({ code: "VALIDATION_ERROR", error: expect.stringMatching(message) });
    expectNothingStaged();
  }, 60_000);

  it.each([
    ["application/json", "application/json"],
    ["plain text", "text/plain"],
    ["a type that only starts like multipart", "multipart/form-datax"],
    ["a type that only ends like multipart", "x-multipart/form-data"],
  ])("refuses a body whose content type is %s with 400, by the route's own check", async (_label, contentType) => {
    const response = await kind.mod.POST(rawRequest(kind, { contentType, body: "{}" }));
    expect(response.status).toBe(400);
    // The form parser would also refuse these with the same status and code; only the message tells the route's own
    // content-type check from the parser's refusal, and so tells a wrongly anchored pattern from the right one.
    expect(await bodyOf(response)).toMatchObject({
      code: "VALIDATION_ERROR",
      error: expect.stringMatching(new RegExp(`WhatsApp ${kind.name} send requires multipart form data`)),
    });
    expectNothingStaged();
  });

  it("accepts the multipart content type in capitals", async () => {
    const request = formRequest(kind);
    const bytes = new Uint8Array(await request.arrayBuffer());
    const type = (request.headers.get("content-type") ?? "").replace("multipart/form-data", "MULTIPART/FORM-DATA");
    const response = await kind.mod.POST(
      new NextRequest(request.url, { method: "POST", body: bytes, headers: { "content-type": type } }),
    );
    expect(response.status).toBe(200);
  });

  it("refuses a multipart request with no body with 400", async () => {
    const response = await kind.mod.POST(rawRequest(kind, { contentType: "multipart/form-data; boundary=x" }));
    expect(response.status).toBe(400);
    expect(await bodyOf(response)).toMatchObject({ code: "VALIDATION_ERROR", error: expect.stringMatching(/^Choose /) });
    expectNothingStaged();
  });

  it("answers 400 and not 500 for a body that is not valid multipart", async () => {
    const response = await kind.mod.POST(
      rawRequest(kind, { contentType: "multipart/form-data; boundary=zzz", body: "this is not a multipart body" }),
    );
    expect(response.status).toBe(400);
    expect(await bodyOf(response)).toMatchObject({
      code: "VALIDATION_ERROR",
      error: expect.stringMatching(new RegExp(`WhatsApp ${kind.name} multipart body is invalid`)),
    });
    expectNothingStaged();
  });
});

describe.each(KIND_TABLE)("POST /api/whatsapp/send-%s: the paired WhatsApp account", (_name, kind) => {
  it("answers 503 WHATSAPP_ACCOUNT_UNAVAILABLE when the sidecar cannot be asked, before it reads the body", async () => {
    h.status.mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:3100"));
    // A body that is not multipart would be a 400 if it were read first.
    const response = await kind.mod.POST(rawRequest(kind, { contentType: "text/plain", body: "x" }));
    expect(response.status).toBe(503);
    expect(await bodyOf(response)).toMatchObject({ code: "WHATSAPP_ACCOUNT_UNAVAILABLE" });
    expectNothingStaged();
  });

  it.each([
    ["not connected", { status: "disconnected", user: { id: "213555000111@s.whatsapp.net" }, hasQr: false }],
    ["waiting for a QR scan", { status: "connecting", user: null, hasQr: true }],
    ["connected but with no account", { status: "connected", user: null, hasQr: false }],
    ["connected with an empty account id", { status: "connected", user: { id: "" }, hasQr: false }],
  ])("answers 409 WHATSAPP_ACCOUNT_UNAVAILABLE, before the body is read, and stages nothing when the account is %s", async (_label, status) => {
    h.status.mockResolvedValue(status);
    // A body that is not multipart would be a 400 if it were read before the account is checked.
    const response = await kind.mod.POST(rawRequest(kind, { contentType: "text/plain", body: "x" }));
    expect(response.status).toBe(409);
    expect(await bodyOf(response)).toMatchObject({ code: "WHATSAPP_ACCOUNT_UNAVAILABLE" });
    expectNothingStaged();
  });
});

// The routes lower-case the declared type, but the platform's multipart parser has already done it: a part sent with
// `Content-Type: IMAGE/JPEG` comes out as a File of type image/jpeg. So a capital letter cannot reach the routes' own
// toLowerCase() and this layer cannot be tested for it. This control pins that platform fact with a hand-built body (a
// File built in JavaScript lower-cases its type at construction, which would prove nothing). It also pins what the
// parser does NOT do: spaces and parameters stay in the type, so the routes' own trim and split really matter.
describe("the declared type of an uploaded part", () => {
  async function typeOfPart(partContentType: string): Promise<string> {
    const boundary = "XBOUNDARYX";
    const body = `--${boundary}\r\nContent-Disposition: form-data; name="f"; filename="a.bin"\r\nContent-Type: ${partContentType}\r\n\r\nHELLO\r\n--${boundary}--\r\n`;
    const form = await new Response(body, { headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` } }).formData();
    const part = form.get("f");
    if (!(part instanceof File)) throw new Error("the part did not come back as a File");
    return part.type;
  }

  it("is lower-cased by the parser, but keeps spaces and parameters", async () => {
    expect(await typeOfPart("IMAGE/JPEG")).toBe("image/jpeg");
    expect(await typeOfPart("Image/Jpeg ; charset=x")).toBe("image/jpeg ; charset=x");
  });
});

describe.each(KIND_TABLE)("POST /api/whatsapp/send-%s: the file", (_name, kind) => {
  it.each([
    ["a text where the file should be", "not a file"],
    ["no file at all", null],
  ])("answers 400 when the form holds %s", async (_label, file) => {
    const response = await call(kind, { file });
    expect(response.status).toBe(400);
    expect(await bodyOf(response)).toMatchObject({ code: "VALIDATION_ERROR", error: expect.stringMatching(/^Choose /) });
    expectNothingStaged();
  });

  it("has accepted and refused types to try (an emptied list would silently skip the rows below)", () => {
    expect(kind.okTypes.length).toBeGreaterThan(0);
    expect(kind.badTypes.length).toBeGreaterThan(0);
  });

  it.each(kind.okTypes)("accepts the declared type %s and hands the queue exactly that type", async (type) => {
    const response = await call(kind, { file: fileOf(kind, { type }) });
    expect(response.status).toBe(200);
    expect(queueInput(kind).declaredMime).toBe(type);
  });

  it.each([
    ["a parameter after the type", `${kind.goodType}; charset=binary`],
    ["spaces between the type and the semicolon", `${kind.goodType}  ; charset=binary`],
  ])("reads the type without its parameters and its spaces: %s", async (_label, type) => {
    const response = await call(kind, { file: fileOf(kind, { type }) });
    expect(response.status).toBe(200);
    expect(queueInput(kind).declaredMime).toBe(kind.goodType);
  });

  it.each(kind.badTypes)("refuses the declared type %s with 400 and stages nothing", async (type) => {
    const response = await call(kind, { file: fileOf(kind, { type }) });
    expect(response.status).toBe(400);
    // The type-and-size message, not one of the other 400s (no file, bad recipient, bad multipart).
    expect(await bodyOf(response)).toMatchObject({ code: "VALIDATION_ERROR", error: expect.stringMatching(/no larger than \d+ MiB/) });
    expect(h.status).toHaveBeenCalledTimes(1);
    expectNothingStaged();
  });

  it("refuses an empty file with 400", async () => {
    const response = await call(kind, { file: fileOf(kind, { data: new Uint8Array(0) }) });
    expect(response.status).toBe(400);
    // Reaches the route's own size check (an empty part that the parser did not hand back as a File would be "Choose ...").
    expect(await bodyOf(response)).toMatchObject({ code: "VALIDATION_ERROR", error: expect.stringMatching(/no larger than \d+ MiB/) });
    expectNothingStaged();
  });

  it("accepts a file of exactly the size limit", async () => {
    const response = await call(kind, { file: bigFile(kind, kind.maxBytes) });
    expect(response.status).toBe(200);
    expect(queueInput(kind).declaredSize).toBe(kind.maxBytes);
  }, 60_000);

  it("refuses a file one byte over the size limit with 400", async () => {
    const response = await call(kind, { file: bigFile(kind, kind.maxBytes + 1) });
    expect(response.status).toBe(400);
    expect(await bodyOf(response)).toMatchObject({ code: "VALIDATION_ERROR", error: expect.stringMatching(/no larger than \d+ MiB/) });
    expectNothingStaged();
  }, 60_000);

  // OBSERVED, not endorsed as a defence: this layer reads only the type the browser DECLARED. The encrypted storage
  // layer classifies the bytes (per the route's own comment) and is not run here.
  it("OBSERVED: trusts the declared type, so bytes that are not what they claim reach the queue", async () => {
    const response = await call(kind, { file: fileOf(kind, { data: "<html><script>alert(1)</script></html>" }) });
    expect(response.status).toBe(200);
    expect(queueInput(kind).declaredMime).toBe(kind.goodType);
  });

  // OBSERVED, not endorsed: the name the browser sends is handed to the queue as it is. The platform keeps even a
  // hostile name intact through multipart (checked on Node 22), so any protection must live in the queue, which is a
  // stand-in here and was not read. Update the test if the route starts to sanitise the name.
  if (kind.fileNameForwarded) {
    it.each([
      ["path separators", "../../etc/passwd"],
      ["a backslash path", "dir\\evil.exe"],
      ["a right-to-left override that disguises the extension", "a\u202egpj.exe"],
      ["a 300-character name", `${"x".repeat(296)}.pdf`],
      ["Arabic letters and an accent", "caf\u00e9 \u0627\u0644.jpg"],
    ])("OBSERVED: hands the queue a file name with %s as it was sent", async (_label, name) => {
      const response = await call(kind, { file: fileOf(kind, { name }) });
      expect(response.status).toBe(200);
      expect(queueInput(kind).fileName).toBe(name);
    });
  }

  it("hands the queue the uploaded bytes unchanged, their size, and the context of this shop", async () => {
    const got: { staged: Uint8Array | null } = { staged: null };
    kind.queue.mockImplementation(async (_context: unknown, input: { source: ReadableStream<Uint8Array> }) => {
      got.staged = new Uint8Array(await new Response(input.source).arrayBuffer());
      return { ...QUEUED };
    });
    const response = await call(kind);
    expect(response.status).toBe(200);
    expect(got.staged).not.toBeNull();
    expect(Array.from(got.staged ?? [])).toEqual(Array.from(payload()));
    const input = queueInput(kind);
    expect(input.declaredSize).toBe(64);
    if (kind.fileNameForwarded) expect(input.fileName).toBe(kind.fileName);
    else expect(input).not.toHaveProperty("fileName");
    const [context] = firstCall(kind.queue) as [Record<string, unknown>];
    expect(context.prisma).toBe(db);
    expect(context.shop).toBe(ACTOR_CONTEXT.shop);
    expect(context.businessPrincipal).toBe(PRINCIPAL);
    expect(h.principal).toHaveBeenCalledWith(ACTOR_CONTEXT);
  });
});

describe.each(KIND_TABLE)("POST /api/whatsapp/send-%s: the form fields", (_name, kind) => {
  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["not a UUID", "not-a-uuid"],
    ["one character short", "3f2b8c1e-5d4a-4e6b-9a7c-1d2e3f4a5b6"],
  ])("answers 400 REQUEST_VALIDATION_FAILED when the client message id is %s", async (_label, clientMessageId) => {
    const response = await call(kind, { meta: { clientMessageId } });
    expect(response.status).toBe(400);
    expect(await bodyOf(response)).toMatchObject({ code: "REQUEST_VALIDATION_FAILED" });
    expectNothingStaged();
  });

  it("hands the queue the client message id as sent", async () => {
    await call(kind);
    expect(queueInput(kind).clientMessageId).toBe(UUID);
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["257 characters", "5".repeat(257)],
  ])("answers 400 REQUEST_VALIDATION_FAILED when the recipient is %s", async (_label, to) => {
    const response = await call(kind, { meta: { to } });
    expect(response.status).toBe(400);
    expect(await bodyOf(response)).toMatchObject({ code: "REQUEST_VALIDATION_FAILED" });
    expectNothingStaged();
  });

  it.each([
    ["a local number", "0555123456", JID],
    ["a number with spaces and a plus sign", "+213 555 12 34 56", JID],
    ["a JID", "213555123456@s.whatsapp.net", JID],
    ["a JID with a device suffix", "213555123456:12@s.whatsapp.net", JID],
    ["a number starting with 6", "0655123456", "213655123456@s.whatsapp.net"],
    ["a number starting with 7", "0755123456", "213755123456@s.whatsapp.net"],
    ["a number with spaces around it", "  0555123456  ", JID],
  ])("normalises %s and hands the queue the JID", async (_label, to, expected) => {
    const response = await call(kind, { meta: { to } });
    expect(response.status).toBe(200);
    expect(queueInput(kind).to).toBe(expected);
  });

  it.each([
    ["a group JID", "123456@g.us"],
    ["a broadcast JID", "120363025@broadcast"],
    ["a number whose operator digit is 4", "0455123456"],
    ["a number that is too short", "055512345"],
    ["a number that is too long", "05551234567"],
    ["letters", "abc"],
    ["spaces only", "   "],
    ["another domain", "0555123456@example.com"],
    ["an LID that starts with 0", "0123456789@lid"],
    ["256 characters (past the form check, refused by the normaliser)", "5".repeat(256)],
  ])("answers 400 VALIDATION_ERROR and stages nothing when the recipient is %s", async (_label, to) => {
    const response = await call(kind, { meta: { to } });
    expect(response.status).toBe(400);
    expect(await bodyOf(response)).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(h.findConversation).not.toHaveBeenCalled();
    expectNothingStaged();
  });

  it("does not look up a conversation for an ordinary number", async () => {
    await call(kind);
    expect(h.findConversation).not.toHaveBeenCalled();
  });

  if (kind.caption) {
    it("hands the queue an empty caption when none is sent, and the caption as sent otherwise", async () => {
      await call(kind);
      expect(queueInput(kind).caption).toBe("");
      h.queueImage.mockClear();
      h.queueDocument.mockClear();
      h.queueVideo.mockClear();
      await call(kind, { meta: { caption: "Votre commande est prête" } });
      expect(queueInput(kind).caption).toBe("Votre commande est prête");
    });

    it("accepts a caption of 4000 characters and refuses 4001 with 400 REQUEST_VALIDATION_FAILED", async () => {
      expect((await call(kind, { meta: { caption: "a".repeat(4000) } })).status).toBe(200);
      for (const spy of [h.queueImage, h.queueDocument, h.queueVideo, h.queueVoice, h.processEffect, h.deriveThumb, h.writeThumb]) {
        spy.mockClear();
      }
      const refused = await call(kind, { meta: { caption: "a".repeat(4001) } });
      expect(refused.status).toBe(400);
      expect(await bodyOf(refused)).toMatchObject({ code: "REQUEST_VALIDATION_FAILED" });
      // Refused before the file is staged, not only before it is sent.
      expectNothingStaged();
    });
  } else {
    it("sends no caption: one that is posted is dropped before the queue", async () => {
      await call(kind, { meta: { caption: "should not travel" } });
      expect(queueInput(kind)).not.toHaveProperty("caption");
    });
  }

  it.each([
    ["six characters", "abcdef"],
    ["96 characters", "A".repeat(96)],
    ["letters, digits, an underscore and a dash", "ab_-12"],
  ])("hands the queue a quoted message id of %s", async (_label, quotedMessageId) => {
    const response = await call(kind, { meta: { quotedMessageId } });
    expect(response.status).toBe(200);
    expect(queueInput(kind).quotedMessageId).toBe(quotedMessageId);
  });

  it.each([
    ["five characters", "abcde"],
    ["97 characters", "a".repeat(97)],
    ["a space", "has space"],
    ["slashes", "a/b/c/d/e"],
    ["a bad character before a valid id", "!abcdef"],
    ["a bad character after a valid id", "abcdef!"],
    ["a non-ASCII letter", "caf\u00e9-123"],
  ])("answers 400 REQUEST_VALIDATION_FAILED and stages nothing for a quoted message id of %s", async (_label, quotedMessageId) => {
    const response = await call(kind, { meta: { quotedMessageId } });
    expect(response.status).toBe(400);
    expect(await bodyOf(response)).toMatchObject({ code: "REQUEST_VALIDATION_FAILED" });
    expectNothingStaged();
  });

  it("treats an empty quoted message id as no quote", async () => {
    const response = await call(kind, { meta: { quotedMessageId: "" } });
    expect(response.status).toBe(200);
    expect(queueInput(kind).quotedMessageId).toBeUndefined();
  });

  it("hands the queue only the known fields: nothing else the browser adds to the form gets through, and the real file wins", async () => {
    await call(kind, {
      meta: {
        shopId: "other-shop",
        effectKey: "forged-effect",
        messageId: "forged-message",
        declaredMime: "application/x-evil",
        declaredSize: "1",
        source: "forged",
        fileName: "evil.exe",
        businessPrincipal: "forged",
      },
    });
    const input = queueInput(kind);
    const present = Object.keys(input).filter((key) => input[key] !== undefined).sort();
    const expected = [
      "clientMessageId",
      "declaredMime",
      "declaredSize",
      "source",
      "to",
      ...(kind.caption ? ["caption"] : []),
      ...(kind.fileNameForwarded ? ["fileName"] : []),
    ].sort();
    expect(present).toEqual(expected);
    expect(input.declaredMime).toBe(kind.goodType);
    expect(input.declaredSize).toBe(64);
    if (kind.fileNameForwarded) expect(input.fileName).toBe(kind.fileName);
    // The values of the fields the route does build, not only their names.
    expect(input.to).toBe(JID);
    expect(input.clientMessageId).toBe(UUID);
    expect(input.source).toBeInstanceOf(ReadableStream);
  });
});

describe.each(KIND_TABLE)("POST /api/whatsapp/send-%s: replying to an LID", (_name, kind) => {
  it("looks the chat up once, by channel and id, asking only for one inbound message", async () => {
    h.findConversation.mockResolvedValue({ messages: [{ id: "m1" }] });
    await call(kind, { meta: { to: LID } });
    expect(h.findConversation).toHaveBeenCalledTimes(1);
    expect(h.findConversation).toHaveBeenCalledWith({
      where: { channel_sourceId: { channel: "whatsapp", sourceId: LID } },
      select: { messages: { where: { direction: "inbound" }, select: { id: true }, take: 1 } },
    });
  });

  it("sends to the LID unchanged when the chat has an inbound message", async () => {
    h.findConversation.mockResolvedValue({ messages: [{ id: "m1" }] });
    const response = await call(kind, { meta: { to: LID } });
    expect(response.status).toBe(200);
    expect(queueInput(kind).to).toBe(LID);
  });

  // The provenance check must use the normalised recipient: the form value has spaces around it, the normaliser trims.
  it("looks up the trimmed LID, and refuses it without inbound provenance, when the form value has spaces around it", async () => {
    h.findConversation.mockResolvedValue(null);
    const response = await call(kind, { meta: { to: `  ${LID}  ` } });
    expect(response.status).toBe(400);
    expect(h.findConversation).toHaveBeenCalledTimes(1);
    expect(h.findConversation).toHaveBeenCalledWith(
      expect.objectContaining({ where: { channel_sourceId: { channel: "whatsapp", sourceId: LID } } }),
    );
    expectNothingStaged();
  });

  it.each([
    ["the shortest LID, 1 digit", "1@lid"],
    ["the longest LID, 20 digits", `${"9".repeat(20)}@lid`],
  ])("accepts %s when the chat has an inbound message", async (_label, lid) => {
    h.findConversation.mockResolvedValue({ messages: [{ id: "m1" }] });
    const response = await call(kind, { meta: { to: lid } });
    expect(response.status).toBe(200);
    expect(queueInput(kind).to).toBe(lid);
  });

  it.each([
    ["21 digits", `${"9".repeat(21)}@lid`],
    ["capital letters in the domain", "123456789012345@LID"],
  ])("refuses an LID of %s without looking anything up", async (_label, lid) => {
    h.findConversation.mockResolvedValue({ messages: [{ id: "m1" }] });
    const response = await call(kind, { meta: { to: lid } });
    expect(response.status).toBe(400);
    expect(h.findConversation).not.toHaveBeenCalled();
    expectNothingStaged();
  });

  it.each([
    ["no such chat", null],
    ["a chat with no inbound message", { messages: [] }],
  ])("answers 400 VALIDATION_ERROR and stages nothing for %s", async (_label, conversation) => {
    h.findConversation.mockResolvedValue(conversation);
    const response = await call(kind, { meta: { to: LID } });
    expect(response.status).toBe(400);
    expect(await bodyOf(response)).toMatchObject({ code: "VALIDATION_ERROR" });
    expectNothingStaged();
  });

  it("answers a generic 500 that holds no secret, and stages nothing, when the lookup fails", async () => {
    h.findConversation.mockRejectedValue(new Error(`connection refused for password ${SECRET_IN_ERROR}`));
    const response = await call(kind, { meta: { to: LID } });
    expect(response.status).toBe(500);
    const text = JSON.stringify(await response.json());
    expect(text).toContain("Internal server error");
    expect(text).not.toContain(SECRET_IN_ERROR);
    expectNothingStaged();
  });
});

describe.each(KIND_TABLE)("POST /api/whatsapp/send-%s: the answer", (_name, kind) => {
  it("sends the effect of what the queue returned, in the same context, and answers 200 with every field", async () => {
    const response = await call(kind);
    expect(response.status).toBe(200);
    expect(await bodyOf(response)).toEqual({
      ok: true,
      accepted: true,
      replayed: false,
      id: "3EB0PROVIDER",
      messageId: "msg-queued-1",
      effectKey: "effect-key-1",
      state: "succeeded",
      attemptCount: 1,
      nextAttemptAt: null,
      errorCode: null,
      requiresDuplicateConfirmation: false,
    });
    expect(h.processEffect).toHaveBeenCalledTimes(1);
    const [context, effectKey] = firstCall(h.processEffect) as [unknown, string];
    expect(effectKey).toBe("effect-key-1");
    expect(context).toBe(firstCall(kind.queue)[0]);
    expect(h.processEffect.mock.calls[0]).toHaveLength(2);
    // Only the image route makes a thumbnail.
    if (kind !== IMAGE) {
      expect(h.deriveThumb).not.toHaveBeenCalled();
      expect(h.writeThumb).not.toHaveBeenCalled();
    }
  });

  it.each([
    ["succeeded", 200, true, true],
    ["queued", 202, false, true],
    ["processing", 202, false, true],
    ["retrying", 202, false, true],
    ["ambiguous", 409, false, false],
    ["dead_letter", 409, false, false],
  ])("answers state %s with status %i, ok %s and accepted %s", async (state, status, ok, accepted) => {
    h.processEffect.mockResolvedValue({ ...EFFECT, state });
    const response = await call(kind);
    expect(response.status).toBe(status);
    const body = await bodyOf(response);
    expect(body.ok).toBe(ok);
    expect(body.accepted).toBe(accepted);
    expect(body.state).toBe(state);
  });

  it("passes on the retry schedule, the error code and the duplicate warning of the effect, and the replay flag of the queue", async () => {
    h.queueImage.mockResolvedValue({ ...QUEUED, replayed: true });
    h.queueDocument.mockResolvedValue({ ...QUEUED, replayed: true });
    h.queueVideo.mockResolvedValue({ ...QUEUED, replayed: true });
    h.queueVoice.mockResolvedValue({ ...QUEUED, replayed: true });
    h.processEffect.mockResolvedValue({
      ...EFFECT,
      state: "ambiguous",
      providerMessageId: null,
      attemptCount: 3,
      nextAttemptAt: "2026-10-21T23:30:00.000Z",
      errorCode: "WHATSAPP_SEND_OUTCOME_UNKNOWN",
      requiresDuplicateConfirmation: true,
    });
    const response = await call(kind);
    expect(response.status).toBe(409);
    expect(await bodyOf(response)).toEqual({
      ok: false,
      accepted: false,
      replayed: true,
      id: null,
      messageId: "msg-queued-1",
      effectKey: "effect-key-1",
      state: "ambiguous",
      attemptCount: 3,
      nextAttemptAt: "2026-10-21T23:30:00.000Z",
      errorCode: "WHATSAPP_SEND_OUTCOME_UNKNOWN",
      requiresDuplicateConfirmation: true,
    });
  });

  it("passes a coded refusal from the queue on with its own status, and sends nothing", async () => {
    kind.queue.mockRejectedValue(new SahelFlowError("The account changed", "WHATSAPP_ACCOUNT_UNAVAILABLE", 409));
    const response = await call(kind);
    expect(response.status).toBe(409);
    expect(await bodyOf(response)).toMatchObject({ code: "WHATSAPP_ACCOUNT_UNAVAILABLE" });
    expect(h.processEffect).not.toHaveBeenCalled();
  });

  it("answers a generic 500 that holds no secret, and sends nothing, when the queue fails", async () => {
    kind.queue.mockRejectedValue(new Error(`disk full while writing ${SECRET_IN_ERROR}`));
    const response = await call(kind);
    expect(response.status).toBe(500);
    const text = JSON.stringify(await response.json());
    expect(text).toContain("Internal server error");
    expect(text).not.toContain(SECRET_IN_ERROR);
    expect(h.processEffect).not.toHaveBeenCalled();
  });

  // OBSERVED, not endorsed: the message is already committed by the queue when the send step fails, and the route has no
  // handling around that step, so the caller is told 500 about a message that was already queued (what the outbox does
  // with it afterwards is not run here). If the inbox then retries with a NEW clientMessageId, the customer could get a
  // second copy: replay protection works only for the same id. Whether the inbox does that was not checked. Replace this
  // test when the route answers 202 for a queued message whose send step failed.
  it("OBSERVED: answers a generic 500 when the send step fails, after the message was already queued", async () => {
    h.processEffect.mockRejectedValue(new Error(`provider timeout ${SECRET_IN_ERROR}`));
    const response = await call(kind);
    expect(response.status).toBe(500);
    const text = JSON.stringify(await response.json());
    expect(text).toContain("Internal server error");
    expect(text).not.toContain(SECRET_IN_ERROR);
    expect(kind.queue).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/whatsapp/send-image: the thumbnail (image only)", () => {
  const THUMB_BYTES = [9, 8, 7, 6];

  it("derives a thumbnail from the uploaded bytes and stores it for the queued message, between the queue and the send", async () => {
    const got: { derivedFrom: Uint8Array | null; stored: Uint8Array | null } = { derivedFrom: null, stored: null };
    h.deriveThumb.mockImplementation(async (bytes: Buffer) => {
      got.derivedFrom = new Uint8Array(bytes);
      return Buffer.from(THUMB_BYTES);
    });
    h.writeThumb.mockImplementation(async (_context: unknown, input: { source: ReadableStream<Uint8Array> }) => {
      got.stored = new Uint8Array(await new Response(input.source).arrayBuffer());
      return {};
    });
    const response = await call(IMAGE);
    expect(response.status).toBe(200);
    expect(got.derivedFrom).not.toBeNull();
    expect(Array.from(got.derivedFrom ?? [])).toEqual(Array.from(payload()));
    expect(Array.from(got.stored ?? [])).toEqual(THUMB_BYTES);
    const [context, input] = firstCall(h.writeThumb) as [unknown, { messageId: string }];
    expect(context).toBe(firstCall(h.queueImage)[0]);
    expect(input.messageId).toBe("msg-queued-1");
    const order = [h.queueImage, h.deriveThumb, h.writeThumb, h.processEffect].map(firstOrder);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("writes nothing when no thumbnail can be derived, and still sends", async () => {
    h.deriveThumb.mockResolvedValue(null);
    const response = await call(IMAGE);
    expect(response.status).toBe(200);
    expect(h.deriveThumb).toHaveBeenCalledTimes(1);
    expect(h.writeThumb).not.toHaveBeenCalled();
    expect(h.processEffect).toHaveBeenCalledTimes(1);
  });

  it("still sends, and answers 200, when deriving the thumbnail fails", async () => {
    h.deriveThumb.mockRejectedValue(new Error("decoder crashed"));
    const response = await call(IMAGE);
    expect(response.status).toBe(200);
    expect(h.writeThumb).not.toHaveBeenCalled();
    expect(h.processEffect).toHaveBeenCalledTimes(1);
  });

  it("still sends, and answers 200, when storing the thumbnail fails", async () => {
    h.deriveThumb.mockResolvedValue(Buffer.from(THUMB_BYTES));
    h.writeThumb.mockRejectedValue(new Error("disk full"));
    const response = await call(IMAGE);
    expect(response.status).toBe(200);
    expect(h.processEffect).toHaveBeenCalledTimes(1);
  });

  // OBSERVED: both wipes happen only on the success path. imageBytes.fill(0) is not in a finally, so a queue that rejects
  // leaves up to 20 MiB of the customer's image in memory until garbage collection, and a thumbnail whose store rejects is
  // not zeroed either. These two tests pin the success path only; nothing here pins the failure path, because that is a
  // route observation, not a promise the route makes.
  it("after a successful queue and thumbnail store, wipes the image bytes it kept in memory and the thumbnail", async () => {
    const seen: { image: Buffer | null; thumb: Buffer } = { image: null, thumb: Buffer.from(THUMB_BYTES) };
    h.deriveThumb.mockImplementation(async (bytes: Buffer) => {
      seen.image = bytes;
      return seen.thumb;
    });
    await call(IMAGE);
    expect(seen.image).not.toBeNull();
    expect(seen.image?.length).toBe(64);
    expect(seen.image?.every((byte) => byte === 0)).toBe(true);
    expect(seen.thumb.every((byte) => byte === 0)).toBe(true);
  });

  it("wipes the image bytes even when the thumbnail could not be made", async () => {
    const seen: { image: Buffer | null } = { image: null };
    h.deriveThumb.mockImplementation(async (bytes: Buffer) => {
      seen.image = bytes;
      throw new Error("decoder crashed");
    });
    await call(IMAGE);
    expect(seen.image?.length).toBe(64);
    expect(seen.image?.every((byte) => byte === 0)).toBe(true);
  });
});
