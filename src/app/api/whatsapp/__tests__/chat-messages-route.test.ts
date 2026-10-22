import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// GET /api/whatsapp/chats/[jid]/messages is the thread the inbox shows for one WhatsApp conversation: the messages (oldest
// first), the state of every message that was sent, the provider's id for each message, the quoted-reply previews, the
// attachments with the link a seller may use to read them, and whether the WhatsApp sidecar is reachable. What matters: only a
// member who may read conversations AND see the customer's contact details gets it, before anything is read; the window is
// bounded (default 100, at most 500); the "before" cursor is judged strictly and an unusable one is ignored; each lookup
// (quoted messages, send effects, provider events, media intents) asks for exactly the ids it needs and is skipped when there is
// none; outbound and inbound rows are told apart; every attachment link is built from the message id and the state of its media
// intent; the envelope key that opens the attachments is wiped on every way out; and a sidecar that is down never fails the
// request.
//
// Real code under test: the route, withErrorHandler (so each refusal has the real status and body), SahelFlowError, the REAL
// authorization chain (requireTrustedAction, assertTrustedAction, requireTrustedActor), the permission catalog and role table, the
// real projectInboxLocalMedia (the link builder), the real media-fetch effect type constant and the REAL error classes of the
// sidecar client (so instanceof works). Stand-ins: the session authority and the durable identity lookup (they hand the real chain a
// role or an explicit permission list); the business envelope key and the attachment decryption (a stand-in returns the opened
// attachment, so the decryption, its schema and its binding to the message id are NOT tested here); sidecar.status; the logger
// hooks withErrorHandler calls (its shop-authority and licence hooks only run when NODE_ENV is production, so those two mocks are
// inert here and the production checks that run before the route are NOT tested); and the six database calls. The database handle
// is an in-memory thread that honours what the route asks for the way Prisma does: the take, the cursor condition, the id lists and
// the status filter (so the paging is tested against a database that obeys `take`). Whether a real SQL `where` filters is NOT
// tested; the exact arguments of every call are asserted instead.
//
// The in-memory database models the newest-first order only (it throws on any other orderBy) and scopes the cursor lookup to the
// test's WhatsApp thread (it finds nothing without that scope); real SQL ordering and filtering are NOT tested.
//
// Tests that say "(observed)" pin what looks unintended and should be updated if the route changes on purpose. The two that matter
// are about paging (issue 574): on the first page `take` equals the limit, so the route can never see the extra row that sets
// hasMore, and the first page never offers an older cursor; and on a later page the cursor is built from the NEWEST row of the
// page, not the oldest. The three `it.fails` tests state the intended paging (an older cursor on the first page, a cursor from the
// oldest row, and a walk of the whole thread); when the route is fixed they go red and the observed tests next to them must be
// deleted. The inbox hook (use-inbox-thread.ts) takes the cursor only from this answer and puts older pages in front of the loaded
// ones, so a first page that offered a cursor built from the newest row would show some messages twice: both defects need fixing
// together. Others: the seconds part of the cursor is validated but not used (the row decides); a cursor that matches no message is
// ignored without a word; a thread with an outbound sticker gives it no media link; the answer carries a customer's messages with
// no Cache-Control header; a malformed percent escape in the jid is a generic 500.
const h = vi.hoisted(() => ({
  getAuthority: vi.fn(),
  resolveIdentity: vi.fn(),
  envelopeKey: vi.fn(),
  openAttachment: vi.fn(),
  sidecarStatus: vi.fn(),
  cursorFind: vi.fn(),
  conversationFind: vi.fn(),
  quotedFind: vi.fn(),
  effectFind: vi.fn(),
  ingressFind: vi.fn(),
  intentFind: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({ getCurrentSessionAuthority: h.getAuthority }));
vi.mock("@/lib/identity/control-authority", () => ({ resolveDurableIdentityActor: h.resolveIdentity }));
vi.mock("@/lib/business-truth/envelope-key", () => ({ getBusinessEnvelopeKey: h.envelopeKey }));
vi.mock("@/lib/whatsapp/message-attachments", () => ({ openWhatsAppMessageAttachmentWithKey: h.openAttachment }));
vi.mock("@/lib/whatsapp/sidecar-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/whatsapp/sidecar-client")>()),
  sidecar: { status: h.sidecarStatus },
}));
vi.mock("@/lib/db", () => ({
  db: {
    message: { findFirst: h.cursorFind, findMany: h.quotedFind },
    conversation: { findUnique: h.conversationFind },
    whatsAppOutboundEffect: { findMany: h.effectFind },
    providerIngressEvent: { findMany: h.ingressFind },
    outboxIntent: { findMany: h.intentFind },
  },
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

import * as route from "@/app/api/whatsapp/chats/[jid]/messages/route";
import { db, shopContext } from "@/lib/db";
import { PHASE2_ACTIONS, getPhase2PresetPermissions, hasPhase2Permission, type Phase2Action } from "@/lib/identity/permissions";
import { SidecarRequestError, SidecarUnavailableError } from "@/lib/whatsapp/sidecar-client";

const { GET } = route;

const ROLES = ["owner", "manager", "operator", "viewer"] as const;
type Role = (typeof ROLES)[number];
const SECRET_IN_ERROR = "SECRET-DB-PASSWORD-0008";
const IDENTITY = {
  personId: "5".repeat(32),
  workspaceMemberId: "6".repeat(32),
  deviceId: "7".repeat(32),
  policyVersion: 1,
  revocationEpoch: 0,
};
const BOTH = ["conversations.read", "customers.contact.read"];
const JID = "213555123456@s.whatsapp.net";
const JID_RAW = encodeURIComponent(JID);
const BASE = 1_760_000_000;
const MEDIA_FETCH = "whatsapp.media.fetch.v1";

interface Row {
  id: string;
  body: string;
  direction: string;
  timestamp: Date;
  deliveryStatus: string | null;
  messageType: string;
  attachments: string | null;
  quotedMessageId: string | null;
}
interface Effect {
  messageId: string;
  effectKey: string;
  providerMessageId: string | null;
}
interface Ingress {
  messageId: string | null;
  providerEventId: string;
  status: string;
}
interface Intent {
  effectKey: string;
  effectType?: string;
  status: string;
  outcomeState: string | null;
  lastErrorCode?: string | null;
}
interface Msg {
  key: { remoteJid: string; fromMe: boolean; id: string };
  message: { conversation: string };
  messageTimestamp: number;
  messageType: string;
  deliveryStatus?: string;
  effectKey?: string;
  effectState?: string;
  effectErrorCode: string | null;
  attachment: Record<string, unknown> | null;
  quotedMessageId: string | null;
  quoted: { fromMe: boolean; preview: string; messageType: string | null } | null;
}
interface Body {
  jid: string;
  messages: Msg[];
  sidecarReachable: boolean;
  hasMore: boolean;
  olderCursor: string | null;
}
interface ConversationArgs {
  where: { channel_sourceId: { channel: string; sourceId: string } };
  select: {
    messages: {
      orderBy: unknown;
      take: number;
      where?: { OR: [{ timestamp: { lt: Date } }, { timestamp: Date; id: { lt: string } }] };
      select: Record<string, boolean>;
    };
  };
}

function row(n: number, over: Partial<Row> = {}): Row {
  return {
    id: `m${n}`,
    body: `body ${n}`,
    direction: "inbound",
    timestamp: new Date((BASE + n) * 1000),
    deliveryStatus: null,
    messageType: "text",
    attachments: null,
    quotedMessageId: null,
    ...over,
  };
}

const world = {
  exists: true,
  messages: [] as Row[],
  elsewhere: [] as Row[],
  effects: [] as Effect[],
  ingress: [] as Ingress[],
  intents: [] as Intent[],
  attachments: new Map<string, Record<string, unknown>>(),
};
let issuedKey: Buffer | null = null;

function newestFirst(a: Row, b: Row): number {
  return b.timestamp.getTime() - a.timestamp.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);
}

function actingWith(permissions: readonly string[]): void {
  // The manager preset's ceiling holds both permissions, so each list used here is a legal custom policy for it.
  h.resolveIdentity.mockResolvedValue({ ...IDENTITY, role: "manager", permissions });
}

function actingAs(role: Role): void {
  h.resolveIdentity.mockResolvedValue({ ...IDENTITY, role, permissions: null });
}

function request(query = ""): NextRequest {
  return new NextRequest(`http://localhost/api/whatsapp/chats/x/messages${query}`, { method: "GET" });
}

function get(rawJid = JID_RAW, query = "") {
  return GET(request(query), { params: Promise.resolve({ jid: rawJid }) });
}

async function load(rawJid = JID_RAW, query = ""): Promise<{ response: Response; body: Body }> {
  const response = await get(rawJid, query);
  return { response, body: (await response.json()) as Body };
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

function convArgs(): ConversationArgs {
  return firstCall(h.conversationFind)[0] as ConversationArgs;
}

function ids(body: Body): string[] {
  return body.messages.map((message) => message.key.id);
}

function byMessageId(body: Body, id: string): Msg {
  const found = body.messages.find((message) => message.key.id === id);
  if (!found) throw new Error(`no message with the key id ${id}`);
  return found;
}

function msgAt(body: Body, index: number): Msg {
  const found = body.messages[index];
  if (!found) throw new Error(`no message at ${index}`);
  return found;
}

function expectNothingRead(): void {
  for (const spy of [h.cursorFind, h.conversationFind, h.quotedFind, h.effectFind, h.ingressFind, h.intentFind, h.envelopeKey, h.openAttachment, h.sidecarStatus]) {
    expect(spy).not.toHaveBeenCalled();
  }
}

function setThread(rows: Row[]): void {
  world.messages = rows;
}

function sealed(rowOver: Partial<Row>, attachment: Record<string, unknown>, n: number): Row {
  const protectedValue = `sealed-${n}`;
  world.attachments.set(protectedValue, attachment);
  return row(n, { attachments: protectedValue, ...rowOver });
}

function mediaIntentCalls(): Array<{ where: { effectKey: { in: string[] }; effectType?: string }; select: Record<string, boolean> }> {
  return h.intentFind.mock.calls.map((call) => call[0] as { where: { effectKey: { in: string[] }; effectType?: string }; select: Record<string, boolean> }).filter((args) => args.where.effectType !== undefined);
}

function sendIntentCalls(): Array<{ where: { effectKey: { in: string[] }; effectType?: string }; select: Record<string, boolean> }> {
  return h.intentFind.mock.calls.map((call) => call[0] as { where: { effectKey: { in: string[] }; effectType?: string }; select: Record<string, boolean> }).filter((args) => args.where.effectType === undefined);
}

beforeEach(() => {
  h.getAuthority.mockReset().mockResolvedValue({ status: "authenticated", sessionId: "chat-messages-session" });
  h.resolveIdentity.mockReset();
  actingWith(BOTH);
  world.exists = true;
  world.messages = [row(1), row(2), row(3)];
  world.elsewhere = [];
  world.effects = [];
  world.ingress = [];
  world.intents = [];
  world.attachments = new Map();
  issuedKey = null;
  h.envelopeKey.mockReset().mockImplementation(async () => {
    issuedKey = Buffer.alloc(32, 9);
    return issuedKey;
  });
  h.openAttachment.mockReset().mockImplementation((_messageId: string, protectedValue: string, key: Buffer) => {
    // The key is built from 9s: a route that wipes it before it is used would hand real decryption a zero key.
    if (!key.every((byte) => byte === 9)) throw new Error("the envelope key was wiped or replaced before use");
    const found = world.attachments.get(protectedValue);
    if (!found) throw new Error(`no stand-in attachment for ${protectedValue}`);
    return { ...found };
  });
  h.sidecarStatus.mockReset().mockResolvedValue({ status: "connected" });
  h.cursorFind.mockReset().mockImplementation(async (args: { where: { id: string; conversation?: { channel: string; sourceId: string } } }) => {
    // Scoped like the real lookup: no conversation scope, or another thread, finds nothing. Only this thread's own rows are searched.
    if (args.where.conversation?.channel !== "whatsapp" || args.where.conversation.sourceId !== JID) return null;
    const found = world.messages.find((message) => message.id === args.where.id);
    return found ? { id: found.id, timestamp: found.timestamp } : null;
  });
  h.conversationFind.mockReset().mockImplementation(async (args: ConversationArgs) => {
    if (!world.exists) return null;
    const spec = args.select.messages;
    if (JSON.stringify(spec.orderBy) !== JSON.stringify([{ timestamp: "desc" }, { id: "desc" }])) {
      throw new Error("the stand-in database models the newest-first order only");
    }
    let list = [...world.messages].sort(newestFirst);
    if (spec.where) {
      const [earlier, sameSecond] = spec.where.OR;
      list = list.filter(
        (message) =>
          message.timestamp.getTime() < earlier.timestamp.lt.getTime() ||
          (message.timestamp.getTime() === sameSecond.timestamp.getTime() && message.id < sameSecond.id.lt),
      );
    }
    return { messages: list.slice(0, spec.take).map((message) => ({ ...message })) };
  });
  h.quotedFind.mockReset().mockImplementation(async (args: { where: { id: { in: string[] } } }) =>
    [...world.messages, ...world.elsewhere]
      .filter((message) => args.where.id.in.includes(message.id))
      .map(({ id, body, direction, messageType }) => ({ id, body, direction, messageType })),
  );
  h.effectFind.mockReset().mockImplementation(async (args: { where: { messageId: { in: string[] } } }) =>
    world.effects.filter((effect) => args.where.messageId.in.includes(effect.messageId)),
  );
  h.ingressFind.mockReset().mockImplementation(async (args: { where: { messageId: { in: string[] }; status: string } }) =>
    world.ingress.filter((event) => event.messageId !== null && args.where.messageId.in.includes(event.messageId) && event.status === args.where.status),
  );
  h.intentFind.mockReset().mockImplementation(async (args: { where: { effectKey: { in: string[] }; effectType?: string } }) =>
    world.intents.filter((intent) => args.where.effectKey.in.includes(intent.effectKey) && (args.where.effectType === undefined || intent.effectType === args.where.effectType)),
  );
  h.logError.mockReset();
});

describe("GET /api/whatsapp/chats/[jid]/messages: who may use it", () => {
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
    expect((await get()).status).toBe(status);
    expect(h.conversationFind).toHaveBeenCalledTimes(status === 200 ? 1 : 0);
  });

  it.each([
    ["no permission at all", [] as string[], "conversations.read"],
    ["customers.contact.read but not conversations.read", ["customers.contact.read"], "conversations.read"],
    ["conversations.read but not customers.contact.read", ["conversations.read"], "customers.contact.read"],
    ["customers.read and orders.read instead of the two", ["customers.read", "orders.read"], "conversations.read"],
  ] as Array<[string, string[], string]>)("answers 403 ACTION_FORBIDDEN naming the first missing permission for a member with %s, and reads nothing", async (_label, permissions, named) => {
    actingWith(permissions);
    const response = await get();
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: `The current member is not authorized to perform ${named}`, code: "ACTION_FORBIDDEN" });
    expectNothingRead();
  });

  it("answers 403 before the jid, the limit or the cursor are read: a viewer who sends a broken jid or a bad cursor is a 403, never a 500 or a lookup", async () => {
    actingAs("viewer");
    for (const [rawJid, query] of [
      ["%E0%A4%A", ""],
      [JID_RAW, "?limit=abc"],
      [JID_RAW, "?before=1760000002:m2"],
    ] as Array<[string, string]>) {
      expect((await get(rawJid, query)).status).toBe(403);
    }
    expectNothingRead();
  });

  it("answers 401 TRUSTED_ACTOR_REQUIRED before authentication setup is complete, and reads nothing", async () => {
    h.getAuthority.mockResolvedValue({ status: "setup" });
    const response = await get();
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "TRUSTED_ACTOR_REQUIRED" });
    expectNothingRead();
  });

  it("answers 401 IDENTITY_SESSION_BINDING_REQUIRED for a session with no durable identity, and reads nothing", async () => {
    h.resolveIdentity.mockResolvedValue(null);
    const response = await get();
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "IDENTITY_SESSION_BINDING_REQUIRED" });
    expectNothingRead();
  });

  it.each([
    ["no session", "SESSION_REQUIRED", 401, "Unauthorized", "UNAUTHORIZED"],
    ["an invalid session", "SESSION_INVALID", 401, "Unauthorized", "UNAUTHORIZED"],
    ["an authentication secret that cannot be read", "AUTH_SECRET_UNAVAILABLE", 503, "Authentication authority is temporarily unavailable", "AUTH_SECRET_UNAVAILABLE"],
    ["a session authority that is down", "SESSION_AUTHORITY_UNAVAILABLE", 503, "Authentication authority is temporarily unavailable", "SESSION_AUTHORITY_UNAVAILABLE"],
  ])("answers the rejected session for %s (%s) with %i and the chain's own text, and reads nothing", async (_label, code, status, message, answerCode) => {
    h.getAuthority.mockResolvedValue({ status: "rejected", code });
    const response = await get();
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: message, code: answerCode });
    expect(h.resolveIdentity).not.toHaveBeenCalled();
    expectNothingRead();
  });
});

