import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// GET /api/inbox/media/[id] hands the seller the file a customer sent on WhatsApp (a photo, a voice note, a video, a
// document), decrypted from the encrypted media store. What matters: only a member who may read conversations AND see the
// customer's contact details gets anything, before the id is even looked at; the id is decoded, trimmed and bounded; the
// file answer (200, 206, 416 and the thumbnail) is never cacheable and never sniffed (private, no-store, nosniff); a Range request is
// answered exactly for the forms the route accepts and refused with 416 for each of the malformed forms listed in the table, without opening the file; the file name is sent in
// two forms (an ASCII fallback and the real name in filename*) and cannot break out of the header; documents are always
// downloads; the thumbnail variant is a separate, tighter path; and the decrypted bytes the route was handed are zeroed
// after the answer was built.
//
// Real code under test: the route, withErrorHandler (so each refusal has the real status and body), SahelFlowError, the REAL
// authorization chain (requireTrustedAction, assertTrustedAction, requireTrustedActor), the permission catalog and role table,
// and the real NextResponse and Headers of Node 22 (so a header value the platform refuses really fails). Stand-ins: the
// session authority and the durable identity lookup (they hand the real chain a role or an explicit permission list), the
// three media read functions (prepare, open, open thumbnail: their arguments are inspected and their answers are canned, so the
// decryption, the erase epoch, the integrity checks and the 404s of the media store are NOT tested here), the database handle and
// the logger/monitoring hooks withErrorHandler calls (its shop-authority and licence hooks only run when NODE_ENV is production,
// so those two mocks are inert here and the production checks that run before the route are NOT tested). The real media store
// refuses an empty file (its receipt schema needs sizeBytes to be positive, src/lib/whatsapp/media-read-service.ts line 50), so a
// zero-length file is not tested. The refusals of the trusted-actor chain are tested for the two 401 codes and the two 503 codes of a
// rejected session; the 404 and 500 JSON bodies carry no cache headers (that is withErrorHandler, not this route).
//
// Several tests say "(observed)": they pin what looks unintended and should be updated if the route changes on purpose. The file
// name fallback keeps semicolons and equals signs and the extended name leaves the characters ' ( ) * unescaped (the export
// routes now use a stricter helper, src/lib/import/export-disposition.ts); an accented letter becomes a letter plus an
// underscore in the fallback; a file name that cannot be percent-encoded (a lone surrogate) is a generic 500 after the file was
// opened; the Content-Range total is the size the open call reported, not the size the range was checked against (a divergence only the stand-in can produce: the real service echoes the prepared size); a
// malformed percent escape in the id is a generic 500; control characters of the C1 block pass the id check; and the thumbnail
// is always labelled image/jpeg whatever type the media store reports.
const h = vi.hoisted(() => ({
  getAuthority: vi.fn(),
  resolveIdentity: vi.fn(),
  prepare: vi.fn(),
  open: vi.fn(),
  thumb: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({ getCurrentSessionAuthority: h.getAuthority }));
vi.mock("@/lib/identity/control-authority", () => ({ resolveDurableIdentityActor: h.resolveIdentity }));
vi.mock("@/lib/whatsapp/media-read-service", () => ({
  prepareInboxWhatsAppMedia: h.prepare,
  openPreparedInboxWhatsAppMedia: h.open,
  openInboxWhatsAppThumbnail: h.thumb,
}));
vi.mock("@/lib/db", () => ({
  db: { name: "the-prisma-client" },
  shopContext: {
    workspaceId: "1".repeat(32),
    installationId: "2".repeat(32),
    shopId: "shop-a",
    shopIncarnationId: "3".repeat(32),
    registryRevision: 4,
    databaseFileId: "shop-a.db",
    migrationSetSha256: "4".repeat(64),
  },
}));
vi.mock("@/lib/logger", () => ({
  logger: { error: h.logError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/monitoring/sentry", () => ({ captureError: vi.fn() }));
vi.mock("@/lib/redact-pii", () => ({ redactError: (error: unknown) => error }));
vi.mock("@/lib/shops/authority", () => ({ assertProcessShopAuthority: vi.fn() }));
vi.mock("@/lib/license/license-authority", () => ({ requireLicenseEntitlement: vi.fn() }));

import * as route from "@/app/api/inbox/media/[id]/route";
import { db, shopContext } from "@/lib/db";
import { PHASE2_ACTIONS, getPhase2PresetPermissions, hasPhase2Permission, type Phase2Action } from "@/lib/identity/permissions";
import { SahelFlowError } from "@/types/errors";

const { GET } = route;

const ROLES = ["owner", "manager", "operator", "viewer"] as const;
type Role = (typeof ROLES)[number];
const SECRET_IN_ERROR = "SECRET-DB-PASSWORD-0007";
const IDENTITY = {
  personId: "5".repeat(32),
  workspaceMemberId: "6".repeat(32),
  deviceId: "7".repeat(32),
  policyVersion: 1,
  revocationEpoch: 0,
};
const BOTH = ["conversations.read", "customers.contact.read"];
const TOTAL = 1000;
const NO_CACHE = "private, no-store, max-age=0";
const NOT_FOUND = { error: "Media not found" };
const UNAVAILABLE = () => new SahelFlowError("This media is not available", "WHATSAPP_MEDIA_NOT_AVAILABLE", 404);

/** Bytes that never hold a 0, so "zeroed afterwards" can be seen. */
function pattern(size: number, from = 0): Buffer {
  const out = Buffer.alloc(size);
  for (let i = 0; i < size; i += 1) out[i] = ((from + i) * 31 + 7) % 251 + 1;
  return out;
}

type Opened = { bytes: Buffer; mediaType: string; fileName: string; kind: string; sizeBytes: number };
const state = { prepared: null as null | Record<string, unknown>, opened: [] as Opened[], thumbs: [] as Array<{ bytes: Buffer; mediaType: string }> };
let spec = { kind: "image", mediaType: "image/jpeg", fileName: "photo.jpg", total: TOTAL, reportedTotal: TOTAL, bytes: TOTAL };

function actingWith(permissions: readonly string[]): void {
  // The manager preset's ceiling holds both permissions, so each list used here is a legal custom policy for it.
  h.resolveIdentity.mockResolvedValue({ ...IDENTITY, role: "manager", permissions });
}

function actingAs(role: Role): void {
  h.resolveIdentity.mockResolvedValue({ ...IDENTITY, role, permissions: null });
}

function request(query = "", headers: Record<string, string> = {}, signal?: AbortSignal): NextRequest {
  return new NextRequest(`http://localhost/api/inbox/media/x${query}`, { method: "GET", headers, ...(signal ? { signal } : {}) });
}

function get(id = "msg-1", query = "", headers: Record<string, string> = {}) {
  return GET(request(query, headers), { params: Promise.resolve({ id }) });
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

function expectNothingRead(): void {
  expect(h.prepare).not.toHaveBeenCalled();
  expect(h.open).not.toHaveBeenCalled();
  expect(h.thumb).not.toHaveBeenCalled();
}

async function bodyOf(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

async function bytesOf(response: Response): Promise<Uint8Array> {
  return new Uint8Array(await response.arrayBuffer());
}

function headersOf(response: Response): Record<string, string> {
  return Object.fromEntries(response.headers.entries());
}

function lastOpened(): Opened {
  const last = state.opened[state.opened.length - 1];
  if (!last) throw new Error("no file was opened");
  return last;
}

beforeEach(() => {
  h.getAuthority.mockReset().mockResolvedValue({ status: "authenticated", sessionId: "inbox-media-session" });
  h.resolveIdentity.mockReset();
  actingWith(BOTH);
  spec = { kind: "image", mediaType: "image/jpeg", fileName: "photo.jpg", total: TOTAL, reportedTotal: TOTAL, bytes: TOTAL };
  state.opened = [];
  state.thumbs = [];
  h.prepare.mockReset().mockImplementation(async (_context: unknown, messageId: string) => {
    // The prepared object carries a different type and name on purpose: the answer must use what the open call reports.
    state.prepared = { messageId, kind: spec.kind === "document" ? "image" : "document", sizeBytes: spec.total, mediaType: `prepared/${spec.mediaType}`, fileName: `prepared-${spec.fileName}` };
    return state.prepared;
  });
  h.open.mockReset().mockImplementation(async (_context: unknown, _prepared: unknown, range?: { start: number; end: number }) => {
    const bytes = range ? pattern(range.end - range.start + 1, range.start) : pattern(spec.bytes);
    const opened = { bytes, mediaType: spec.mediaType, fileName: spec.fileName, kind: spec.kind, sizeBytes: spec.reportedTotal };
    state.opened.push(opened);
    return opened;
  });
  h.thumb.mockReset().mockImplementation(async () => {
    const thumb = { bytes: pattern(64), mediaType: "image/webp" };
    state.thumbs.push(thumb);
    return thumb;
  });
  h.logError.mockReset();
  state.prepared = null;
});

describe("GET /api/inbox/media/[id]: who may use it", () => {
  it("is never statically rendered or cached by the framework", () => {
    expect(route.dynamic).toBe("force-dynamic");
  });

  it("exports GET and the dynamic flag, and nothing else", () => {
    expect(Object.keys(route).sort()).toEqual(["GET", "dynamic"]);
  });

  it("grants only permissions that are real catalog actions (an unknown name would make every row below meaningless)", () => {
    for (const action of BOTH) expect(PHASE2_ACTIONS as readonly string[], action).toContain(action);
  });

  it("is held, in the real role table, by the owner, manager and operator, and not by the viewer", () => {
    const holders = ROLES.filter((role) => BOTH.every((action) => hasPhase2Permission(getPhase2PresetPermissions(role), action as Phase2Action)));
    expect(holders).toEqual(["owner", "manager", "operator"]);
  });

  it.each([
    ["owner", 200],
    ["manager", 200],
    ["operator", 200],
    ["viewer", 403],
  ] as Array<[Role, number]>)("a %s gets %i", async (role, status) => {
    actingAs(role);
    const response = await get();
    expect(response.status).toBe(status);
    expect(h.prepare).toHaveBeenCalledTimes(status === 200 ? 1 : 0);
  });

  it.each([
    ["no permission at all", [] as string[], "conversations.read"],
    ["customers.contact.read but not conversations.read", ["customers.contact.read"], "conversations.read"],
    ["conversations.read but not customers.contact.read", ["conversations.read"], "customers.contact.read"],
    ["customers.read and orders.read instead of the two", ["customers.read", "orders.read"], "conversations.read"],
  ])("answers 403 ACTION_FORBIDDEN naming %s's first missing permission, and reads nothing", async (_label, permissions, named) => {
    actingWith(permissions);
    const response = await get();
    expect(response.status).toBe(403);
    expect(await bodyOf(response)).toEqual({ error: `The current member is not authorized to perform ${named}`, code: "ACTION_FORBIDDEN" });
    expectNothingRead();
  });

  it("answers 403 before the id is judged: a viewer who sends a broken id, or a thumbnail request, is a 403, never a 404", async () => {
    actingAs("viewer");
    for (const response of [await get("%00"), await get("   "), await get("msg-1", "?variant=thumbnail"), await get("%E0%A4%A")]) {
      expect(response.status).toBe(403);
    }
    expectNothingRead();
  });

  it("answers 401 TRUSTED_ACTOR_REQUIRED before authentication setup is complete, and reads nothing", async () => {
    h.getAuthority.mockResolvedValue({ status: "setup" });
    const response = await get();
    expect(response.status).toBe(401);
    expect(await bodyOf(response)).toMatchObject({ code: "TRUSTED_ACTOR_REQUIRED" });
    expectNothingRead();
  });

  it("answers 401 IDENTITY_SESSION_BINDING_REQUIRED for a session with no durable identity, and reads nothing", async () => {
    h.resolveIdentity.mockResolvedValue(null);
    const response = await get();
    expect(response.status).toBe(401);
    expect(await bodyOf(response)).toMatchObject({ code: "IDENTITY_SESSION_BINDING_REQUIRED" });
    expectNothingRead();
  });

  it.each([
    ["no session", "SESSION_REQUIRED", 401, "Unauthorized", "UNAUTHORIZED"],
    ["an invalid session", "SESSION_INVALID", 401, "Unauthorized", "UNAUTHORIZED"],
    ["a session from an older format", "LEGACY_SESSION_UNSUPPORTED", 401, "Unauthorized", "UNAUTHORIZED"],
    ["an authentication secret that cannot be read", "AUTH_SECRET_UNAVAILABLE", 503, "Authentication authority is temporarily unavailable", "AUTH_SECRET_UNAVAILABLE"],
    ["a session authority that is down", "SESSION_AUTHORITY_UNAVAILABLE", 503, "Authentication authority is temporarily unavailable", "SESSION_AUTHORITY_UNAVAILABLE"],
  ])("answers the rejected session for %s (%s) with %i and the chain's own text, and reads nothing", async (_label, code, status, message, answerCode) => {
    h.getAuthority.mockResolvedValue({ status: "rejected", code });
    const response = await get();
    expect(response.status).toBe(status);
    expect(await bodyOf(response)).toEqual({ error: message, code: answerCode });
    expect(h.resolveIdentity).not.toHaveBeenCalled();
    expectNothingRead();
  });
});

describe("GET /api/inbox/media/[id]: the id", () => {
  it("hands the media store the shop's own database handle and context, and the id", async () => {
    await get("msg-42");
    const [context, id] = firstCall(h.prepare) as [{ prisma: unknown; shop: unknown }, string];
    expect(context.prisma).toBe(db);
    expect(context.shop).toBe(shopContext);
    expect(id).toBe("msg-42");
    expect(firstCall(h.open)[0]).toBe(context);
  });

  it.each([
    ["a percent escape", "msg%2Fone%3F", "msg/one?"],
    ["spaces around it", "%20%20msg-1%20", "msg-1"],
    ["a tab and a line feed around it", "%09msg-1%0A", "msg-1"],
    ["Arabic letters", encodeURIComponent("رسالة-1"), "رسالة-1"],
    ["a plus sign, which is not a space here", "a+b", "a+b"],
    ["a doubly encoded escape, decoded once", "a%2541", "a%41"],
  ])("decodes and trims %s", async (_label, raw, expected) => {
    expect((await get(raw)).status).toBe(200);
    expect(firstCall(h.prepare)[1]).toBe(expected);
  });

  it.each([
    ["an empty id", ""],
    ["an id of only spaces", "%20%20"],
    ["an id of only a tab and a line feed", "%09%0A"],
    ["an id with a NUL in it", "ab%00cd"],
    ["an id with a line feed in it", "ab%0Acd"],
    ["an id with a carriage return in it", "ab%0Dcd"],
    ["an id with U+001F in it", "ab%1Fcd"],
    ["an id with DEL (U+007F) in it", "ab%7Fcd"],
    ["an id of 257 characters", "a".repeat(257)],
    ["an id of 257 characters once decoded", "%61".repeat(257)],
  ])("answers 404 { error: 'Media not found' } for %s, with no code, and reads nothing", async (_label, raw) => {
    const response = await get(raw);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual(NOT_FOUND);
    expectNothingRead();
  });

  it.each([
    ["an id of 256 characters", "a".repeat(256)],
    ["an id of 256 characters after the spaces around it are trimmed", `%20${"a".repeat(256)}%20`],
    ["a space inside the id", "ab%20cd"],
    ["U+007E", "a~b"],
  ])("accepts %s", async (_label, raw) => {
    expect((await get(raw)).status).toBe(200);
    expect(h.prepare).toHaveBeenCalledTimes(1);
  });

  it("judges the thumbnail path's id the same way: a bad id is a 404 and the thumbnail is not opened", async () => {
    const response = await get("ab%00cd", "?variant=thumbnail");
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual(NOT_FOUND);
    expectNothingRead();
  });

  // OBSERVED, not endorsed: only the ASCII controls are refused. A C1 control character (U+0085) and a zero-width space pass
  // the check and reach the media store, which then decides.
  it("lets C1 control characters and a zero-width space through to the media store (observed)", async () => {
    expect((await get("a%C2%85b")).status).toBe(200);
    expect(firstCall(h.prepare)[1]).toBe("a\u0085b");
    h.prepare.mockClear();
    expect((await get("a%E2%80%8Bb")).status).toBe(200);
    expect(firstCall(h.prepare)[1]).toBe("a\u200Bb");
  });

  // OBSERVED, not endorsed: decodeURIComponent throws on a malformed escape, which nothing catches but the generic handler.
  it("answers a generic 500 for a malformed percent escape in the id, and reads nothing (observed)", async () => {
    const response = await get("%E0%A4%A");
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).toBe(JSON.stringify({ error: "Internal server error" }));
    expect(h.logError).toHaveBeenCalledTimes(1);
    expectNothingRead();
  });
});

describe("GET /api/inbox/media/[id]: the whole file", () => {
  it("prepares the file, then opens the prepared file with no range and the request's abort signal, in that order", async () => {
    const controller = new AbortController();
    const response = await GET(request("", {}, controller.signal), { params: Promise.resolve({ id: "msg-1" }) });
    expect(response.status).toBe(200);
    expect(h.prepare).toHaveBeenCalledTimes(1);
    expect(h.open).toHaveBeenCalledTimes(1);
    expect(firstOrder(h.prepare)).toBeLessThan(firstOrder(h.open));
    const [, prepared, range, signal] = firstCall(h.open) as [unknown, unknown, unknown, AbortSignal];
    expect(prepared).toBe(state.prepared);
    expect(range).toBeUndefined();
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal.aborted).toBe(false);
    controller.abort();
    expect(signal.aborted).toBe(true);
  });

  it("answers 200 with the file's bytes and exactly these headers: never cacheable, never sniffed, same-origin only, ranges offered", async () => {
    const response = await get();
    expect(response.status).toBe(200);
    expect(headersOf(response)).toEqual({
      "accept-ranges": "bytes",
      "cache-control": NO_CACHE,
      "content-disposition": `inline; filename="photo.jpg"; filename*=UTF-8''photo.jpg`,
      "content-length": String(TOTAL),
      "content-type": "image/jpeg",
      "cross-origin-resource-policy": "same-origin",
      pragma: "no-cache",
      vary: "Range",
      "x-content-type-options": "nosniff",
      "x-sahelflow-registry-revision": "4",
      "x-sahelflow-shop-id": "shop-a",
    });
    expect([...(await bytesOf(response))]).toEqual([...pattern(TOTAL)]);
  });

  it("sends the type the media store reports, and the length of the bytes it got", async () => {
    spec.mediaType = "video/mp4";
    spec.kind = "video";
    spec.fileName = "clip.mp4";
    spec.total = 10;
    spec.reportedTotal = 10;
    spec.bytes = 3;
    const response = await get();
    expect(response.headers.get("Content-Type")).toBe("video/mp4");
    expect(response.headers.get("Content-Length")).toBe("3");
    expect((await bytesOf(response)).byteLength).toBe(3);
  });

  it.each([
    ["image", "photo.jpg", "?download=1", "attachment"],
    ["image", "photo.jpg", "", "inline"],
    ["video", "clip.mp4", "", "inline"],
    ["audio", "note.ogg", "", "inline"],
    ["sticker", "sticker.webp", "", "inline"],
    ["document", "invoice.pdf", "", "attachment"],
    ["document", "invoice.pdf", "?download=0", "attachment"],
    ["audio", "note.ogg", "?download=1", "attachment"],
    ["image", "photo.jpg", "?download=0", "inline"],
    ["image", "photo.jpg", "?download=true", "inline"],
    ["image", "photo.jpg", "?download=", "inline"],
    ["image", "photo.jpg", "?download=11", "inline"],
    ["image", "photo.jpg", "?Download=1", "inline"],
  ])("a %s named %s asked for with '%s' is sent %s", async (kind, fileName, query, disposition) => {
    spec.kind = kind;
    spec.fileName = fileName;
    const response = await get("msg-1", query);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toBe(`${disposition}; filename="${fileName}"; filename*=UTF-8''${fileName}`);
  });

  it("zeroes the buffer the media store handed over once the answer is built, and the answer body keeps its data", async () => {
    const response = await get();
    expect(lastOpened().bytes.byteLength).toBe(TOTAL);
    expect(lastOpened().bytes.every((byte) => byte === 0)).toBe(true);
    expect([...(await bytesOf(response))]).toEqual([...pattern(TOTAL)]);
  });

  it("zeroes the bytes of a ranged answer too, and the partial body keeps its data", async () => {
    const response = await get("msg-1", "", { range: "bytes=10-19" });
    expect(response.status).toBe(206);
    expect(lastOpened().bytes.every((byte) => byte === 0)).toBe(true);
    expect([...(await bytesOf(response))]).toEqual([...pattern(10, 10)]);
  });

  it("passes a media store refusal through with its own status and code, from the preparation and from the opening", async () => {
    h.prepare.mockRejectedValue(UNAVAILABLE());
    const first = await get();
    expect(first.status).toBe(404);
    expect(await bodyOf(first)).toEqual({ error: "This media is not available", code: "WHATSAPP_MEDIA_NOT_AVAILABLE" });
    expect(h.open).not.toHaveBeenCalled();
    h.prepare.mockImplementation(async () => ({ sizeBytes: TOTAL }));
    h.open.mockRejectedValue(new SahelFlowError("Media is being erased", "WHATSAPP_MEDIA_ERASED", 409));
    const second = await get();
    expect(second.status).toBe(409);
    expect(await bodyOf(second)).toEqual({ error: "Media is being erased", code: "WHATSAPP_MEDIA_ERASED" });
  });

  it.each([
    ["the preparation", () => h.prepare],
    ["the opening", () => h.open],
  ])("answers a generic 500 that holds no secret when %s fails with an unexpected error", async (_label, spy) => {
    spy().mockRejectedValue(new Error(`disk failure at password ${SECRET_IN_ERROR}`));
    const response = await get();
    expect(response.status).toBe(500);
    const text = JSON.stringify(await response.json());
    expect(text).toBe(JSON.stringify({ error: "Internal server error" }));
    expect(text).not.toContain(SECRET_IN_ERROR);
    expect(h.logError).toHaveBeenCalledTimes(1);
  });
});

describe("GET /api/inbox/media/[id]: byte ranges", () => {
  const ACCEPTED: Array<[string, string, number, number]> = [
    ["the first hundred bytes", "bytes=0-99", 0, 99],
    ["one byte at the start", "bytes=0-0", 0, 0],
    ["from a byte to the end", "bytes=500-", 500, 999],
    ["the last hundred bytes", "bytes=-100", 900, 999],
    ["the last byte", "bytes=-1", 999, 999],
    ["a suffix longer than the file", "bytes=-5000", 0, 999],
    ["an end past the end of the file", "bytes=0-5000", 0, 999],
    ["the last byte named by its position", "bytes=999-999", 999, 999],
    ["the last byte, open ended", "bytes=999-", 999, 999],
    ["the start named with leading zeros", "bytes=007-010", 7, 10],
    ["capitals in the unit", "BYTES=0-9", 0, 9],
    ["a mixed-case unit", "Bytes=10-19", 10, 19],
    ["the whole file asked for as a range", "bytes=0-", 0, 999],
    ["the whole file asked for as a suffix", "bytes=-1000", 0, 999],
    ["the largest safe integer as an end", "bytes=0-9007199254740991", 0, 999],
    ["the largest safe integer as a suffix", "bytes=-9007199254740991", 0, 999],
  ];

  it.each(ACCEPTED)("answers 206 for %s (%s): the range is handed to the media store as { start: %i, end: %i }", async (_label, header, start, end) => {
    const response = await get("msg-1", "", { range: header });
    expect(response.status).toBe(206);
    expect(firstCall(h.open)[2]).toEqual({ start, end });
    expect(response.headers.get("Content-Range")).toBe(`bytes ${start}-${end}/${TOTAL}`);
    expect(response.headers.get("Content-Length")).toBe(String(end - start + 1));
    expect(response.headers.get("Accept-Ranges")).toBe("bytes");
    expect(response.headers.get("Cache-Control")).toBe(NO_CACHE);
    expect(response.headers.get("Vary")).toBe("Range");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect([...(await bytesOf(response))]).toEqual([...pattern(end - start + 1, start)]);
  });

  it("checks the range against the size the media store prepared, and writes the total of the Content-Range from the size the open call reports (observed)", async () => {
    spec.reportedTotal = 777;
    const response = await get("msg-1", "", { range: "bytes=0-9" });
    expect(response.status).toBe(206);
    expect(response.headers.get("Content-Range")).toBe("bytes 0-9/777");
    const late = await get("msg-1", "", { range: "bytes=900-" });
    expect(late.status).toBe(206);
    expect(late.headers.get("Content-Range")).toBe("bytes 900-999/777");
  });

  it.each([
    ["no Range header", {} as Record<string, string>],
    ["an empty Range header", { range: "" }],
  ])("answers the whole file with 200 for %s", async (_label, headers) => {
    const response = await get("msg-1", "", headers);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Range")).toBeNull();
    expect(firstCall(h.open)[2]).toBeUndefined();
  });

  const REFUSED: Array<[string, string]> = [
    ["a start at the end of the file", "bytes=1000-"],
    ["a start at the end of the file, with an end", "bytes=1000-1005"],
    ["a start far past the end", "bytes=2000-3000"],
    ["an end before the start", "bytes=5-2"],
    ["a suffix of zero", "bytes=-0"],
    ["neither a start nor an end", "bytes=-"],
    ["nothing after the unit", "bytes="],
    ["two ranges", "bytes=0-9,20-29"],
    ["two ranges, the second a suffix", "bytes=0-9, -5"],
    ["another unit", "items=0-9"],
    ["no unit", "0-9"],
    ["a space instead of the equals sign", "bytes 0-9"],
    ["letters for numbers", "bytes=a-b"],
    ["a second dash", "bytes=-5-"],
    ["a fraction", "bytes=1.5-3"],
    ["a plus sign", "bytes=+1-3"],
    ["a minus sign on the start", "bytes=--3"],
    ["a hexadecimal start", "bytes=0x1-3"],
    ["a superscript digit", "bytes=\u00B2-3"],
    ["a start far past the end, beyond a safe integer", "bytes=99999999999999999999-"],
    ["an end too large to be a safe integer", "bytes=0-99999999999999999999"],
    ["a suffix too large to be a safe integer", "bytes=-99999999999999999999"],
    ["a space inside", "bytes=0 -9"],
    ["an end one above the largest safe integer", "bytes=0-9007199254740992"],
    ["a suffix one above the largest safe integer", "bytes=-9007199254740992"],
    ["text in front of the unit", "xbytes=0-9"],
    ["text after the range", "bytes=0-9x"],
    ["a semicolon after the range", "bytes=0-9;"],
    ["a minus sign in front of the unit", "-bytes=0-9"],
  ];

  it.each(REFUSED)("answers 416 for %s (%s), with the total, and does not open the file", async (_label, header) => {
    const response = await get("msg-1", "", { range: header });
    expect(response.status).toBe(416);
    expect(headersOf(response)).toEqual({
      "accept-ranges": "bytes",
      "cache-control": NO_CACHE,
      "content-range": `bytes */${TOTAL}`,
      "x-content-type-options": "nosniff",
      "x-sahelflow-registry-revision": "4",
      "x-sahelflow-shop-id": "shop-a",
    });
    expect(await response.text()).toBe("");
    expect(h.prepare).toHaveBeenCalledTimes(1);
    expect(h.open).not.toHaveBeenCalled();
  });

  it("writes the total of a 416 from the size the media store prepared", async () => {
    spec.total = 12;
    spec.reportedTotal = 12;
    const response = await get("msg-1", "", { range: "bytes=12-" });
    expect(response.status).toBe(416);
    expect(response.headers.get("Content-Range")).toBe("bytes */12");
  });

  it("judges the range against each file's own size: the same header is fine for a long file and refused for a short one", async () => {
    spec.total = 50;
    spec.reportedTotal = 50;
    expect((await get("msg-1", "", { range: "bytes=40-" })).status).toBe(206);
    expect((await get("msg-1", "", { range: "bytes=60-" })).status).toBe(416);
  });

  it("sends the same headers on a 206 as on a 200, plus Content-Range and the shorter Content-Length", async () => {
    const response = await get("msg-1", "", { range: "bytes=10-19" });
    expect(headersOf(response)).toEqual({
      "accept-ranges": "bytes",
      "cache-control": NO_CACHE,
      "content-disposition": `inline; filename="photo.jpg"; filename*=UTF-8''photo.jpg`,
      "content-length": "10",
      "content-range": `bytes 10-19/${TOTAL}`,
      "content-type": "image/jpeg",
      "cross-origin-resource-policy": "same-origin",
      pragma: "no-cache",
      vary: "Range",
      "x-content-type-options": "nosniff",
      "x-sahelflow-registry-revision": "4",
      "x-sahelflow-shop-id": "shop-a",
    });
  });

  it("combines with a download request: a ranged attachment is still a 206", async () => {
    const response = await get("msg-1", "?download=1", { range: "bytes=0-9" });
    expect(response.status).toBe(206);
    expect(response.headers.get("Content-Disposition")).toMatch(/^attachment; /);
  });
});

describe("GET /api/inbox/media/[id]: the file name", () => {
  function disposition(response: Response): string {
    return response.headers.get("Content-Disposition") ?? "";
  }

  const OPEN = '; filename="';
  const CLOSE = '"; filename*=UTF-8\'\'';

  /** What sits between the first filename=" and the LAST "; filename*=UTF-8'' (a hostile name may hold the same text inside the quotes). */
  function fallbackOf(header: string): string {
    const start = header.indexOf(OPEN);
    const end = header.lastIndexOf(CLOSE);
    return start < 0 || end < 0 ? "<no fallback>" : header.slice(start + OPEN.length, end);
  }

  function extendedOf(header: string): string {
    const end = header.lastIndexOf(CLOSE);
    return end < 0 ? "<no extended name>" : header.slice(end + CLOSE.length);
  }

  it.each([
    ["a plain name", "photo.jpg", "photo.jpg", "photo.jpg"],
    ["a name with spaces", "my photo (1).jpg", "my photo (1).jpg", "my%20photo%20(1).jpg"],
    ["Arabic letters", "صورة.jpg", "____.jpg", "%D8%B5%D9%88%D8%B1%D8%A9.jpg"],
    ["Chinese characters", "照片.jpg", "__.jpg", "%E7%85%A7%E7%89%87.jpg"],
    ["an emoji", "a😀.jpg", "a__.jpg", "a%F0%9F%98%80.jpg"],
    ["a compatibility ligature, which the fallback folds to plain letters", "\uFB01le.jpg", "file.jpg", "%EF%AC%81le.jpg"],
    ["a quote and a backslash, which become underscores in the fallback", 'a"b\\c.pdf', "a_b_c.pdf", "a%22b%5Cc.pdf"],
    ["a line break and a header line, which cannot break out", "a\r\nX-Evil: 1.pdf", "a__X-Evil: 1.pdf", "a%0D%0AX-Evil%3A%201.pdf"],
    ["a tab", "a\tb.pdf", "a_b.pdf", "a%09b.pdf"],
    ["U+001F, the last control character", "a\x1Fb.pdf", "a_b.pdf", "a%1Fb.pdf"],
    ["DEL (U+007F)", "a\x7Fb.pdf", "a_b.pdf", "a%7Fb.pdf"],
    ["a tilde (U+007E), the last printable character", "a~b.pdf", "a~b.pdf", "a~b.pdf"],
    ["only a quote", '"', "_", "%22"],
    ["only a backslash", "\\", "_", "%5C"],
    ["a percent sign and a hash", "100%#1.jpg", "100%#1.jpg", "100%25%231.jpg"],
  ])("sends %s in two forms: an ASCII fallback and the real name", async (_label, fileName, fallback, extended) => {
    spec.fileName = fileName;
    const response = await get();
    expect(response.status).toBe(200);
    const header = disposition(response);
    expect(header).toMatch(/^[\x20-\x7E]+$/);
    expect(header).not.toMatch(/[\r\n]/);
    expect(fallbackOf(header)).toBe(fallback);
    expect(extendedOf(header)).toBe(extended);
    expect(decodeURIComponent(extendedOf(header))).toBe(fileName);
  });

  it("names a file with no name whatsapp-media, with an empty extended name, and a name of only spaces the same way", async () => {
    for (const name of ["", "   "]) {
      spec.fileName = name;
      const header = disposition(await get());
      expect(fallbackOf(header)).toBe("whatsapp-media");
      expect(extendedOf(header)).toBe(encodeURIComponent(name));
    }
  });

  it("trims the fallback but not the extended name", async () => {
    spec.fileName = "  report.pdf  ";
    const header = disposition(await get());
    expect(fallbackOf(header)).toBe("report.pdf");
    expect(extendedOf(header)).toBe("%20%20report.pdf%20%20");
  });

  it("cuts the fallback at 160 characters and keeps the whole real name", async () => {
    spec.fileName = `${"a".repeat(200)}.jpg`;
    const header = disposition(await get());
    expect(fallbackOf(header)).toBe("a".repeat(160));
    expect(extendedOf(header)).toBe(`${"a".repeat(200)}.jpg`);
  });

  it("measures the 160 after the accents were decomposed and replaced, so a name of accented letters is cut shorter", async () => {
    spec.fileName = "é".repeat(100);
    const header = disposition(await get());
    expect(fallbackOf(header)).toBe("e_".repeat(80));
  });

  // OBSERVED, not endorsed: NFKD splits an accented letter into the letter and a combining mark, and the mark becomes an underscore.
  it("turns an accented letter into the letter and an underscore in the fallback (observed)", async () => {
    spec.fileName = "café.jpg";
    const header = disposition(await get());
    expect(fallbackOf(header)).toBe("cafe_.jpg");
    expect(extendedOf(header)).toBe("caf%C3%A9.jpg");
  });

  // OBSERVED, not endorsed: the fallback keeps ; and =, and the extended name leaves ' ( ) * as they are, which RFC 5987 does not
  // allow in an extended value. Inside the quotes this is legal, but a sloppy parser could read a second parameter there. The
  // export routes use src/lib/import/export-disposition.ts, which strips them.
  it("keeps semicolons and equals signs in the fallback and leaves ' ( ) * unescaped in the extended name (observed)", async () => {
    spec.fileName = "a; filename*=UTF-8''evil.pdf";
    const header = disposition(await get());
    expect(header.match(/filename\*=/g)).toHaveLength(2);
    expect(fallbackOf(header)).toBe("a; filename*=UTF-8''evil.pdf");
    spec.fileName = "(1)*'x'.jpg";
    expect(extendedOf(disposition(await get()))).toBe("(1)*'x'.jpg");
  });

  it("accepts a name mixing Arabic, an emoji, a quote, a backslash, a semicolon and an equals sign (the real Headers of this Node is the judge)", async () => {
    spec.fileName = "صورة 😀 \"x\" \\ ; =.jpg";
    const response = await get();
    expect(response.status).toBe(200);
    expect(decodeURIComponent(extendedOf(disposition(response)))).toBe(spec.fileName);
  });

  // OBSERVED, not endorsed: encodeURIComponent throws on a lone surrogate, after the file was opened and the bytes copied.
  it("answers a generic 500 for a file name that cannot be percent-encoded, after opening the file, and still zeroes the bytes (observed)", async () => {
    spec.fileName = "a\uD800b.jpg";
    const response = await get();
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).toBe(JSON.stringify({ error: "Internal server error" }));
    expect(h.logError).toHaveBeenCalledTimes(1);
    expect(h.open).toHaveBeenCalledTimes(1);
    expect(lastOpened().bytes.every((byte) => byte === 0)).toBe(true);
  });
});

describe("GET /api/inbox/media/[id]: the thumbnail", () => {
  const THUMB_HEADERS = {
    "cache-control": NO_CACHE,
    "content-length": "64",
    "content-type": "image/jpeg",
    "cross-origin-resource-policy": "same-origin",
    pragma: "no-cache",
    "x-content-type-options": "nosniff",
    "x-sahelflow-registry-revision": "4",
    "x-sahelflow-shop-id": "shop-a",
  };

  it("decodes and trims the id for the thumbnail too, before it reaches the media store", async () => {
    expect((await get("%20msg%2F9%20", "?variant=thumbnail")).status).toBe(200);
    expect(firstCall(h.thumb)[1]).toBe("msg/9");
  });

  it("opens only the thumbnail, never the full file, with the shop's own handle and context and the id", async () => {
    const response = await get("msg-9", "?variant=thumbnail");
    expect(response.status).toBe(200);
    expect(h.thumb).toHaveBeenCalledTimes(1);
    const [context, id] = firstCall(h.thumb) as [{ prisma: unknown; shop: unknown }, string];
    expect(context.prisma).toBe(db);
    expect(context.shop).toBe(shopContext);
    expect(id).toBe("msg-9");
    expect(h.prepare).not.toHaveBeenCalled();
    expect(h.open).not.toHaveBeenCalled();
  });

  it("answers 200 with the thumbnail's bytes and exactly these headers: no ranges, no file name, no Vary", async () => {
    const response = await get("msg-9", "?variant=thumbnail");
    expect(headersOf(response)).toEqual(THUMB_HEADERS);
    expect([...(await bytesOf(response))]).toEqual([...pattern(64)]);
  });

  // OBSERVED, not endorsed: the type the media store reports (here image/webp) is ignored; the answer is always image/jpeg.
  it("always says image/jpeg, whatever type the media store reports (observed)", async () => {
    expect(state.thumbs).toHaveLength(0);
    const response = await get("msg-9", "?variant=thumbnail");
    expect(state.thumbs[0]?.mediaType).toBe("image/webp");
    expect(response.headers.get("Content-Type")).toBe("image/jpeg");
  });

  it("ignores a Range header and a download request: the thumbnail is whole and inline", async () => {
    for (const range of ["bytes=0-9", "bytes=5000-", "garbage"]) {
      const response = await get("msg-9", "?variant=thumbnail&download=1", { range });
      expect(response.status).toBe(200);
      expect(headersOf(response)).toEqual(THUMB_HEADERS);
      expect((await bytesOf(response)).byteLength).toBe(64);
    }
  });

  it("zeroes the thumbnail bytes the media store handed over, and the answer keeps its own copy", async () => {
    const response = await get("msg-9", "?variant=thumbnail");
    const thumb = state.thumbs[0];
    expect(thumb?.bytes.every((byte) => byte === 0)).toBe(true);
    expect([...(await bytesOf(response))]).toEqual([...pattern(64)]);
  });

  it.each([
    ["Thumbnail", "?variant=Thumbnail"],
    ["thumbnail2", "?variant=thumbnail2"],
    ["an empty value", "?variant="],
    ["another variant", "?variant=large"],
    ["a space before the word", "?variant=%20thumbnail"],
  ])("takes the full file for variant %s: only the exact word thumbnail opens the thumbnail", async (_label, query) => {
    const response = await get("msg-9", query);
    expect(response.status).toBe(200);
    expect(h.thumb).not.toHaveBeenCalled();
    expect(h.open).toHaveBeenCalledTimes(1);
  });

  it("passes the media store's refusal through (the screen then falls back to the full file), and a failure as a generic 500 with no secret", async () => {
    h.thumb.mockRejectedValue(UNAVAILABLE());
    const refused = await get("msg-9", "?variant=thumbnail");
    expect(refused.status).toBe(404);
    expect(await bodyOf(refused)).toEqual({ error: "This media is not available", code: "WHATSAPP_MEDIA_NOT_AVAILABLE" });
    h.thumb.mockRejectedValue(new Error(`disk failure at password ${SECRET_IN_ERROR}`));
    const failed = await get("msg-9", "?variant=thumbnail");
    expect(failed.status).toBe(500);
    const text = JSON.stringify(await failed.json());
    expect(text).toBe(JSON.stringify({ error: "Internal server error" }));
    expect(text).not.toContain(SECRET_IN_ERROR);
    expect(h.logError).toHaveBeenCalledTimes(1);
  });
});
