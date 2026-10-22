import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// POST /api/extraction/image reads an order out of a screenshot the seller drops into the agents composer. The picture
// leaves the device toward the seller's own Gemini account, so the ORDER of the checks is the point. The route asks, in this
// order: may this member use AI and see customer contact details; did the seller consent; is the declared length small
// enough; is the request a multipart form, and are the bytes really read within the ceiling; is there a non-empty file within
// 10 MiB; does it LOOK like a JPEG, PNG or WebP by its first bytes (never by what the browser declared); is the rate limit
// free (only a picture that passed uses a place); and only then the stored key is read and the picture is handed to the
// extractor. The copy of the bytes handed to the extractor is zeroed afterwards (the form buffer and the parsed File are not
// wiped), and one metric row without content is recorded, best effort.
//
// Real code under test: the route, withErrorHandler (so each refusal has the real status and body), SahelFlowError, the real
// Request/FormData/File of Node 22, the Phase 2 permission catalog and role table (to say who holds the two permissions) and,
// in one test, the real rate limiter. Stand-ins: requireAuth and getCurrentUserKey (the same authorization chain runs for
// real in context-route.test.ts in the inbox folder), the settings read, the secret store, the database handle, the rate
// limiter (canned, except in the one test that says so), extractOrderFromImage and recordExtractionMetric (the Gemini call
// and the metrics table are NOT run here), redactError (identity) and the logger/monitoring hooks withErrorHandler calls. So
// the "holds no secret" tests prove the HTTP body only, not the log or Sentry path; they check that the error was logged
// once. withErrorHandler's shop-authority and licence hooks only run when NODE_ENV is production, so those two mocks are
// inert here and the production checks that run before the route are NOT tested.
//
// Two tests say "(observed)" because they pin what looks unintended: the hourly budget of 20 screenshots is one bucket shared
// by every member (the bucket name is a constant), and a screenshot the extractor could not read is still an HTTP 200 (the
// screen must look at the result). Two paths are only simulated: the real extractor turns every failure into a result and
// never throws, and the real recordExtractionMetric catches its own errors, so the tests that make them throw or reject use
// stand-ins to pin what the ROUTE does if that ever changes (a generic 500 and no metric; an answer that is still sent).
// Not pinned: the default file name "screenshot" (a part with an empty file name is parsed as text by Node 22 and refused
// before the route reaches the default), and the length tests in front of each signature (they are redundant with the byte
// tests behind them).
const h = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  userKey: vi.fn(),
  getBool: vi.fn(),
  getSecret: vi.fn(),
  rate: vi.fn(),
  extract: vi.fn(),
  metric: vi.fn(),
  // A plain function the metric stand-in calls when it is set. A vi.fn() attaches its own handler to every promise it returns
  // (to fill mock.settledResults), so a rejection returned by the spy can never be "unhandled"; this slot can.
  rawMetric: { fn: null as null | ((...args: unknown[]) => unknown) },
  logError: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({ requireAuth: h.requireAuth, getCurrentUserKey: h.userKey }));
vi.mock("@/lib/settings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/settings")>()),
  getBool: h.getBool,
}));
vi.mock("@/lib/secrets", () => ({ getSecret: h.getSecret }));
vi.mock("@/lib/ai/rate-limit", () => ({ checkRateLimit: h.rate }));
vi.mock("@/lib/ai/extraction", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/extraction")>()),
  extractOrderFromImage: h.extract,
  recordExtractionMetric: (...args: unknown[]) => (h.rawMetric.fn ? h.rawMetric.fn(...args) : (h.metric as (...a: unknown[]) => unknown)(...args)),
}));
vi.mock("@/lib/db", () => ({
  db: { name: "the-prisma-client" },
  shopContext: { shopId: "shop-a", registryRevision: 4, workspaceId: "1".repeat(32) },
}));
vi.mock("@/lib/logger", () => ({
  logger: { error: h.logError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/monitoring/sentry", () => ({ captureError: vi.fn() }));
vi.mock("@/lib/redact-pii", () => ({ redactError: (error: unknown) => error }));
vi.mock("@/lib/shops/authority", () => ({ assertProcessShopAuthority: vi.fn() }));
vi.mock("@/lib/license/license-authority", () => ({ requireLicenseEntitlement: vi.fn() }));

import * as route from "@/app/api/extraction/image/route";
import { MAX_EXTRACTION_IMAGE_BYTES } from "@/lib/ai/extraction";
import { db, shopContext } from "@/lib/db";
import { PHASE2_ACTIONS, getPhase2PresetPermissions, hasPhase2Permission, type Phase2Action } from "@/lib/identity/permissions";
import { SETTING_KEYS } from "@/lib/settings";
import { SahelFlowError } from "@/types/errors";

const { POST } = route;

const MiB = 1024 * 1024;
const LIMIT = 10 * MiB;
const FORM_MAX = LIMIT + 256 * 1024;
const ENDPOINT = "http://localhost/api/extraction/image";
const MULTIPART = "multipart/form-data; boundary=x";
const SECRET_IN_ERROR = "SECRET-DB-PASSWORD-0004";
const STORED_KEY = "AIza-stored-key-0005";
const USER_KEY = "session-key-1";
const TOO_BIG_MESSAGE = "Screenshot upload is larger than the accepted extraction boundary";
const CHOOSE_MESSAGE = "Choose a screenshot to read";
const TYPE_MESSAGE = "Only JPEG, PNG and WebP screenshots are supported";
const RESULT = {
  order: { customerName: "Amine", phone: "0555123456", wilaya: "Alger", items: [{ productName: "Casque", quantity: 1 }] },
  method: "gemini",
  confidence: 0.9,
  isComplete: false,
  missingFields: ["address"],
  raw: { model: "gemini-test", source: "screenshot" },
};

const JPEG_HEAD = [0xff, 0xd8, 0xff, 0xe0];
const PNG_HEAD = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const WEBP_HEAD = [0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50];
const ascii = (text: string) => [...text].map((letter) => letter.charCodeAt(0));

/** Bytes that start with `head` and continue with a pattern that never holds a 0, so "zeroed afterwards" can be seen. */
function bytesWith(head: readonly number[], size = head.length + 52): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(Math.max(size, head.length));
  for (let i = 0; i < out.length; i += 1) out[i] = ((i * 31 + 7) % 251) + 1;
  out.set(head, 0);
  return out;
}

function fileOf(bytes: Uint8Array<ArrayBuffer>, name = "order.png", type = "image/png"): File {
  return new File([bytes], name, { type });
}

type Over = {
  file?: File | string | null;
  fields?: Record<string, string | File>;
  headers?: Record<string, string>;
};

function formRequest(over: Over = {}): NextRequest {
  const form = new FormData();
  const file = over.file === undefined ? fileOf(bytesWith(PNG_HEAD)) : over.file;
  if (file !== null) form.set("image", file);
  for (const [key, value] of Object.entries(over.fields ?? {})) form.set(key, value);
  return new NextRequest(ENDPOINT, { method: "POST", body: form, headers: over.headers });
}

function call(over: Over = {}) {
  return POST(formRequest(over));
}

/** A body that is never read until the route asks for it (highWaterMark 0), so `pulled` counts the route's reads. */
function lazyBody(totalBytes: number, chunkSize = MiB) {
  const state = { pulled: 0, cancelled: false };
  let sent = 0;
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        state.pulled += 1;
        if (sent >= totalBytes) {
          controller.close();
          return;
        }
        const size = Math.min(chunkSize, totalBytes - sent);
        sent += size;
        controller.enqueue(new Uint8Array(size));
      },
      cancel() {
        state.cancelled = true;
      },
    },
    { highWaterMark: 0 },
  );
  return { stream, state };
}