describe("GET /api/whatsapp/chats/[jid]/messages: the thread and the answer", () => {
  it("looks the conversation up by the WhatsApp channel and the decoded jid, and asks for exactly the fields it shows, newest first", async () => {
    await get();
    expect(h.conversationFind).toHaveBeenCalledTimes(1);
    const args = convArgs();
    expect(Object.keys(args).sort()).toEqual(["select", "where"]);
    expect(args.where).toEqual({ channel_sourceId: { channel: "whatsapp", sourceId: JID } });
    expect(Object.keys(args.select)).toEqual(["messages"]);
    expect(args.select.messages.orderBy).toEqual([{ timestamp: "desc" }, { id: "desc" }]);
    expect(args.select.messages.select).toEqual({
      id: true,
      body: true,
      direction: true,
      timestamp: true,
      deliveryStatus: true,
      messageType: true,
      attachments: true,
      quotedMessageId: true,
    });
  });

  it("answers 200 with the jid, the messages oldest first, and exactly these keys", async () => {
    const { response, body } = await load();
    expect(response.status).toBe(200);
    expect(Object.keys(body)).toEqual(["jid", "messages", "sidecarReachable", "hasMore", "olderCursor"]);
    expect(body.jid).toBe(JID);
    expect(ids(body)).toEqual(["m1", "m2", "m3"]);
    expect(response.headers.get("X-SahelFlow-Shop-Id")).toBe("shop-a");
    expect(response.headers.get("X-SahelFlow-Registry-Revision")).toBe("4");
    expect(response.headers.get("Content-Type")).toMatch(/application\/json/);
  });

  // OBSERVED, not endorsed: the answer carries a customer's messages and names with no Cache-Control header.
  it("sends no Cache-Control header on the answer (observed)", async () => {
    const { response } = await load();
    expect(response.headers.get("Cache-Control")).toBeNull();
  });

  it("shows a plain inbound text message with exactly these fields", async () => {
    setThread([row(1, { body: "مرحبا, 2 casques svp" })]);
    const { body } = await load();
    expect(body.messages).toEqual([
      {
        key: { remoteJid: JID, fromMe: false, id: "m1" },
        message: { conversation: "مرحبا, 2 casques svp" },
        messageTimestamp: BASE + 1,
        messageType: "text",
        effectErrorCode: null,
        attachment: null,
        quotedMessageId: null,
        quoted: null,
      },
    ]);
  });

  it("writes the timestamp as whole seconds, cutting the milliseconds off", async () => {
    setThread([row(1, { timestamp: new Date((BASE + 1) * 1000 + 999) }), row(2, { timestamp: new Date((BASE + 2) * 1000 + 1) })]);
    const { body } = await load();
    expect(body.messages.map((message) => message.messageTimestamp)).toEqual([BASE + 1, BASE + 2]);
  });

  it("passes the message type through", async () => {
    setThread([row(1, { messageType: "sticker" }), row(2, { messageType: "reaction" })]);
    const { body } = await load();
    expect(body.messages.map((message) => message.messageType)).toEqual(["sticker", "reaction"]);
  });

  it("puts the decoded jid in every message key", async () => {
    const { body } = await load();
    expect(body.messages.every((message) => message.key.remoteJid === JID)).toBe(true);
  });

  it.each([
    ["an encoded @", "213%40s.whatsapp.net", "213@s.whatsapp.net"],
    ["a group jid", "120363%40g.us", "120363@g.us"],
    ["spaces, which are kept (the jid is not trimmed)", "%20x%20", " x "],
    ["a percent sign encoded once", "a%2540b", "a%40b"],
  ])("decodes %s once, and does not trim it", async (_label, rawJid, expected) => {
    const { body } = await load(rawJid);
    expect(convArgs().where.channel_sourceId.sourceId).toBe(expected);
    expect(body.jid).toBe(expected);
  });

  // OBSERVED, not endorsed: decodeURIComponent throws on a malformed escape, which nothing catches but the generic handler.
  it("answers a generic 500 for a malformed percent escape in the jid, and reads nothing (observed)", async () => {
    const response = await get("%E0%A4%A");
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).toBe(JSON.stringify({ error: "Internal server error" }));
    expect(h.logError).toHaveBeenCalledTimes(1);
    expectNothingRead();
  });

  it("answers an empty thread when the conversation does not exist, with no further lookup, and still asks the sidecar", async () => {
    world.exists = false;
    const { response, body } = await load();
    expect(response.status).toBe(200);
    expect(body).toEqual({ jid: JID, messages: [], sidecarReachable: true, hasMore: false, olderCursor: null });
    for (const spy of [h.quotedFind, h.effectFind, h.ingressFind, h.intentFind, h.envelopeKey, h.openAttachment]) expect(spy).not.toHaveBeenCalled();
    expect(h.sidecarStatus).toHaveBeenCalledTimes(1);
  });

  it("answers an empty thread for a conversation with no messages", async () => {
    setThread([]);
    const { body } = await load();
    expect(body).toEqual({ jid: JID, messages: [], sidecarReachable: true, hasMore: false, olderCursor: null });
    for (const spy of [h.quotedFind, h.effectFind, h.ingressFind, h.intentFind, h.envelopeKey]) expect(spy).not.toHaveBeenCalled();
  });

  it("answers a generic 500 that holds no secret when the conversation lookup fails", async () => {
    h.conversationFind.mockRejectedValue(new Error(`connection refused for password ${SECRET_IN_ERROR}`));
    const response = await get();
    expect(response.status).toBe(500);
    const text = JSON.stringify(await response.json());
    expect(text).toBe(JSON.stringify({ error: "Internal server error" }));
    expect(text).not.toContain(SECRET_IN_ERROR);
    expect(h.logError).toHaveBeenCalledTimes(1);
  });
});

describe("GET /api/whatsapp/chats/[jid]/messages: the size of the window", () => {
  beforeEach(() => {
    setThread(Array.from({ length: 12 }, (_, index) => row(index + 1)));
  });

  it.each([
    ["no limit", "", 100],
    ["limit 50", "?limit=50", 50],
    ["limit 1", "?limit=1", 1],
    ["limit 0, raised to 1", "?limit=0", 1],
    ["limit -5, raised to 1", "?limit=-5", 1],
    ["limit 500", "?limit=500", 500],
    ["limit 501, cut to 500", "?limit=501", 500],
    ["limit 100000, cut to 500", "?limit=100000", 500],
    ["a limit that is not a number", "?limit=abc", 100],
    ["an empty limit", "?limit=", 100],
    ["a fractional limit, cut to its whole part", "?limit=50.9", 50],
    ["a limit with spaces in front", "?limit=%2050", 50],
    ["a limit in exponent form, read up to the e", "?limit=1e3", 1],
    ["a limit followed by letters", "?limit=12abc", 12],
    ["a hexadecimal limit, read as 0 and raised to 1", "?limit=0x10", 1],
  ])("asks the database for %s (%s) with take %i", async (_label, query, take) => {
    await get(JID_RAW, query);
    expect(convArgs().select.messages.take).toBe(take);
  });

  it("returns the newest messages of a thread longer than the limit, oldest first", async () => {
    const { body } = await load(JID_RAW, "?limit=4");
    expect(ids(body)).toEqual(["m9", "m10", "m11", "m12"]);
  });

  it("returns the whole thread when it is shorter than the limit", async () => {
    const { body } = await load(JID_RAW, "?limit=50");
    expect(body.messages).toHaveLength(12);
  });
});