function streamRequest(stream: ReadableStream<Uint8Array>, headers: Record<string, string> = { "content-type": MULTIPART }): NextRequest {
  return new NextRequest(ENDPOINT, { method: "POST", body: stream, headers, duplex: "half" } as ConstructorParameters<typeof NextRequest>[1]);
}

function firstOrder(spy: { mock: { invocationCallOrder: number[] } }): number {
  const first = spy.mock.invocationCallOrder[0];
  if (first === undefined) throw new Error("the stand-in was never called");
  return first;
}

function firstCall(spy: { mock: { calls: unknown[][] } }): unknown[] {
  const first = spy.mock.calls[0];
  if (!first) throw new Error("the stand-in was never called");
  return first;
}

/** What the extractor was handed: { fileName, mimeType, bytes } and { geminiApiKey }. */
function extractInput(): { fileName: string; mimeType: string; bytes: Uint8Array } {
  return firstCall(h.extract)[0] as { fileName: string; mimeType: string; bytes: Uint8Array };
}

function expectNothingDownstream(): void {
  for (const spy of [h.userKey, h.rate, h.getSecret, h.extract, h.metric]) expect(spy).not.toHaveBeenCalled();
}

async function bodyOf(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

beforeEach(() => {
  h.requireAuth.mockReset().mockResolvedValue({ actor: { kind: "person", personId: "5".repeat(32), role: "operator" }, shop: { shopId: "shop-a" } });
  h.userKey.mockReset().mockResolvedValue(USER_KEY);
  h.getBool.mockReset().mockResolvedValue(true);
  h.getSecret.mockReset().mockResolvedValue(STORED_KEY);
  h.rate.mockReset().mockReturnValue({ allowed: true });
  h.extract.mockReset().mockResolvedValue({ ...RESULT });
  h.metric.mockReset().mockResolvedValue(undefined);
  h.rawMetric.fn = null;
  h.logError.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("POST /api/extraction/image: who may use it", () => {
  it("is never statically rendered or cached by the framework", () => {
    expect(route.dynamic).toBe("force-dynamic");
  });

  it("exports POST and the dynamic flag, and nothing else", () => {
    expect(Object.keys(route).sort()).toEqual(["POST", "dynamic"]);
  });

  it("limits a screenshot to 10 MiB, the number every size test below is built on", () => {
    expect(MAX_EXTRACTION_IMAGE_BYTES).toBe(LIMIT);
  });

  it("demands ai.use and customers.contact.read in one call, and both are real permissions held by the owner, manager and operator only", async () => {
    await call();
    expect(h.requireAuth).toHaveBeenCalledTimes(1);
    expect(h.requireAuth).toHaveBeenCalledWith(["ai.use", "customers.contact.read"]);
    const demanded = firstCall(h.requireAuth)[0] as Phase2Action[];
    for (const action of demanded) expect(PHASE2_ACTIONS as readonly string[], action).toContain(action);
    const holders = (["owner", "manager", "operator", "viewer"] as const).filter((role) =>
      demanded.every((action) => hasPhase2Permission(getPhase2PresetPermissions(role), action)),
    );
    expect(holders).toEqual(["owner", "manager", "operator"]);
  });

  it.each([
    ["not signed in", 401, "TRUSTED_ACTOR_REQUIRED"],
    ["not allowed", 403, "ACTION_FORBIDDEN"],
  ])("answers %s with %i and reads nothing: not the consent, not the body, not the key, and before a declared length is judged", async (_label, status, code) => {
    h.requireAuth.mockRejectedValue(new SahelFlowError("Refused", code, status));
    const { stream, state } = lazyBody(MiB);
    // A declared length over the limit would be a 413 if the size check ran before the permission.
    const response = await POST(streamRequest(stream, { "content-type": MULTIPART, "content-length": String(FORM_MAX + 1) }));
    expect(response.status).toBe(status);
    expect(await bodyOf(response)).toEqual({ error: "Refused", code });
    expect(h.getBool).not.toHaveBeenCalled();
    expect(state.pulled).toBe(0);
    expectNothingDownstream();
  });

  it("checks the steps in order: permission, consent, rate limit, stored key, extraction, metric", async () => {
    await call();
    const order = [h.requireAuth, h.getBool, h.userKey, h.rate, h.getSecret, h.extract, h.metric].map(firstOrder);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
});

describe("POST /api/extraction/image: consent", () => {
  it("asks the shop's own settings for the Gemini consent, defaulting to no", async () => {
    await call();
    expect(h.getBool).toHaveBeenCalledTimes(1);
    const [context, key, fallback] = firstCall(h.getBool) as [{ prisma: unknown; shop: unknown }, string, boolean];
    expect(context.prisma).toBe(db);
    expect(context.shop).toBe(shopContext);
    expect(key).toBe(SETTING_KEYS.geminiConsentAccepted);
    expect(fallback).toBe(false);
  });

  it("answers 403 AI_CONSENT_REQUIRED, with the code the screen branches on, when the seller has not consented", async () => {
    h.getBool.mockResolvedValue(false);
    const response = await call();
    expect(response.status).toBe(403);
    const body = await bodyOf(response);
    expect(body).toMatchObject({ error: "consent_required", code: "AI_CONSENT_REQUIRED" });
    expect(String(body.message)).toContain("consent");
  });

  it("stops there: the body is not read, no place is used, no key is read, nothing is extracted or recorded", async () => {
    h.getBool.mockResolvedValue(false);
    const { stream, state } = lazyBody(MiB);
    const response = await POST(streamRequest(stream));
    expect(response.status).toBe(403);
    expect(state.pulled).toBe(0);
    expectNothingDownstream();
  });

  it.each([
    ["a declared length over the limit", { "content-type": MULTIPART, "content-length": String(FORM_MAX + 1) }],
    ["a body that is not multipart", { "content-type": "application/json" }],
  ])("is judged before %s, so a member who has not consented always hears about the consent", async (_label, headers) => {
    h.getBool.mockResolvedValue(false);
    const response = await POST(streamRequest(lazyBody(MiB).stream, headers));
    expect(response.status).toBe(403);
    expect(await bodyOf(response)).toMatchObject({ code: "AI_CONSENT_REQUIRED" });
  });

  it("answers a generic 500 that holds no secret, and reads nothing else, when the settings read fails", async () => {
    h.getBool.mockRejectedValue(new Error(`connection refused for password ${SECRET_IN_ERROR}`));
    const response = await call();
    expect(response.status).toBe(500);
    const text = JSON.stringify(await response.json());
    expect(text).toBe(JSON.stringify({ error: "Internal server error" }));
    expect(text).not.toContain(SECRET_IN_ERROR);
    expect(h.logError).toHaveBeenCalledTimes(1);
    expectNothingDownstream();
  });
});

describe("POST /api/extraction/image: how much it reads", () => {
  it("refuses a declared length above the limit plus 256 KiB of form slack with 413, without reading the body", async () => {
    const { stream, state } = lazyBody(MiB);
    const response = await POST(streamRequest(stream, { "content-type": MULTIPART, "content-length": String(FORM_MAX + 1) }));
    expect(response.status).toBe(413);
    expect(await bodyOf(response)).toEqual({ error: TOO_BIG_MESSAGE, code: "VALIDATION_ERROR" });
    expect(state.pulled).toBe(0);
    expectNothingDownstream();
  });

  it.each([
    ["exactly the limit", String(FORM_MAX)],
    ["a value that is not a number", "abc"],
    ["a negative number", "-5"],
    ["an empty value", ""],
  ])("lets a declared length of %s through to the normal checks", async (_label, length) => {
    const response = await call({ headers: { "content-length": length } });
    expect(response.status).toBe(200);
    expect(h.extract).toHaveBeenCalledTimes(1);
  });

  it("stops reading a body that has no declared length once it passes the limit, cancels it, and refuses it with 413", async () => {
    const { stream, state } = lazyBody(60 * MiB);
    const response = await POST(streamRequest(stream));
    expect(response.status).toBe(413);
    expect(await bodyOf(response)).toEqual({ error: TOO_BIG_MESSAGE, code: "VALIDATION_ERROR" });
    expect(state.cancelled).toBe(true);
    // 10 chunks of 1 MiB fit in the 10.25 MiB ceiling, the 11th does not; it must stop there, not read the 60.
    expect(state.pulled).toBeLessThanOrEqual(12);
    expectNothingDownstream();
  });

  it("reads a body of exactly the ceiling in full: it is then found not to be a form, which is a 400, not a 413", async () => {
    const { stream, state } = lazyBody(FORM_MAX);
    const response = await POST(streamRequest(stream));
    expect(response.status).toBe(400);
    expect(await bodyOf(response)).toEqual({ error: "The screenshot upload could not be read", code: "VALIDATION_ERROR" });
    expect(state.cancelled).toBe(false);
    expectNothingDownstream();
  });

  it("refuses a body one byte above the ceiling with 413", async () => {
    const { stream, state } = lazyBody(FORM_MAX + 1);
    const response = await POST(streamRequest(stream));
    expect(response.status).toBe(413);
    expect(state.cancelled).toBe(true);
    expectNothingDownstream();
  });

  it("accepts a picture of exactly 10 MiB and hands all of it to the extractor", async () => {
    const response = await call({ file: fileOf(bytesWith(PNG_HEAD, LIMIT)) });
    expect(response.status).toBe(200);
    expect(extractInput().bytes.byteLength).toBe(LIMIT);
  });

  it("judges a declared length before the type of the request: an over-long JSON request is a 413, not 'requires multipart', and is not read", async () => {
    const { stream, state } = lazyBody(MiB);
    const response = await POST(streamRequest(stream, { "content-type": "application/json", "content-length": String(FORM_MAX + 1) }));
    expect(response.status).toBe(413);
    expect(await bodyOf(response)).toEqual({ error: TOO_BIG_MESSAGE, code: "VALIDATION_ERROR" });
    expect(state.pulled).toBe(0);
    expectNothingDownstream();
  });

  it("judges the size of the picture before its type: a GIF one byte over 10 MiB is a 413, not the unsupported-type 400", async () => {
    const response = await call({ file: fileOf(bytesWith(ascii("GIF89a"), LIMIT + 1), "x.gif", "image/gif") });
    expect(response.status).toBe(413);
    expect(await bodyOf(response)).toEqual({ error: TOO_BIG_MESSAGE, code: "VALIDATION_ERROR" });
    expectNothingDownstream();
  });

  it("refuses a picture one byte over 10 MiB with 413 once it is read, even though the form fits its slack", async () => {
    const response = await call({ file: fileOf(bytesWith(PNG_HEAD, LIMIT + 1)) });
    expect(response.status).toBe(413);
    expect(await bodyOf(response)).toEqual({ error: TOO_BIG_MESSAGE, code: "VALIDATION_ERROR" });
    expectNothingDownstream();
  });
});

describe("POST /api/extraction/image: what a request must look like", () => {
  it.each([
    ["no content type", {} as Record<string, string>],
    ["application/json", { "content-type": "application/json" }],
    ["text/plain", { "content-type": "text/plain" }],
    ["multipart/mixed", { "content-type": "multipart/mixed; boundary=x" }],
    ["multipart/form-data-x", { "content-type": "multipart/form-data-x; boundary=x" }],
    ["a type that only contains multipart/form-data", { "content-type": "x-multipart/form-data; boundary=x" }],
  ])("refuses %s with 400 and does not read the body", async (_label, headers) => {
    const { stream, state } = lazyBody(MiB);
    const response = await POST(streamRequest(stream, headers));
    expect(response.status).toBe(400);
    expect(await bodyOf(response)).toEqual({ error: "Screenshot extraction requires multipart form data", code: "VALIDATION_ERROR" });
    expect(state.pulled).toBe(0);
    expectNothingDownstream();
  });

  it("refuses a multipart request with no body at all, asking to choose a screenshot", async () => {
    const response = await POST(new NextRequest(ENDPOINT, { method: "POST", headers: { "content-type": MULTIPART } }));
    expect(response.status).toBe(400);
    expect(await bodyOf(response)).toEqual({ error: CHOOSE_MESSAGE, code: "VALIDATION_ERROR" });
    expectNothingDownstream();
  });

  it("refuses a body that is not a well-formed form with 400, naming the upload", async () => {
    const response = await POST(streamRequest(lazyBody(2048).stream));
    expect(response.status).toBe(400);
    expect(await bodyOf(response)).toEqual({ error: "The screenshot upload could not be read", code: "VALIDATION_ERROR" });
    expectNothingDownstream();
  });

  // A content type of exactly multipart/form-data (no parameter, so no boundary) is still multipart: it passes the type
  // check and is then found unreadable, which has its own message. A check that wanted a ';' would say the other thing.
  it("treats a content type of exactly multipart/form-data as multipart: unreadable, not 'requires multipart'", async () => {
    const response = await POST(streamRequest(lazyBody(2048).stream, { "content-type": "multipart/form-data" }));
    expect(response.status).toBe(400);
    expect(await bodyOf(response)).toEqual({ error: "The screenshot upload could not be read", code: "VALIDATION_ERROR" });
    expectNothingDownstream();
  });

  // The request body is read through a reader; the route lets go of it again on the two ways out that throw (the body of a
  // request is a different stream from the one handed to the constructor, so it is the request's own body that is looked at).
  it.each([
    ["an unreadable form", () => lazyBody(2048).stream],
    ["a body over the ceiling", () => lazyBody(60 * MiB).stream],
  ])("leaves the request body unlocked after %s", async (_label, makeStream) => {
    const request = streamRequest(makeStream());
    await POST(request);
    expect(request.body?.locked).toBe(false);
  });

  it("does not care about the capitals of the content type", async () => {
    const form = new FormData();
    form.set("image", fileOf(bytesWith(PNG_HEAD)));
    const built = new Response(form);
    const type = built.headers.get("content-type") ?? "";
    const body = new Uint8Array(await built.arrayBuffer());
    const sent = type.replace("multipart/form-data", "MULTIPART/Form-Data");
    expect(sent).toMatch(/^MULTIPART\/Form-Data; boundary=/);
    const response = await POST(new NextRequest(ENDPOINT, { method: "POST", body, headers: { "content-type": sent } }));
    expect(response.status).toBe(200);
    expect(h.extract).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["no image field", { file: null } as Over],
    ["a field called file instead of image", { file: null, fields: { file: fileOf(bytesWith(PNG_HEAD)) } } as Over],
    ["an image field that is plain text", { file: "not a file" } as Over],
    ["an empty file", { file: fileOf(new Uint8Array(0)) } as Over],
  ])("refuses a form with %s: choose a screenshot, nothing downstream", async (_label, over) => {
    const response = await call(over);
    expect(response.status).toBe(400);
    expect(await bodyOf(response)).toEqual({ error: CHOOSE_MESSAGE, code: "VALIDATION_ERROR" });
    expectNothingDownstream();
  });
});

describe("POST /api/extraction/image: the type is read from the first bytes, never from what the browser said", () => {
  it.each([
    ["a JPEG", JPEG_HEAD, "image/jpeg"],
    ["a PNG", PNG_HEAD, "image/png"],
    ["a WebP", WEBP_HEAD, "image/webp"],
  ])("recognises %s by its signature and gives the extractor that type", async (_label, head, expected) => {
    const response = await call({ file: fileOf(bytesWith(head), "any.bin", "application/octet-stream") });
    expect(response.status).toBe(200);
    expect(extractInput().mimeType).toBe(expected);
  });

  it.each([
    ["a JPEG signature declared as text/plain", JPEG_HEAD, "text/plain", "image/jpeg"],
    ["a PNG declared as image/jpeg", PNG_HEAD, "image/jpeg", "image/png"],
    ["a WebP declared as image/png", WEBP_HEAD, "image/png", "image/webp"],
  ])("trusts the bytes over the declaration for %s", async (_label, head, declared, expected) => {
    const response = await call({ file: fileOf(bytesWith(head), "x.png", declared) });
    expect(response.status).toBe(200);
    expect(extractInput().mimeType).toBe(expected);
  });

  it.each([
    ["text declared as image/png", ascii("hello, this is not a picture at all"), "image/png"],
    ["a GIF declared as image/png", ascii("GIF89a....................."), "image/png"],
    ["a BMP", ascii("BM......................"), "image/png"],
    ["a PDF declared as image/jpeg", ascii("%PDF-1.4 ..............."), "image/jpeg"],
    ["an SVG", ascii('<svg xmlns="http://www.w3.org/2000/svg"/>'), "image/svg+xml"],
    ["a HEIC", [0, 0, 0, 0x18, ...ascii("ftypheic"), 0, 0, 0, 0], "image/heic"],
    ["a WAV file (RIFF but not WEBP)", [...ascii("RIFF"), 0x24, 0, 0, 0, ...ascii("WAVE")], "audio/wav"],
    ["a RIFF file whose WEBP is at the wrong place", [...ascii("RIFF"), 0x24, 0, 0, 0, ...ascii("WEB"), 0x00, 0x00], "image/webp"],
  ])("refuses %s with 400 and uses no place, key or extraction", async (_label, head, declared) => {
    const response = await call({ file: fileOf(bytesWith(head, Math.max(head.length, 40)), "x", declared) });
    expect(response.status).toBe(400);
    expect(await bodyOf(response)).toEqual({ error: TYPE_MESSAGE, code: "VALIDATION_ERROR" });
    expectNothingDownstream();
  });

  it.each([
    ["a JPEG signature of exactly 3 bytes", [0xff, 0xd8, 0xff], "image/jpeg"],
    ["a PNG signature of exactly 8 bytes", PNG_HEAD, "image/png"],
    ["a WebP header of exactly 12 bytes", WEBP_HEAD, "image/webp"],
  ])("accepts %s and nothing more", async (_label, head, expected) => {
    const response = await call({ file: fileOf(new Uint8Array(head)) });
    expect(response.status).toBe(200);
    expect(extractInput().mimeType).toBe(expected);
    expect(extractInput().bytes.byteLength).toBe(head.length);
  });

  // The length test in front of each signature (3, 8 and 12 bytes) is redundant with the byte tests behind it: an index
  // past the end reads undefined, which is never a signature byte. So a cut signature is refused either way, and these
  // rows pin that outcome, not the guard.
  it.each([
    ["a JPEG signature cut after 2 bytes", [0xff, 0xd8]],
    ["a PNG signature cut after 7 bytes", PNG_HEAD.slice(0, 7)],
    ["a WebP header cut after 11 bytes", WEBP_HEAD.slice(0, 11)],
    ["one byte", [0xff]],
  ])("refuses %s", async (_label, head) => {
    const response = await call({ file: fileOf(new Uint8Array(head)) });
    expect(response.status).toBe(400);
    expect(await bodyOf(response)).toMatchObject({ error: TYPE_MESSAGE });
    expectNothingDownstream();
  });

  // One wrong byte anywhere in a signature must be refused: a signature checked loosely would let other files through.
  // The WebP size bytes (4 to 7) are not part of the signature and may be anything.
  const WRONG: Array<[string, readonly number[], number]> = [
    ...JPEG_HEAD.slice(0, 3).map((_b, i): [string, readonly number[], number] => [`JPEG byte ${i}`, JPEG_HEAD, i]),
    ...PNG_HEAD.map((_b, i): [string, readonly number[], number] => [`PNG byte ${i}`, PNG_HEAD, i]),
    ...WEBP_HEAD.map((_b, i): [string, readonly number[], number] => [`WebP byte ${i}`, WEBP_HEAD, i]).filter(([, , i]) => i < 4 || i > 7),
  ];

  it.each(WRONG)("refuses a signature whose %s is wrong", async (_label, head, index) => {
    const broken = [...head];
    broken[index] = (broken[index] ?? 0) ^ 0x01;
    const response = await call({ file: fileOf(bytesWith(broken)) });
    expect(response.status).toBe(400);
    expect(await bodyOf(response)).toMatchObject({ error: TYPE_MESSAGE });
    expectNothingDownstream();
  });

  it("does not look at the WebP size bytes", async () => {
    const head = [...WEBP_HEAD];
    head.splice(4, 4, 0xde, 0xad, 0xbe, 0xef);
    const response = await call({ file: fileOf(bytesWith(head)) });
    expect(response.status).toBe(200);
    expect(extractInput().mimeType).toBe("image/webp");
  });

  it("covers every signature byte it claims to (a guard on the table above)", () => {
    expect(WRONG).toHaveLength(3 + 8 + 8);
  });
});

describe("POST /api/extraction/image: the file name the extractor is told", () => {
  it("uses the name of the file when the form gives none", async () => {
    await call({ file: fileOf(bytesWith(PNG_HEAD), "whatsapp-order.png") });
    expect(extractInput().fileName).toBe("whatsapp-order.png");
  });

  it("prefers the fileName field, trimmed", async () => {
    await call({ file: fileOf(bytesWith(PNG_HEAD), "ignored.png"), fields: { fileName: "  talab.png \n" } });
    expect(extractInput().fileName).toBe("talab.png");
  });

  it("passes an Arabic name through whole", async () => {
    await call({ fields: { fileName: "طلب أحمد.png" } });
    expect(extractInput().fileName).toBe("طلب أحمد.png");
  });

  it.each([
    ["an empty fileName", ""],
    ["a fileName of only spaces", "   \t "],
  ])("falls back to the name of the file for %s", async (_label, value) => {
    await call({ file: fileOf(bytesWith(PNG_HEAD), "own-name.png"), fields: { fileName: value } });
    expect(extractInput().fileName).toBe("own-name.png");
  });

  it("falls back to the name of the file when the fileName field is a file, not text", async () => {
    await call({ file: fileOf(bytesWith(PNG_HEAD), "own-name.png"), fields: { fileName: fileOf(new Uint8Array([1]), "decoy.png") } });
    expect(extractInput().fileName).toBe("own-name.png");
  });

  it.each([
    ["exactly 160 characters", 160, 160],
    ["161 characters", 161, 160],
    ["500 characters", 500, 160],
    ["159 characters", 159, 159],
  ])("cuts a fileName field of %s to at most 160", async (_label, length, expected) => {
    await call({ fields: { fileName: "a".repeat(length) } });
    expect(extractInput().fileName).toBe("a".repeat(expected));
  });

  it("trims a fileName field before cutting it, so leading spaces do not use up the 160", async () => {
    await call({ fields: { fileName: `   ${"b".repeat(200)}` } });
    expect(extractInput().fileName).toBe("b".repeat(160));
  });

  it("cuts the name of the file to 160 characters too", async () => {
    await call({ file: fileOf(bytesWith(PNG_HEAD), `${"c".repeat(200)}.png`) });
    expect(extractInput().fileName).toBe("c".repeat(160));
  });
});

describe("POST /api/extraction/image: the rate limit", () => {
  it("asks the limiter for the constant bucket extraction-image and the current user's key", async () => {
    await call();
    expect(h.userKey).toHaveBeenCalledTimes(1);
    expect(h.rate).toHaveBeenCalledTimes(1);
    expect(h.rate).toHaveBeenCalledWith("extraction-image", USER_KEY);
  });

  it("answers 429 AI_RATE_LIMITED with the limiter's own reason, and reads no key, extracts nothing and records nothing", async () => {
    h.rate.mockReturnValue({ allowed: false, reason: "Daily rate limit exceeded (100/day)", retryAfterMs: 5000 });
    const response = await call();
    expect(response.status).toBe(429);
    expect(await bodyOf(response)).toEqual({ error: "Daily rate limit exceeded (100/day)", code: "AI_RATE_LIMITED" });
    expect(h.getSecret).not.toHaveBeenCalled();
    expect(h.extract).not.toHaveBeenCalled();
    expect(h.metric).not.toHaveBeenCalled();
  });

  it("says Rate limited when the limiter gives no reason", async () => {
    h.rate.mockReturnValue({ allowed: false });
    const response = await call();
    expect(response.status).toBe(429);
    expect(await bodyOf(response)).toEqual({ error: "Rate limited", code: "AI_RATE_LIMITED" });
  });

  it.each([
    [1500, "2"],
    [1000, "1"],
    [1001, "2"],
    [1, "1"],
    [61_000, "61"],
    [3_600_000, "3600"],
  ])("rounds a wait of %i ms up to Retry-After %s seconds", async (retryAfterMs, expected) => {
    h.rate.mockReturnValue({ allowed: false, reason: "slow down", retryAfterMs });
    const response = await call();
    expect(response.headers.get("Retry-After")).toBe(expected);
  });

  it.each([
    ["no wait", undefined],
    ["a wait of 0", 0],
  ])("sends no Retry-After for %s", async (_label, retryAfterMs) => {
    h.rate.mockReturnValue({ allowed: false, reason: "slow down", retryAfterMs });
    const response = await call();
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBeNull();
  });

  it("answers a generic 500 when the session key cannot be read, and uses no place", async () => {
    h.userKey.mockRejectedValue(new Error(`session store down ${SECRET_IN_ERROR}`));
    const response = await call();
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).toBe(JSON.stringify({ error: "Internal server error" }));
    expect(h.logError).toHaveBeenCalledTimes(1);
    expect(h.rate).not.toHaveBeenCalled();
    expect(h.extract).not.toHaveBeenCalled();
  });

  // OBSERVED, not endorsed: the bucket name is the constant "extraction-image", and the limiter keeps the hourly budget of
  // 20 per bucket name and the daily 100 per user key. So one hourly budget of 20 screenshots is shared by every member
  // of the shop; one member can use it up for the others. Run with the REAL limiter and a fake clock.
  it("shares one hourly budget of 20 between all members, and gives it back an hour later (observed)", async () => {
    // A fresh copy of the limiter, so its module-level buckets are private to this test (a repeat or a retry starts clean).
    vi.resetModules();
    const real = await vi.importActual<typeof import("@/lib/ai/rate-limit")>("@/lib/ai/rate-limit");
    h.rate.mockImplementation(real.checkRateLimit);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2031-01-01T00:00:00.000Z"));
    for (let member = 1; member <= 20; member += 1) {
      h.userKey.mockResolvedValue(`member-${member}`);
      expect((await call()).status, `screenshot ${member}`).toBe(200);
    }
    h.userKey.mockResolvedValue("member-21");
    const refused = await call();
    expect(refused.status).toBe(429);
    expect(await bodyOf(refused)).toEqual({ error: "Session rate limit exceeded (20/hour)", code: "AI_RATE_LIMITED" });
    expect(refused.headers.get("Retry-After")).toBe("3600");
    expect(h.extract).toHaveBeenCalledTimes(20);
    vi.setSystemTime(new Date("2031-01-01T01:00:01.000Z"));
    expect((await call()).status).toBe(200);
  });
});

describe("POST /api/extraction/image: the stored key and the extraction", () => {
  it("reads the stored Gemini key from the shop's own secret store and hands it to the extractor as the only option", async () => {
    await call();
    expect(h.getSecret).toHaveBeenCalledTimes(1);
    const [context, key] = firstCall(h.getSecret) as [{ prisma: unknown; shop: unknown }, string];
    expect(context.prisma).toBe(db);
    expect(context.shop).toBe(shopContext);
    expect(key).toBe("gemini_api_key");
    expect(firstCall(h.extract)[1]).toStrictEqual({ geminiApiKey: STORED_KEY });
  });

  it("passes no key, not an empty one, when none is stored", async () => {
    h.getSecret.mockResolvedValue(null);
    const response = await call();
    expect(response.status).toBe(200);
    const options = firstCall(h.extract)[1] as { geminiApiKey?: string };
    expect(options.geminiApiKey).toBeUndefined();
  });

  it("hands the extractor exactly three things, the file name, the type found in the bytes and the bytes, and nothing else", async () => {
    const bytes = bytesWith(JPEG_HEAD, 300);
    await call({ file: fileOf(bytes, "shot.jpg", "application/octet-stream") });
    expect(h.extract).toHaveBeenCalledTimes(1);
    const input = extractInput();
    expect(Object.keys(input).sort()).toEqual(["bytes", "fileName", "mimeType"]);
    expect(input.fileName).toBe("shot.jpg");
    expect(input.mimeType).toBe("image/jpeg");
    expect(input.bytes).toBeInstanceOf(Uint8Array);
  });

  it("uploads the very bytes the extractor sees", async () => {
    const bytes = bytesWith(PNG_HEAD, 4096);
    let seen: Uint8Array | null = null;
    h.extract.mockImplementation(async (input: { bytes: Uint8Array }) => {
      seen = Uint8Array.from(input.bytes);
      return { ...RESULT };
    });
    await call({ file: fileOf(bytes) });
    expect(seen).not.toBeNull();
    expect([...(seen as unknown as Uint8Array)]).toEqual([...bytes]);
  });

  it("lets nothing else in the form reach the extractor: not a provider, not a key, not a type", async () => {
    await call({ fields: { provider: "https://evil.example", geminiApiKey: "AIza-from-the-browser", mimeType: "image/gif", apiKey: "x", model: "other" } });
    expect(firstCall(h.extract)[1]).toStrictEqual({ geminiApiKey: STORED_KEY });
    expect(extractInput().mimeType).toBe("image/png");
    expect(JSON.stringify([...firstCall(h.extract).slice(1), extractInput().fileName])).not.toContain("evil.example");
  });

  it("answers 200 with { result } exactly as the extractor returned it, through the real error handler", async () => {
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ result: RESULT });
    expect(response.headers.get("X-SahelFlow-Shop-Id")).toBe("shop-a");
    expect(response.headers.get("X-SahelFlow-Registry-Revision")).toBe("4");
  });

  // OBSERVED, not endorsed: a screenshot that could not be read is still an HTTP 200; the screen must look at the result.
  it("answers 200 even when the extractor found nothing and says why (observed)", async () => {
    const failed = { order: null, method: "none", confidence: 0, isComplete: false, missingFields: ["GEMINI_KEY_MISSING"] };
    h.extract.mockResolvedValue(failed);
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ result: failed });
  });

  it("zeroes the copy of the picture handed to the extractor after a successful extraction", async () => {
    let held: Uint8Array | null = null;
    let during: Uint8Array | null = null;
    h.extract.mockImplementation(async (input: { bytes: Uint8Array }) => {
      held = input.bytes;
      during = Uint8Array.from(input.bytes);
      return { ...RESULT };
    });
    await call({ file: fileOf(bytesWith(PNG_HEAD, 2048)) });
    expect((during as unknown as Uint8Array).some((byte) => byte !== 0)).toBe(true);
    expect((held as unknown as Uint8Array).byteLength).toBe(2048);
    expect((held as unknown as Uint8Array).every((byte) => byte === 0)).toBe(true);
  });

  it("zeroes the copy handed to the extractor also when the extractor could not read the picture, which is a result and not a throw", async () => {
    let held: Uint8Array | null = null;
    h.extract.mockImplementation(async (input: { bytes: Uint8Array }) => {
      held = input.bytes;
      return { order: null, method: "none", confidence: 0, isComplete: false, missingFields: ["GEMINI_PROVIDER_UNAVAILABLE"] };
    });
    const response = await call({ file: fileOf(bytesWith(PNG_HEAD, 2048)) });
    expect(response.status).toBe(200);
    expect((held as unknown as Uint8Array).byteLength).toBe(2048);
    expect((held as unknown as Uint8Array).every((byte) => byte === 0)).toBe(true);
  });

  // Only reachable with a stand-in (the real extractor never throws). Whether the bytes are zeroed then is deliberately not
  // pinned: the wipe is the line after the await, and a later move into a finally would be an improvement, not a break.
  it("answers a generic 500 that holds no secret and records no metric when the extractor throws", async () => {
    h.extract.mockImplementation(async () => {
      throw new Error(`provider exploded with key ${SECRET_IN_ERROR}`);
    });
    const response = await call();
    expect(response.status).toBe(500);
    const text = JSON.stringify(await response.json());
    expect(text).toBe(JSON.stringify({ error: "Internal server error" }));
    expect(text).not.toContain(SECRET_IN_ERROR);
    expect(h.logError).toHaveBeenCalledTimes(1);
    expect(h.metric).not.toHaveBeenCalled();
  });

  it("answers a generic 500 and does not extract when the secret store fails", async () => {
    h.getSecret.mockRejectedValue(new Error(`secret store failed ${SECRET_IN_ERROR}`));
    const response = await call();
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).toBe(JSON.stringify({ error: "Internal server error" }));
    expect(h.logError).toHaveBeenCalledTimes(1);
    expect(h.extract).not.toHaveBeenCalled();
    expect(h.metric).not.toHaveBeenCalled();
  });
});