describe("GET /api/whatsapp/chats/[jid]/messages: the older-messages cursor", () => {
  beforeEach(() => {
    setThread(Array.from({ length: 10 }, (_, index) => row(index + 1)));
  });

  function expectFirstPageQuery(limit: number): void {
    expect(h.cursorFind).not.toHaveBeenCalled();
    expect(convArgs().select.messages.take).toBe(limit);
    expect(convArgs().select.messages.where).toBeUndefined();
  }

  it("asks for no cursor lookup and no extra row when no cursor is sent", async () => {
    await get(JID_RAW, "?limit=3");
    expectFirstPageQuery(3);
  });

  it.each([
    ["an empty cursor", "?limit=3&before="],
    ["a cursor of only spaces", "?limit=3&before=%20%20"],
  ])("treats %s as no cursor", async (_label, query) => {
    await get(JID_RAW, query);
    expectFirstPageQuery(3);
  });

  it.each([
    ["no colon and no number", "abc"],
    ["a number with no colon", "1760000005"],
    ["a zero for seconds", "0:m5"],
    ["negative seconds", "-5:m5"],
    ["seconds that are text", "x:m5"],
    ["no seconds", ":m5"],
    ["no id", "1760000005:"],
    ["an id of 65 characters", `1760000005:${"a".repeat(65)}`],
  ])("ignores a cursor with %s (%s): no lookup, the newest window as if none was sent", async (_label, cursor) => {
    const { response, body } = await load(JID_RAW, `?limit=3&before=${encodeURIComponent(cursor)}`);
    expect(response.status).toBe(200);
    expectFirstPageQuery(3);
    expect(ids(body)).toEqual(["m8", "m9", "m10"]);
  });

  it("looks a valid cursor up by the message id inside this WhatsApp thread, and asks for one extra row", async () => {
    await get(JID_RAW, "?limit=3&before=1760000006:m6");
    expect(h.cursorFind).toHaveBeenCalledTimes(1);
    expect(firstCall(h.cursorFind)[0]).toEqual({
      where: { id: "m6", conversation: { channel: "whatsapp", sourceId: JID } },
      select: { id: true, timestamp: true },
    });
    expect(convArgs().select.messages.take).toBe(4);
    expect(convArgs().select.messages.where).toEqual({
      OR: [{ timestamp: { lt: new Date((BASE + 6) * 1000) } }, { timestamp: new Date((BASE + 6) * 1000), id: { lt: "m6" } }],
    });
  });

  it.each([
    ["a limit of 501 is cut to 500, then one extra row is asked for", "?limit=501&before=1760000006:m6", 501],
    ["a limit of 0 is raised to 1, then one extra row is asked for", "?limit=0&before=1760000006:m6", 2],
    ["no limit is 100, then one extra row is asked for", "?before=1760000006:m6", 101],
  ])("%s", async (_label, query, take) => {
    await get(JID_RAW, query);
    expect(convArgs().select.messages.take).toBe(take);
  });

  it("does not find a cursor that belongs to a message of another conversation", async () => {
    world.elsewhere = [row(900, { id: "other-9" })];
    const { body } = await load(JID_RAW, "?limit=3&before=1760000006:other-9");
    expect(h.cursorFind).toHaveBeenCalledTimes(1);
    expect(convArgs().select.messages.where).toBeUndefined();
    expect(ids(body)).toEqual(["m8", "m9", "m10"]);
  });

  it.each([
    ["an id of one character", "1:x", "x"],
    ["an id of 64 characters", `1760000006:${"a".repeat(64)}`, "a".repeat(64)],
    ["an id that holds a colon", "1760000006:a:b", "a:b"],
    ["spaces around the whole cursor", "%201760000006:m6%20", "m6"],
  ])("accepts %s", async (_label, cursor, expectedId) => {
    await get(JID_RAW, `?before=${cursor.includes("%") ? cursor : encodeURIComponent(cursor)}`);
    expect((firstCall(h.cursorFind)[0] as { where: { id: string } }).where.id).toBe(expectedId);
  });

  // OBSERVED, not endorsed: only the id decides. The seconds are checked to be a positive number and then never used.
  it("uses only the id of the cursor: any positive number of seconds gives the same page (observed)", async () => {
    const pages: string[][] = [];
    for (const cursor of ["1:m6", "1760000006:m6", "99999999999:m6"]) {
      h.conversationFind.mockClear();
      pages.push(ids((await load(JID_RAW, `?limit=3&before=${cursor}`)).body));
    }
    expect(pages).toEqual([["m3", "m4", "m5"], ["m3", "m4", "m5"], ["m3", "m4", "m5"]]);
  });

  // OBSERVED, not endorsed: a cursor that matches no message in this thread is dropped without a word and the newest window is sent.
  it("ignores a cursor whose message is not in the thread, and sends the newest window (observed)", async () => {
    const { response, body } = await load(JID_RAW, "?limit=3&before=1760000006:ghost");
    expect(response.status).toBe(200);
    expect(h.cursorFind).toHaveBeenCalledTimes(1);
    expect(convArgs().select.messages.take).toBe(3);
    expect(convArgs().select.messages.where).toBeUndefined();
    expect(ids(body)).toEqual(["m8", "m9", "m10"]);
  });

  it("returns the messages older than the cursor, oldest first, and leaves the cursor message out", async () => {
    const { body } = await load(JID_RAW, "?limit=3&before=1760000006:m6");
    expect(ids(body)).toEqual(["m3", "m4", "m5"]);
  });

  it("keeps messages of the same second: the cursor compares the id as well as the time", async () => {
    const T = new Date((BASE + 50) * 1000);
    setThread([row(1), row(2), row(3, { id: "t1", timestamp: T }), row(4, { id: "t2", timestamp: T }), row(5, { id: "t3", timestamp: T })]);
    const { body } = await load(JID_RAW, `?limit=10&before=${BASE + 50}:t3`);
    expect(ids(body)).toEqual(["m1", "m2", "t1", "t2"]);
  });

  it("answers hasMore false and no cursor when the page reaches the beginning of the thread", async () => {
    const { body } = await load(JID_RAW, "?limit=3&before=1760000004:m4");
    expect(ids(body)).toEqual(["m1", "m2", "m3"]);
    expect(body.hasMore).toBe(false);
    expect(body.olderCursor).toBeNull();
  });

  it("answers hasMore true when more messages remain beyond the page, and shows only the limit", async () => {
    const { body } = await load(JID_RAW, "?limit=3&before=1760000006:m6");
    expect(body.hasMore).toBe(true);
    expect(body.messages).toHaveLength(3);
  });

  // The extra row (m2) is read to learn that more exist and is then dropped: nothing may be looked up for it, and a quote of it is
  // outside the window.
  it("drops the extra row before every follow-up lookup: the quote, the provider-event and the effect lookups see only the page", async () => {
    const rows = Array.from({ length: 10 }, (_, index) => row(index + 1));
    rows[1] = row(2, { direction: "outbound" });
    rows[4] = row(5, { quotedMessageId: "m2" });
    setThread(rows);
    const { body } = await load(JID_RAW, "?limit=3&before=1760000006:m6");
    expect(ids(body)).toEqual(["m3", "m4", "m5"]);
    expect((firstCall(h.quotedFind)[0] as { where: { id: { in: string[] } } }).where.id.in).toEqual(["m2"]);
    expect((firstCall(h.ingressFind)[0] as { where: { messageId: { in: string[] } } }).where.messageId.in).toEqual(["m5", "m4", "m3"]);
    expect(h.effectFind).not.toHaveBeenCalled();
    expect(byMessageId(body, "m5").quoted).toEqual({ fromMe: true, preview: "body 2", messageType: "text" });
  });

  // OBSERVED, not endorsed: the cursor is built from the first row of the page, which is the NEWEST one (the rows are newest
  // first), so loading older again starts at the page just loaded and goes back by one message.
  it("builds the older cursor from the newest message of the page (observed)", async () => {
    const { body } = await load(JID_RAW, "?limit=3&before=1760000006:m6");
    expect(ids(body)).toEqual(["m3", "m4", "m5"]);
    expect(body.olderCursor).toBe(`${BASE + 5}:m5`);
  });

  it("writes the seconds of the older cursor as whole seconds, cutting the milliseconds off (observed message: the newest of the page)", async () => {
    const rows = Array.from({ length: 10 }, (_, index) => row(index + 1));
    rows[4] = row(5, { timestamp: new Date((BASE + 5) * 1000 + 999) });
    setThread(rows);
    const { body } = await load(JID_RAW, "?limit=3&before=1760000006:m6");
    expect(ids(body)).toEqual(["m3", "m4", "m5"]);
    expect(body.olderCursor).toBe(`${BASE + 5}:m5`);
  });

  it.fails("EXPECTED (fails today): builds the older cursor from the OLDEST message of the page", async () => {
    const { body } = await load(JID_RAW, "?limit=3&before=1760000006:m6");
    expect(body.olderCursor).toBe(`${BASE + 3}:m3`);
  });

  // OBSERVED, not endorsed: on the first page the route asks for exactly `limit` rows, so it can never receive the extra row that
  // would tell it more exist. hasMore is always false and no older cursor is offered, and the inbox (use-inbox-thread.ts) takes
  // both only from this answer. The stand-in database obeys `take`, as a real one does.
  it("answers hasMore false and no older cursor on the first page even when older messages exist (observed)", async () => {
    const { body } = await load(JID_RAW, "?limit=4");
    expect(ids(body)).toEqual(["m7", "m8", "m9", "m10"]);
    expect(body.hasMore).toBe(false);
    expect(body.olderCursor).toBeNull();
  });

  it.fails("EXPECTED (fails today): offers an older cursor on the first page when older messages exist", async () => {
    const { body } = await load(JID_RAW, "?limit=4");
    expect(ids(body)).toEqual(["m7", "m8", "m9", "m10"]);
    expect(body.hasMore).toBe(true);
    expect(body.olderCursor).not.toBeNull();
  });

  // A half fix (only one of the two defects) would turn only one of the tests above green; this walk needs both.
  it.fails("EXPECTED (fails today): echoing olderCursor walks the whole thread once, with no overlap", async () => {
    const seen: string[] = [];
    let query = "?limit=4";
    for (let page = 0; page < 5; page += 1) {
      const { body } = await load(JID_RAW, query);
      seen.unshift(...ids(body));
      if (!body.olderCursor) break;
      query = `?limit=4&before=${encodeURIComponent(body.olderCursor)}`;
    }
    expect(seen).toEqual(Array.from({ length: 10 }, (_, index) => `m${index + 1}`));
  });
});

describe("GET /api/whatsapp/chats/[jid]/messages: quoted replies", () => {
  it("resolves a quote whose target is in the window from the window itself, with no extra lookup", async () => {
    setThread([row(1, { body: "the offer", direction: "outbound", messageType: "image" }), row(2, { quotedMessageId: "m1" })]);
    const { body } = await load();
    expect(h.quotedFind).not.toHaveBeenCalled();
    expect(byMessageId(body, "m2").quoted).toEqual({ fromMe: true, preview: "the offer", messageType: "image" });
    expect(byMessageId(body, "m1").quoted).toBeNull();
    expect(byMessageId(body, "m2").quotedMessageId).toBe("m1");
  });

  it("looks up a quote whose target is outside the window in one query, with exactly these fields", async () => {
    world.elsewhere = [row(900, { id: "old-1", body: "earlier question", direction: "inbound", messageType: "text" })];
    setThread([row(1), row(2, { quotedMessageId: "old-1" })]);
    const { body } = await load();
    expect(h.quotedFind).toHaveBeenCalledTimes(1);
    expect(firstCall(h.quotedFind)[0]).toEqual({
      where: { id: { in: ["old-1"] } },
      select: { id: true, body: true, direction: true, messageType: true },
    });
    expect(byMessageId(body, "m2").quoted).toEqual({ fromMe: false, preview: "earlier question", messageType: "text" });
  });

  it("asks only for the targets outside the window, once each, when several rows quote the same or in-window messages", async () => {
    world.elsewhere = [row(900, { id: "old-1" }), row(901, { id: "old-2" })];
    setThread([row(1), row(2, { quotedMessageId: "m1" }), row(3, { quotedMessageId: "old-1" }), row(4, { quotedMessageId: "old-1" }), row(5, { quotedMessageId: "old-2" })]);
    await load();
    expect((firstCall(h.quotedFind)[0] as { where: { id: { in: string[] } } }).where.id.in).toEqual(["old-2", "old-1"]);
  });

  it("asks for at most 100 targets, taking them in the order of the rows, newest row first", async () => {
    setThread(Array.from({ length: 120 }, (_, index) => row(index + 1, { quotedMessageId: `q${index + 1}` })));
    await load(JID_RAW, "?limit=500");
    const asked = (firstCall(h.quotedFind)[0] as { where: { id: { in: string[] } } }).where.id.in;
    expect(asked).toHaveLength(100);
    expect(asked).toEqual(Array.from({ length: 100 }, (_, index) => `q${120 - index}`));
  });

  it("answers quoted null, and keeps the id, when the target cannot be found anywhere", async () => {
    setThread([row(1, { quotedMessageId: "gone" })]);
    const { body } = await load();
    expect(msgAt(body, 0).quoted).toBeNull();
    expect(msgAt(body, 0).quotedMessageId).toBe("gone");
  });

  it("makes no quote lookup when no row quotes anything", async () => {
    await load();
    expect(h.quotedFind).not.toHaveBeenCalled();
  });

  it.each([
    ["outbound", true],
    ["outgoing", true],
    ["inbound", false],
    ["system", false],
  ])("marks a quoted %s message fromMe %s, for a target outside the window", async (direction, fromMe) => {
    world.elsewhere = [row(900, { id: "old-1", direction })];
    setThread([row(1, { quotedMessageId: "old-1" })]);
    const { body } = await load();
    expect(msgAt(body, 0).quoted?.fromMe).toBe(fromMe);
  });

  it.each([
    ["outbound", true],
    ["outgoing", true],
    ["inbound", false],
  ])("marks a quoted %s message fromMe %s, for a target inside the window", async (direction, fromMe) => {
    setThread([row(1, { direction }), row(2, { quotedMessageId: "m1" })]);
    const { body } = await load();
    expect(byMessageId(body, "m2").quoted?.fromMe).toBe(fromMe);
  });

  it("cuts a preview to 200 characters, counting each emoji as one, for a target outside the window", async () => {
    world.elsewhere = [row(900, { id: "old-1", body: "😀".repeat(250) })];
    setThread([row(1, { quotedMessageId: "old-1" })]);
    const preview = msgAt((await load()).body, 0).quoted?.preview ?? "";
    expect(Array.from(preview)).toHaveLength(200);
    expect(preview).toBe("😀".repeat(200));
  });

  it("cuts a preview to 200 characters for a target inside the window too", async () => {
    setThread([row(1, { body: "ب".repeat(250) }), row(2, { quotedMessageId: "m1" })]);
    const preview = byMessageId((await load()).body, "m2").quoted?.preview ?? "";
    expect(Array.from(preview)).toHaveLength(200);
    expect(preview).toBe("ب".repeat(200));
  });

  it("cuts an in-window preview of emoji by characters too, not by UTF-16 units", async () => {
    setThread([row(1, { body: "\u{1F600}".repeat(250) }), row(2, { quotedMessageId: "m1" })]);
    const preview = byMessageId((await load()).body, "m2").quoted?.preview ?? "";
    expect(Array.from(preview)).toHaveLength(200);
    expect(preview).toBe("\u{1F600}".repeat(200));
  });

  it("keeps a preview of exactly 200 characters whole", async () => {
    setThread([row(1, { body: "x".repeat(200) }), row(2, { quotedMessageId: "m1" })]);
    expect(byMessageId((await load()).body, "m2").quoted?.preview).toBe("x".repeat(200));
  });

  it("passes the message type of the quoted message through", async () => {
    world.elsewhere = [row(900, { id: "old-1", messageType: "image" })];
    setThread([row(1, { quotedMessageId: "old-1" })]);
    expect(msgAt((await load()).body, 0).quoted?.messageType).toBe("image");
  });
});