describe("POST /api/extraction/image: the metric", () => {
  it("records one row for the shop's own database with the method, confidence, completeness and missing fields of the result", async () => {
    await call();
    expect(h.metric).toHaveBeenCalledTimes(1);
    const [context, metric] = firstCall(h.metric) as [{ prisma: unknown; shop: unknown }, Record<string, unknown>];
    expect(context.prisma).toBe(db);
    expect(context.shop).toBe(shopContext);
    expect(metric).toMatchObject({ method: "gemini", confidence: 0.9, isComplete: false, missingFields: ["address"] });
  });

  it("holds nothing about the picture or the customer: only the six metric fields", async () => {
    await call({ file: fileOf(bytesWith(PNG_HEAD), "private-customer-order.png"), fields: { fileName: "Amine 0555123456.png" } });
    const metric = firstCall(h.metric)[1] as Record<string, unknown>;
    expect(Object.keys(metric).sort()).toEqual(["confidence", "isComplete", "latencyMs", "method", "missingFields", "modelVersion"]);
    const text = JSON.stringify(metric);
    for (const forbidden of ["Amine", "0555123456", "private-customer-order", "Casque", "bytes"]) expect(text).not.toContain(forbidden);
  });

  it("names the model gemini-image when Gemini read the picture", async () => {
    await call();
    expect((firstCall(h.metric)[1] as { modelVersion?: string }).modelVersion).toBe("gemini-image");
  });

  // The image extractor has no regex path, so the "regex" row cannot happen today; it pins that the model is named only for gemini.
  it.each([
    ["none", "none"],
    ["regex", "regex"],
  ])("names no model when the method was %s", async (_label, method) => {
    h.extract.mockResolvedValue({ ...RESULT, method });
    await call();
    const metric = firstCall(h.metric)[1] as { method: string; modelVersion?: string };
    expect(metric.method).toBe(method);
    expect(metric.modelVersion).toBeUndefined();
  });

  it("passes the confidence of the result on, whatever it is", async () => {
    h.extract.mockResolvedValue({ ...RESULT, confidence: 0.35 });
    await call();
    expect((firstCall(h.metric)[1] as { confidence: number }).confidence).toBe(0.35);
  });

  it("passes the missing fields as the extractor gave them, including none", async () => {
    h.extract.mockResolvedValue({ ...RESULT, isComplete: true, missingFields: undefined });
    await call();
    const metric = firstCall(h.metric)[1] as { isComplete: boolean; missingFields?: string[] };
    expect(metric.isComplete).toBe(true);
    expect(metric.missingFields).toBeUndefined();
  });

  it("measures the latency of the extraction alone, in milliseconds: the time before it (reading the key) does not count", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2031-06-01T00:00:00.000Z"));
    h.getSecret.mockImplementation(async () => {
      vi.setSystemTime(new Date("2031-06-01T00:00:00.500Z"));
      return STORED_KEY;
    });
    h.extract.mockImplementation(async () => {
      vi.setSystemTime(new Date("2031-06-01T00:00:00.750Z"));
      return { ...RESULT };
    });
    await call();
    expect((firstCall(h.metric)[1] as { latencyMs: number }).latencyMs).toBe(250);
  });

  // The real recordExtractionMetric catches its own errors, so this rejection is a stand-in for something that cannot
  // happen today: it pins that the ROUTE would still answer, and would not leave an unhandled rejection behind. The
  // rejection comes from a plain function, not from the spy, because a spy handles every promise it returns.
  it("is best effort: a recorder that rejects changes neither the answer nor leaves an unhandled rejection", async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason);
    };
    let calls = 0;
    h.rawMetric.fn = () => {
      calls += 1;
      return Promise.reject(new Error(`metrics table locked ${SECRET_IN_ERROR}`));
    };
    process.on("unhandledRejection", onUnhandled);
    try {
      const response = await call();
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ result: RESULT });
      expect(calls).toBe(1);
      // Node reports an unhandled rejection after the microtasks of that turn are done: give it two turns.
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  it("is not waited for: a metric that never finishes does not hold the answer", async () => {
    h.metric.mockReturnValue(new Promise<void>(() => undefined));
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ result: RESULT });
  });
});