describe("GET /api/whatsapp/chats/[jid]/messages: sent messages and the provider's ids", () => {
  const OUT = row(1, { direction: "outbound", deliveryStatus: "delivered" });
  const IN = row(2);

  it("asks for the send effects of the outbound messages only, with exactly these fields, newest first", async () => {
    setThread([OUT, IN, row(3, { direction: "outgoing" })]);
    await load();
    expect(h.effectFind).toHaveBeenCalledTimes(1);
    expect(firstCall(h.effectFind)[0]).toEqual({
      where: { messageId: { in: ["m3", "m1"] } },
      select: { messageId: true, effectKey: true, providerMessageId: true },
    });
  });

  it("makes no effect lookup and no send-intent lookup when no message is outbound", async () => {
    setThread([row(1), row(2)]);
    await load();
    expect(h.effectFind).not.toHaveBeenCalled();
    expect(sendIntentCalls()).toHaveLength(0);
  });

  it("asks for the applied provider events of every message in the window, outbound ones included, with exactly these fields", async () => {
    setThread([row(1), row(2, { direction: "outbound" }), row(3)]);
    await load();
    expect(h.ingressFind).toHaveBeenCalledTimes(1);
    expect(firstCall(h.ingressFind)[0]).toEqual({
      where: { messageId: { in: ["m3", "m2", "m1"] }, status: "applied" },
      select: { messageId: true, providerEventId: true },
    });
  });

  it("uses the provider's id as the key of an inbound message, and the message id when there is no applied event", async () => {
    world.ingress = [
      { messageId: "m1", providerEventId: "3EB0IN-1", status: "applied" },
      { messageId: "m2", providerEventId: "3EB0IN-2", status: "rejected" },
    ];
    const { body } = await load();
    expect(body.messages.map((message) => message.key.id)).toEqual(["3EB0IN-1", "m2", "m3"]);
  });

  it("uses the provider's message id as the key of an outbound message that has an effect, and the message id otherwise", async () => {
    setThread([row(1, { direction: "outbound" }), row(2, { direction: "outbound" }), row(3, { direction: "outbound" })]);
    world.effects = [
      { messageId: "m1", effectKey: "effect-1", providerMessageId: "3EB0OUT-1" },
      { messageId: "m2", effectKey: "effect-2", providerMessageId: null },
    ];
    const { body } = await load();
    expect(body.messages.map((message) => message.key.id)).toEqual(["3EB0OUT-1", "m2", "m3"]);
    expect(body.messages.map((message) => message.key.fromMe)).toEqual([true, true, true]);
  });

  it("never uses a provider event for an outbound message", async () => {
    setThread([row(1, { direction: "outbound" }), row(2)]);
    world.ingress = [{ messageId: "m1", providerEventId: "3EB0WRONG", status: "applied" }];
    const { body } = await load();
    expect(body.messages.map((message) => message.key.id)).toEqual(["m1", "m2"]);
  });

  // The stand-in database only returns what the route asked for, so the test above cannot tell the route to ignore an effect it
  // was handed for an inbound message. Here the database hands one over anyway.
  it("ignores an effect the database returns for an inbound message: only outbound messages carry an effect key", async () => {
    setThread([row(1, { direction: "outbound" }), row(2)]);
    h.effectFind.mockResolvedValue([
      { messageId: "m1", effectKey: "effect-1", providerMessageId: null },
      { messageId: "m2", effectKey: "effect-x", providerMessageId: "3EB0WRONG-2" },
    ]);
    const { body } = await load();
    expect(msgAt(body, 0).effectKey).toBe("effect-1");
    expect(msgAt(body, 1).key.id).toBe("m2");
    expect(msgAt(body, 1)).not.toHaveProperty("effectKey");
  });

  it.each([
    ["outbound", true],
    ["outgoing", true],
    ["inbound", false],
    ["system", false],
  ])("treats a %s message as sent by the shop: %s", async (direction, fromMe) => {
    setThread([row(1, { direction })]);
    expect(msgAt((await load()).body, 0).key.fromMe).toBe(fromMe);
  });

  it("gives an outbound message its delivery status, or sending when it has none, and an inbound message none", async () => {
    setThread([row(1, { direction: "outbound", deliveryStatus: "read" }), row(2, { direction: "outbound", deliveryStatus: null }), row(3, { deliveryStatus: "read" })]);
    const { body } = await load();
    expect(msgAt(body, 0).deliveryStatus).toBe("read");
    expect(msgAt(body, 1).deliveryStatus).toBe("sending");
    expect("deliveryStatus" in msgAt(body, 2)).toBe(false);
  });

  it("gives an outbound message its effect key, the state of its send intent and the intent's error code", async () => {
    setThread([OUT]);
    world.effects = [{ messageId: "m1", effectKey: "effect-1", providerMessageId: "3EB0OUT-1" }];
    world.intents = [{ effectKey: "effect-1", status: "failed", outcomeState: "definitive", lastErrorCode: "WHATSAPP_TIMEOUT" }];
    const { body } = await load();
    expect(sendIntentCalls()).toHaveLength(1);
    expect(sendIntentCalls()[0]).toEqual({
      where: { effectKey: { in: ["effect-1"] } },
      select: { effectKey: true, status: true, outcomeState: true, lastErrorCode: true },
    });
    expect(msgAt(body, 0).effectKey).toBe("effect-1");
    expect(msgAt(body, 0).effectState).toBe("failed");
    expect(msgAt(body, 0).effectErrorCode).toBe("WHATSAPP_TIMEOUT");
  });

  it.each([
    ["a failed intent with an ambiguous outcome", "failed", "ambiguous", "ambiguous"],
    ["a failed intent with a definitive outcome", "failed", "definitive", "failed"],
    ["a failed intent with no outcome", "failed", null, "failed"],
    ["a dead-lettered intent with an ambiguous outcome", "dead_letter", "ambiguous", "dead_letter"],
    ["a succeeded intent with an ambiguous outcome", "succeeded", "ambiguous", "succeeded"],
    ["a pending intent", "pending", null, "pending"],
  ])("reports %s as the state %s", async (_label, status, outcomeState, expected) => {
    setThread([OUT]);
    world.effects = [{ messageId: "m1", effectKey: "effect-1", providerMessageId: null }];
    world.intents = [{ effectKey: "effect-1", status, outcomeState }];
    expect(msgAt((await load()).body, 0).effectState).toBe(expected);
  });

  it("gives no state and a null error code to an outbound message whose effect has no intent", async () => {
    setThread([OUT]);
    world.effects = [{ messageId: "m1", effectKey: "effect-1", providerMessageId: null }];
    const { body } = await load();
    expect("effectState" in msgAt(body, 0)).toBe(false);
    expect(msgAt(body, 0).effectKey).toBe("effect-1");
    expect(msgAt(body, 0).effectErrorCode).toBeNull();
  });

  it("gives a null error code to an intent that has none", async () => {
    setThread([OUT]);
    world.effects = [{ messageId: "m1", effectKey: "effect-1", providerMessageId: null }];
    world.intents = [{ effectKey: "effect-1", status: "succeeded", outcomeState: "receipt", lastErrorCode: null }];
    expect(msgAt((await load()).body, 0).effectErrorCode).toBeNull();
  });

  it("gives an outbound message with no effect no effect key and a null error code", async () => {
    setThread([OUT]);
    const { body } = await load();
    expect("effectKey" in msgAt(body, 0)).toBe(false);
    expect(msgAt(body, 0).effectErrorCode).toBeNull();
  });
});

describe("GET /api/whatsapp/chats/[jid]/messages: attachments and their links", () => {
  const IMAGE = { kind: "image", state: "ready", mimeType: "image/jpeg", fileName: "photo.jpg" };

  function statusUrl(id: string): string {
    return `/api/inbox/media/${encodeURIComponent(id)}/status`;
  }

  function readyLinks(id: string): Record<string, string> {
    const encoded = encodeURIComponent(id);
    return {
      statusUrl: `/api/inbox/media/${encoded}/status`,
      readUrl: `/api/inbox/media/${encoded}`,
      downloadUrl: `/api/inbox/media/${encoded}?download=1`,
      thumbnailUrl: `/api/inbox/media/${encoded}?variant=thumbnail`,
    };
  }

  it("asks for the media intents of the inbound media messages only, by their effect key and the media-fetch type, with exactly these fields", async () => {
    setThread([
      row(1, { messageType: "image" }),
      row(2, { messageType: "video" }),
      row(3, { messageType: "audio" }),
      row(4, { messageType: "document" }),
      row(5, { messageType: "sticker" }),
      row(6, { messageType: "text" }),
      row(7, { messageType: "location" }),
      row(8, { messageType: "image", direction: "outbound" }),
      row(9, { messageType: "image", direction: "outgoing" }),
    ]);
    await load(JID_RAW, "?limit=20");
    expect(mediaIntentCalls()).toHaveLength(1);
    expect(mediaIntentCalls()[0]).toEqual({
      where: { effectKey: { in: ["5", "4", "3", "2", "1"].map((n) => `whatsapp-media-fetch:m${n}`) }, effectType: MEDIA_FETCH },
      select: { effectKey: true, status: true, outcomeState: true },
    });
  });

  it("makes no media-intent lookup when no inbound message is media", async () => {
    setThread([row(1), row(2, { messageType: "image", direction: "outbound" })]);
    await load();
    expect(mediaIntentCalls()).toHaveLength(0);
  });

  it("fetches the envelope key only when some message has an attachment", async () => {
    await load();
    expect(h.envelopeKey).not.toHaveBeenCalled();
    expect(h.openAttachment).not.toHaveBeenCalled();
    setThread([sealed({ messageType: "image" }, IMAGE, 1), row(2)]);
    await load();
    expect(h.envelopeKey).toHaveBeenCalledTimes(1);
  });

  it("fetches the key for the shop's own database and context, once, and opens each attachment with the message id, the sealed value and that key", async () => {
    setThread([sealed({ messageType: "image" }, IMAGE, 1), row(2), sealed({ messageType: "image" }, IMAGE, 3)]);
    await load();
    const [context] = firstCall(h.envelopeKey) as [{ prisma: unknown; shop: unknown }];
    expect(context.prisma).toBe(db);
    expect(context.shop).toBe(shopContext);
    expect(h.openAttachment).toHaveBeenCalledTimes(2);
    expect(h.openAttachment.mock.calls.map((call) => [call[0], call[1]])).toEqual([
      ["m3", "sealed-3"],
      ["m1", "sealed-1"],
    ]);
    for (const call of h.openAttachment.mock.calls) expect(call[2]).toBe(issuedKey);
  });

  it("gives a message with no attachment attachment null, also when another message has one", async () => {
    setThread([sealed({ messageType: "image" }, IMAGE, 1), row(2)]);
    const { body } = await load();
    expect(byMessageId(body, "m2").attachment).toBeNull();
  });

  it("wipes the envelope key once the answer is built", async () => {
    setThread([sealed({ messageType: "image" }, IMAGE, 1)]);
    await load();
    expect(issuedKey).not.toBeNull();
    expect(issuedKey?.every((byte) => byte === 0)).toBe(true);
  });

  it("wipes the envelope key also when an attachment cannot be opened, and answers a generic 500 that holds no secret", async () => {
    setThread([sealed({ messageType: "image" }, IMAGE, 1)]);
    h.openAttachment.mockImplementation(() => {
      throw new Error(`cannot decrypt, key ${SECRET_IN_ERROR}`);
    });
    const response = await get();
    expect(response.status).toBe(500);
    const text = JSON.stringify(await response.json());
    expect(text).toBe(JSON.stringify({ error: "Internal server error" }));
    expect(text).not.toContain(SECRET_IN_ERROR);
    expect(h.logError).toHaveBeenCalledTimes(1);
    expect(issuedKey?.every((byte) => byte === 0)).toBe(true);
    expect(h.sidecarStatus).not.toHaveBeenCalled();
  });

  it("answers a generic 500, opens nothing and calls no sidecar when the envelope key cannot be fetched", async () => {
    setThread([sealed({ messageType: "image" }, IMAGE, 1)]);
    h.envelopeKey.mockRejectedValue(new Error(`keystore locked ${SECRET_IN_ERROR}`));
    const response = await get();
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain(SECRET_IN_ERROR);
    expect(h.openAttachment).not.toHaveBeenCalled();
    expect(h.sidecarStatus).not.toHaveBeenCalled();
  });

  it.each([
    ["a succeeded intent with a receipt", { status: "succeeded", outcomeState: "receipt" }, "ready"],
    ["a succeeded intent with another outcome", { status: "succeeded", outcomeState: "pending" }, "pending"],
    ["a succeeded intent with no outcome", { status: "succeeded", outcomeState: null }, "pending"],
    ["a failed intent", { status: "failed", outcomeState: null }, "failed"],
    ["a dead-lettered intent", { status: "dead_letter", outcomeState: null }, "failed"],
    ["a queued intent", { status: "queued", outcomeState: null }, "pending"],
    ["a running intent", { status: "running", outcomeState: null }, "pending"],
    ["no intent at all", null, "pending"],
  ])("links an inbound image from %s as %s", async (_label, intent, state) => {
    setThread([sealed({ messageType: "image" }, IMAGE, 1)]);
    if (intent) world.intents = [{ effectKey: "whatsapp-media-fetch:m1", effectType: MEDIA_FETCH, ...intent }];
    const { body } = await load();
    const links = readyLinks("m1");
    const expected = state === "ready" ? { state, ...links } : { state, statusUrl: statusUrl("m1") };
    expect(msgAt(body, 0).attachment).toEqual({ ...IMAGE, localMedia: expected });
  });

  it("builds the links from the message id, percent-encoded", async () => {
    setThread([sealed({ id: "a/b c?d", messageType: "image" }, IMAGE, 1)]);
    world.intents = [{ effectKey: "whatsapp-media-fetch:a/b c?d", effectType: MEDIA_FETCH, status: "succeeded", outcomeState: "receipt" }];
    const { body } = await load();
    expect((msgAt(body, 0).attachment as { localMedia: Record<string, string> }).localMedia).toEqual({ state: "ready", ...readyLinks("a/b c?d") });
    expect(statusUrl("a/b c?d")).toBe("/api/inbox/media/a%2Fb%20c%3Fd/status");
  });

  it.each(["image", "video", "audio", "document", "sticker"])("treats an inbound %s as media: its link follows its intent", async (kind) => {
    setThread([sealed({ messageType: kind }, { ...IMAGE, kind }, 1)]);
    world.intents = [{ effectKey: "whatsapp-media-fetch:m1", effectType: MEDIA_FETCH, status: "failed", outcomeState: null }];
    const { body } = await load();
    expect((msgAt(body, 0).attachment as { localMedia: { state: string } }).localMedia.state).toBe("failed");
  });

  it.each(["image", "video", "document", "audio"])("links an outbound %s as ready whatever its intent says, because its bytes were stored before they were sent", async (kind) => {
    setThread([sealed({ direction: "outbound", messageType: kind }, { ...IMAGE, kind }, 1)]);
    world.effects = [{ messageId: "m1", effectKey: "effect-1", providerMessageId: null }];
    world.intents = [{ effectKey: "effect-1", status: "failed", outcomeState: "definitive" }];
    const { body } = await load();
    expect((msgAt(body, 0).attachment as { localMedia: unknown }).localMedia).toEqual({ state: "ready", ...readyLinks("m1") });
  });

  it("links an outgoing image as ready too, whatever a media intent for it would say, and asks for no media intent", async () => {
    setThread([sealed({ direction: "outgoing", messageType: "image" }, IMAGE, 1)]);
    world.intents = [{ effectKey: "whatsapp-media-fetch:m1", effectType: MEDIA_FETCH, status: "failed", outcomeState: null }];
    const { body } = await load();
    expect((msgAt(body, 0).attachment as { localMedia: unknown }).localMedia).toEqual({ state: "ready", ...readyLinks("m1") });
    expect(mediaIntentCalls()).toHaveLength(0);
  });

  it("does not ask for a media intent for an outbound attachment", async () => {
    setThread([sealed({ direction: "outbound", messageType: "image" }, IMAGE, 1)]);
    await load();
    expect(mediaIntentCalls()).toHaveLength(0);
  });

  // OBSERVED, not endorsed: an outbound sticker is a binary kind but is not in the list of outbound kinds that get a link, and the
  // inbound branch does not apply to it, so it reaches the browser with no local media link at all.
  it("gives an outbound sticker no local media link (observed)", async () => {
    const sticker = { ...IMAGE, kind: "sticker" };
    setThread([sealed({ direction: "outbound", messageType: "sticker" }, sticker, 1)]);
    const { body } = await load();
    expect(msgAt(body, 0).attachment).toEqual(sticker);
  });

  it.each([
    ["inbound", "inbound"],
    ["outbound", "outbound"],
  ])("passes a %s location or contact attachment through unchanged, with no media link", async (_label, direction) => {
    const location = { kind: "location", state: "ready", location: { latitude: 36.75, longitude: 3.06, name: "Alger" } };
    const contact = { kind: "contact", state: "ready", fileName: null };
    setThread([sealed({ direction, messageType: "location" }, location, 1), sealed({ direction, messageType: "contact" }, contact, 2)]);
    const { body } = await load();
    expect(msgAt(body, 0).attachment).toEqual(location);
    expect(msgAt(body, 1).attachment).toEqual(contact);
  });

  it("keeps every other field of the opened attachment next to the link", async () => {
    const rich = { ...IMAGE, sizeBytes: 12345, width: 640, height: 480, voiceMessage: false };
    setThread([sealed({ messageType: "image" }, rich, 1)]);
    const attachment = msgAt((await load()).body, 0).attachment as Record<string, unknown>;
    expect(attachment).toMatchObject(rich);
    expect(Object.keys(attachment).sort()).toEqual([...Object.keys(rich), "localMedia"].sort());
  });
});

describe("GET /api/whatsapp/chats/[jid]/messages: the WhatsApp sidecar", () => {
  it("asks the sidecar once and reports it reachable", async () => {
    const { body } = await load();
    expect(h.sidecarStatus).toHaveBeenCalledTimes(1);
    expect(body.sidecarReachable).toBe(true);
  });

  it("asks the sidecar after the conversation was read", async () => {
    await load();
    expect(firstOrder(h.conversationFind)).toBeLessThan(firstOrder(h.sidecarStatus));
  });

  it.each([
    ["an unavailable sidecar", () => new SidecarUnavailableError("sidecar is down")],
    ["a sidecar that refused the request", () => new SidecarRequestError("bad request", "SIDECAR_REJECTED", false, false, 500)],
  ])("answers 200 with sidecarReachable false, and the messages, for %s", async (_label, makeError) => {
    h.sidecarStatus.mockRejectedValue(makeError());
    const { response, body } = await load();
    expect(response.status).toBe(200);
    expect(body.sidecarReachable).toBe(false);
    expect(ids(body)).toEqual(["m1", "m2", "m3"]);
  });

  it("answers a generic 500 that holds no secret for any other sidecar failure, after the messages were read", async () => {
    h.sidecarStatus.mockRejectedValue(new Error(`socket closed, token ${SECRET_IN_ERROR}`));
    const response = await get();
    expect(response.status).toBe(500);
    const text = JSON.stringify(await response.json());
    expect(text).toBe(JSON.stringify({ error: "Internal server error" }));
    expect(text).not.toContain(SECRET_IN_ERROR);
    expect(h.conversationFind).toHaveBeenCalledTimes(1);
    expect(h.logError).toHaveBeenCalledTimes(1);
  });
});

describe("GET /api/whatsapp/chats/[jid]/messages: failures in the lookups", () => {
  it.each([
    [
      "the cursor lookup",
      () => {
        setThread([row(1), row(2)]);
      },
      "?before=1760000002:m2",
      () => h.cursorFind,
    ],
    [
      "the quoted-message lookup",
      () => {
        setThread([row(1, { quotedMessageId: "old" })]);
      },
      "",
      () => h.quotedFind,
    ],
    [
      "the send-effect lookup",
      () => {
        setThread([row(1, { direction: "outbound" })]);
      },
      "",
      () => h.effectFind,
    ],
    [
      "the provider-event lookup",
      () => {
        setThread([row(1)]);
      },
      "",
      () => h.ingressFind,
    ],
    [
      "the media-intent lookup",
      () => {
        setThread([row(1, { messageType: "image" })]);
      },
      "",
      () => h.intentFind,
    ],
  ])("answers a generic 500 that holds no secret, and no partial thread, when %s fails", async (_label, arrange, query, spy) => {
    arrange();
    spy().mockRejectedValue(new Error(`connection refused for password ${SECRET_IN_ERROR}`));
    const response = await get(JID_RAW, query);
    expect(response.status).toBe(500);
    const text = JSON.stringify(await response.json());
    expect(text).toBe(JSON.stringify({ error: "Internal server error" }));
    expect(text).not.toContain(SECRET_IN_ERROR);
    expect(h.logError).toHaveBeenCalledTimes(1);
    expect(h.sidecarStatus).not.toHaveBeenCalled();
  });

  it("answers a generic 500 when the send-intent lookup fails, after the effects were found", async () => {
    setThread([row(1, { direction: "outbound" })]);
    world.effects = [{ messageId: "m1", effectKey: "effect-1", providerMessageId: null }];
    h.intentFind.mockImplementation(async (args: { where: { effectType?: string } }) => {
      if (args.where.effectType === undefined) throw new Error(`lock timeout ${SECRET_IN_ERROR}`);
      return [];
    });
    const response = await get();
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain(SECRET_IN_ERROR);
    expect(h.sidecarStatus).not.toHaveBeenCalled();
  });
});
