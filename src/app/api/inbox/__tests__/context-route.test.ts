import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// GET /api/inbox/context/[id] fills the right-hand rail of the inbox: for one conversation it shows the matching
// customer, their last orders, their delivery rate and (for the right people) their risk record. Conversation access
// never implies customer, contact, order or money access, so the route asks the permission catalog one question per
// family of fields. What matters here is that projection: each field family appears only for a member who holds the
// permissions it needs (the orders also need the two customer permissions, and the risk record needs four), an unknown
// phone format is looked up only as written, and the orders and the risk record are not even read from the database
// for a member who may not see them. Two things are pinned as OBSERVED because they look unintended: the customer's
// order COUNT is a column of the customer row and is shown without orders.read, and fieldAccess.orders means "holds
// orders.read", not "orders were returned". Cross-shop isolation cannot be tested here: the route always passes the
// actor's own shop as the resource, so that check can never fail; isolation rests on the per-shop database handle.
//
// Real code under test: the route, withErrorHandler (so each refusal has the real status and body), the REAL
// authorization chain (requireTrustedActor, requireTrustedAction, trustedActionAllowed, assertTrustedAction), the
// Phase 2 permission catalog and role table, and SahelFlowError. Stand-ins: the session authority and the durable
// identity lookup (they hand the real chain a role or an explicit permission list), the database handle (five calls,
// whose arguments are inspected and whose answers are canned: whether a `where` really filters is NOT tested) and the
// logger/monitoring hooks withErrorHandler calls (its shop-authority and licence hooks only run when NODE_ENV is
// production, so those two mocks are inert here and the production checks that run before the route are NOT tested).
const h = vi.hoisted(() => ({
  getAuthority: vi.fn(),
  resolveIdentity: vi.fn(),
  conversationFind: vi.fn(),
  customerFindFirst: vi.fn(),
  customerFindUnique: vi.fn(),
  orderFindMany: vi.fn(),
  orderCount: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({ getCurrentSessionAuthority: h.getAuthority }));
vi.mock("@/lib/identity/control-authority", () => ({ resolveDurableIdentityActor: h.resolveIdentity }));
vi.mock("@/lib/db", () => ({
  db: {
    conversation: { findUnique: h.conversationFind },
    customer: { findFirst: h.customerFindFirst, findUnique: h.customerFindUnique },
    order: { findMany: h.orderFindMany, count: h.orderCount },
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

import * as route from "@/app/api/inbox/context/[id]/route";
import { PHASE2_ACTIONS } from "@/lib/identity/permissions";

const { GET } = route;

const SECRET_IN_ERROR = "SECRET-DB-PASSWORD-0003";
const ALL = [
  "conversations.read",
  "customers.read",
  "customers.contact.read",
  "orders.read",
  "orders.financials.read",
  "risk.read",
] as const;
const IDENTITY = {
  personId: "5".repeat(32),
  workspaceMemberId: "6".repeat(32),
  deviceId: "7".repeat(32),
  policyVersion: 1,
  revocationEpoch: 0,
};
const CONVERSATION = { id: "conv-1", contactName: "Amine", contactPhone: "0555123456" };
const CUSTOMER = {
  id: "cust-1",
  name: "Amine B.",
  phone: "0555123456",
  wilaya: "16",
  commune: "Bab El Oued",
  orderCount: 7,
  totalSpent: 98500,
};
const RISK = { riskScore: 42, isBlacklisted: true, blacklistReason: "refused 3 parcels" };
const ORDERS = [
  {
    id: "o-4",
    orderNumber: "ORD-4",
    status: "delivered",
    source: "whatsapp",
    totalPrice: 12000,
    createdAt: new Date("2026-10-20T10:00:00.000Z"),
    deliveredAt: new Date("2026-10-22T09:00:00.000Z"),
  },
  {
    id: "o-3",
    orderNumber: "ORD-3",
    status: "pending",
    source: "web",
    totalPrice: 8000,
    createdAt: new Date("2026-10-18T10:00:00.000Z"),
    deliveredAt: null,
  },
];
const FULL_ACCESS = { customer: true, contact: true, orders: true, financials: true, risk: true };

/** What the browser receives: Dates become text, undefined keys disappear. */
function wire<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value));
}

function actingWith(permissions: readonly string[]): void {
  // The manager preset's ceiling holds all six permissions, so every list used here is a legal custom policy for it.
  h.resolveIdentity.mockResolvedValue({ ...IDENTITY, role: "manager", permissions });
}

function actingAs(role: "owner" | "manager" | "operator" | "viewer"): void {
  h.resolveIdentity.mockResolvedValue({ ...IDENTITY, role, permissions: null });
}

function without(...omitted: string[]): string[] {
  return ALL.filter((action) => !omitted.includes(action));
}

function get(id: string = CONVERSATION.id) {
  return GET(new NextRequest("http://localhost/api/inbox/context/x"), { params: Promise.resolve({ id }) });
}

function firstOrder(spy: { mock: { invocationCallOrder: number[] } }): number {
  const first = spy.mock.invocationCallOrder[0];
  if (first === undefined) throw new Error("the stand-in was never called");
  return first;
}

function firstArgs(spy: { mock: { calls: unknown[][] } }): Record<string, unknown> {
  const first = spy.mock.calls[0];
  if (!first) throw new Error("the stand-in was never called");
  return first[0] as Record<string, unknown>;
}

function expectNoCustomerOrOrderRead(): void {
  expect(h.customerFindFirst).not.toHaveBeenCalled();
  expect(h.customerFindUnique).not.toHaveBeenCalled();
  expect(h.orderFindMany).not.toHaveBeenCalled();
  expect(h.orderCount).not.toHaveBeenCalled();
}

/** The phone numbers the route tried, in order, as the `where.phone` of each customer lookup. */
function phonesTried(): unknown[] {
  return h.customerFindFirst.mock.calls.map((call) => ((call[0] as { where: { phone: unknown } }).where.phone));
}

beforeEach(() => {
  h.getAuthority.mockReset().mockResolvedValue({ status: "authenticated", sessionId: "inbox-context-session" });
  actingWith(ALL);
  h.conversationFind.mockReset().mockResolvedValue({ ...CONVERSATION });
  h.customerFindFirst.mockReset().mockResolvedValue({ ...CUSTOMER });
  h.customerFindUnique.mockReset().mockResolvedValue({ ...RISK });
  h.orderFindMany.mockReset().mockResolvedValue(ORDERS.map((order) => ({ ...order })));
  h.orderCount.mockReset().mockImplementation(async (args: { where: { OR?: unknown } }) => (args.where.OR ? 2 : 4));
  h.logError.mockReset();
});

describe("GET /api/inbox/context/[id]: who may use it", () => {
  it("is never statically rendered or cached by the framework", () => {
    expect(route.dynamic).toBe("force-dynamic");
  });

  it("exports GET and nothing else", () => {
    expect(Object.keys(route).sort()).toEqual(["GET", "dynamic"]);
  });

  // The real chain would refuse an action it does not know only by answering "forbidden" for everybody.
  it("grants only permissions that are real catalog actions (an unknown name would make every row below meaningless)", () => {
    for (const action of ALL) expect(PHASE2_ACTIONS as readonly string[], action).toContain(action);
  });

  it("answers 401 TRUSTED_ACTOR_REQUIRED, and reads nothing, before authentication setup is complete", async () => {
    h.getAuthority.mockResolvedValue({ status: "setup" });
    const response = await get();
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "TRUSTED_ACTOR_REQUIRED" });
    expect(h.conversationFind).not.toHaveBeenCalled();
    expectNoCustomerOrOrderRead();
  });

  it("answers 401 IDENTITY_SESSION_BINDING_REQUIRED, and reads nothing, for a session with no durable identity", async () => {
    h.resolveIdentity.mockResolvedValue(null);
    const response = await get();
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "IDENTITY_SESSION_BINDING_REQUIRED" });
    expect(h.conversationFind).not.toHaveBeenCalled();
    expectNoCustomerOrOrderRead();
  });

  it.each([
    ["no permission at all", [] as string[]],
    ["every customer, order and risk permission but not conversations.read", without("conversations.read")],
  ])("answers 403 ACTION_FORBIDDEN, and reads nothing, for a member with %s", async (_label, permissions) => {
    actingWith(permissions);
    const response = await get();
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "ACTION_FORBIDDEN" });
    expect(h.conversationFind).not.toHaveBeenCalled();
    expectNoCustomerOrOrderRead();
  });

  it("answers 403, not 404, to a member without conversations.read who asks for a conversation that does not exist", async () => {
    actingWith([]);
    h.conversationFind.mockResolvedValue(null);
    expect((await get()).status).toBe(403);
  });

  it("checks the session, then reads the conversation, the customer, the risk record and the orders, in that order", async () => {
    await get();
    const order = [h.getAuthority, h.conversationFind, h.customerFindFirst, h.customerFindUnique, h.orderFindMany].map(firstOrder);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  // OBSERVED, not endorsed: the answer holds a customer's name, phone and order history but carries no Cache-Control
  // header. Update the test if the route is changed on purpose.
  it("OBSERVED: sends no Cache-Control header", async () => {
    const response = await get();
    expect(response.headers.get("Cache-Control")).toBeNull();
  });
});

describe("GET /api/inbox/context/[id]: the conversation", () => {
  it("reads the conversation by its id, asking for its id, name and phone and nothing else", async () => {
    await get();
    expect(h.conversationFind).toHaveBeenCalledTimes(1);
    expect(firstArgs(h.conversationFind)).toStrictEqual({
      where: { id: "conv-1" },
      select: { id: true, contactName: true, contactPhone: true },
    });
  });

  it("decodes the id before it reads", async () => {
    await get("a%2Fb%20c");
    expect(firstArgs(h.conversationFind).where).toStrictEqual({ id: "a/b c" });
  });

  // OBSERVED, not endorsed: a malformed percent escape in the id is a URIError, which withErrorHandler does not know,
  // so the caller gets a generic 500 instead of a 400 or 404. Update the test if the route is changed on purpose.
  it("OBSERVED: answers a generic 500, and reads nothing, for an id with a malformed percent escape", async () => {
    const response = await get("%E0%A4%A");
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Internal server error" });
    expect(h.conversationFind).not.toHaveBeenCalled();
    // The 500 is the decode error itself, not some other failure.
    const cause = h.logError.mock.calls.flat().find((arg): arg is Error => arg instanceof Error);
    expect(cause).toBeInstanceOf(URIError);
  });

  it("answers 404 and reads no customer or order when the conversation does not exist", async () => {
    h.conversationFind.mockResolvedValue(null);
    const response = await get();
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Conversation not found" });
    expectNoCustomerOrOrderRead();
  });
});

describe("GET /api/inbox/context/[id]: when there is no customer card to show", () => {
  const EMPTY = { customer: null, recentOrders: [], deliveryRate: null };

  // customer, contact, orders and financials are each true in one row of this table or the next and false in another, so a
  // flag that is hard-wired or read from the wrong action is noticed. risk is false in every row here (it cannot be true
  // without customers.read and customers.contact.read); the phone-less rows and the no-customer rows show it true.
  it.each([
    ["customers.read", without("customers.read"), { customer: false, contact: true, orders: true, financials: true, risk: false }],
    ["customers.contact.read", without("customers.contact.read"), { customer: true, contact: false, orders: true, financials: true, risk: false }],
    [
      "customers.contact.read, orders.read, orders.financials.read and risk.read",
      ["conversations.read", "customers.read"],
      { customer: true, contact: false, orders: false, financials: false, risk: false },
    ],
    [
      "customers.contact.read and orders.financials.read",
      ["conversations.read", "customers.read", "orders.read", "risk.read"],
      { customer: true, contact: false, orders: true, financials: false, risk: false },
    ],
  ])("answers an empty card, and reads no customer or order, without %s", async (_missing, permissions, fieldAccess) => {
    actingWith(permissions);
    const response = await get();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ...EMPTY, fieldAccess });
    expectNoCustomerOrOrderRead();
  });

  it.each([
    ["no phone (null)", null],
    ["an empty phone", ""],
  ])("answers an empty card that says what the member may see, and reads nothing, for a conversation with %s", async (_label, contactPhone) => {
    h.conversationFind.mockResolvedValue({ ...CONVERSATION, contactPhone });
    const response = await get();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ...EMPTY, fieldAccess: FULL_ACCESS });
    expectNoCustomerOrOrderRead();
  });

  it("answers an empty card, and reads no order, when no customer has any of the phone formats", async () => {
    h.customerFindFirst.mockResolvedValue(null);
    const response = await get();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ...EMPTY, fieldAccess: FULL_ACCESS });
    expect(h.customerFindUnique).not.toHaveBeenCalled();
    expect(h.orderFindMany).not.toHaveBeenCalled();
    expect(h.orderCount).not.toHaveBeenCalled();
  });

  it.each([
    [
      "orders but not money or risk",
      ["conversations.read", "customers.read", "customers.contact.read", "orders.read"],
      { customer: true, contact: true, orders: true, financials: false, risk: false },
    ],
    [
      "money and risk but not orders",
      without("orders.read"),
      { customer: true, contact: true, orders: false, financials: true, risk: true },
    ],
  ])("reports the member's own order, money and risk access in an empty card when no customer is found: %s", async (_label, permissions, fieldAccess) => {
    actingWith(permissions);
    h.customerFindFirst.mockResolvedValue(null);
    const response = await get();
    expect((await response.json()).fieldAccess).toEqual(fieldAccess);
  });

  // A phone that is only spaces is truthy, so it passes the check above and then produces no candidate at all.
  it("looks for no customer, and answers an empty card, when the phone is only spaces", async () => {
    h.conversationFind.mockResolvedValue({ ...CONVERSATION, contactPhone: "   " });
    const response = await get();
    expect(await response.json()).toEqual({ ...EMPTY, fieldAccess: FULL_ACCESS });
    expect(h.customerFindFirst).not.toHaveBeenCalled();
  });
});

describe("GET /api/inbox/context/[id]: finding the customer by phone", () => {
  const FOUR = ["0555123456", "213555123456", "+213555123456", "00213555123456"];

  it.each([
    ["a local number", "0555123456", FOUR],
    ["a number written with 9 digits", "555123456", [...FOUR, "555123456"]],
    ["an international number without a plus sign", "213555123456", FOUR],
    ["an international number with a plus sign and spaces", "+213 555 12 34 56", [...FOUR, "+213 555 12 34 56"]],
    ["an international number with 00", "00213555123456", FOUR],
    ["a WhatsApp JID", "213555123456@s.whatsapp.net", [...FOUR, "213555123456@s.whatsapp.net"]],
    // The digits are read from the part before the @ only: the 7 in the domain must not turn this into an 11-digit number.
    ["a number followed by an address with a digit in it", "0555123456@srv7.example", [...FOUR, "0555123456@srv7.example"]],
    ["an international number whose operator digit is 7", "213755123456", ["0755123456", "213755123456", "+213755123456", "00213755123456"]],
    ["an international number with 00 whose operator digit is 7", "00213755123456", ["0755123456", "213755123456", "+213755123456", "00213755123456"]],
    ["a number written with 9 digits and operator digit 7", "755123456", ["0755123456", "213755123456", "+213755123456", "00213755123456", "755123456"]],
    ["a number with spaces around it", "  0655123456  ", ["0655123456", "213655123456", "+213655123456", "00213655123456"]],
    ["a number with dots", "07.55.12.34.56", ["0755123456", "213755123456", "+213755123456", "00213755123456", "07.55.12.34.56"]],
  ])("tries every Algerian format of %s (the written form is also tried, once)", async (_label, contactPhone, expected) => {
    h.conversationFind.mockResolvedValue({ ...CONVERSATION, contactPhone });
    h.customerFindFirst.mockResolvedValue(null);
    await get();
    expect(phonesTried()).toEqual(expected);
  });

  // OBSERVED, not endorsed: these are not recognised as Algerian mobile numbers, so only the text as written is tried.
  // For an LID chat or a JID with a device suffix that can never match a customer stored by phone number (what the
  // conversation really stores for those chats was not checked).
  it.each([
    ["an operator digit of 4", "0455123456"],
    ["an international number with an operator digit of 4", "213455123456"],
    ["an international number with 00 and an operator digit of 4", "00213455123456"],
    ["a 9-digit number with an operator digit of 4", "455123456"],
    ["an operator digit of 8", "0855123456"],
    // An extra digit must not be cut off: each pattern is anchored at the end, so these are not read as a shorter number.
    ["a local number with one digit too many", "05551234567"],
    ["a 00 number with one digit too many", "002135551234567"],
    ["a 9-digit number with one digit too many", "5551234567"],
    ["an international number with one digit too many", "2135551234567"],
    ["letters only", "abc"],
    ["a French mobile number", "+33612345678"],
    ["an LID", "123456789012345@lid"],
    ["a JID with a device suffix", "213555123456:12@s.whatsapp.net"],
  ])("OBSERVED: tries only the text as written for %s", async (_label, contactPhone) => {
    h.conversationFind.mockResolvedValue({ ...CONVERSATION, contactPhone });
    h.customerFindFirst.mockResolvedValue(null);
    await get();
    expect(phonesTried()).toEqual([contactPhone]);
  });

  it("asks for a customer that is not deleted, with the same columns every time", async () => {
    h.customerFindFirst.mockResolvedValue(null);
    await get();
    // The default phone has four formats; a route that made no lookup at all must not pass this test.
    expect(h.customerFindFirst).toHaveBeenCalledTimes(4);
    for (const call of h.customerFindFirst.mock.calls) {
      const args = call[0] as { where: Record<string, unknown>; select: unknown };
      expect(args.where.deletedAt).toBeNull();
      expect(Object.keys(args.where).sort()).toEqual(["deletedAt", "phone"]);
      expect(args.select).toStrictEqual({
        id: true,
        name: true,
        phone: true,
        wilaya: true,
        commune: true,
        orderCount: true,
        totalSpent: true,
      });
    }
  });

  it("stops at the first format that finds a customer, and shows that customer's own phone", async () => {
    h.customerFindFirst.mockImplementation(async (args: { where: { phone: string } }) =>
      args.where.phone === "+213555123456" ? { ...CUSTOMER, phone: "+213 555 12 34 56" } : null,
    );
    const response = await get();
    expect(phonesTried()).toEqual(["0555123456", "213555123456", "+213555123456"]);
    expect((await response.json()).customer.phone).toBe("+213 555 12 34 56");
  });

  it("reads the risk record and the orders of the customer it found, by that customer's id", async () => {
    await get();
    expect(firstArgs(h.customerFindUnique).where).toStrictEqual({ id: "cust-1" });
    expect((firstArgs(h.orderFindMany).where as { customerId: string }).customerId).toBe("cust-1");
    expect(h.orderCount).toHaveBeenCalledTimes(2);
    for (const call of h.orderCount.mock.calls) {
      expect((call[0] as { where: { customerId: string } }).where.customerId).toBe("cust-1");
    }
  });
});

describe("GET /api/inbox/context/[id]: what each permission reveals", () => {
  it("shows everything to a member who holds every permission", async () => {
    const response = await get();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(
      wire({
        customer: {
          id: "cust-1",
          name: "Amine B.",
          phone: "0555123456",
          wilaya: "16",
          commune: "Bab El Oued",
          orderCount: 7,
          totalSpent: 98500,
          riskScore: 42,
          isBlacklisted: true,
          blacklistReason: "refused 3 parcels",
        },
        recentOrders: ORDERS,
        deliveryRate: 50,
        fieldAccess: FULL_ACCESS,
      }),
    );
  });

  it("hides the money, the risk record and its lookup from a member without orders.financials.read", async () => {
    actingWith(without("orders.financials.read"));
    const body = await (await get()).json();
    expect(body.customer.totalSpent).toBeNull();
    expect(body.customer.riskScore).toBeNull();
    expect(body.customer.isBlacklisted).toBeNull();
    expect(body.customer.blacklistReason).toBeNull();
    expect(body.recentOrders).toHaveLength(2);
    expect(body.recentOrders.every((order: { totalPrice: unknown }) => order.totalPrice === null)).toBe(true);
    expect(body.recentOrders.map((order: { orderNumber: string }) => order.orderNumber)).toEqual(["ORD-4", "ORD-3"]);
    expect(body.deliveryRate).toBe(50);
    expect(body.fieldAccess).toEqual({ ...FULL_ACCESS, financials: false, risk: false });
    expect(h.customerFindUnique).not.toHaveBeenCalled();
  });

  it("hides the risk record, and does not read it, from a member without risk.read, but still shows the money", async () => {
    actingWith(without("risk.read"));
    const body = await (await get()).json();
    expect(body.customer.totalSpent).toBe(98500);
    expect(body.customer.riskScore).toBeNull();
    expect(body.customer.isBlacklisted).toBeNull();
    expect(body.customer.blacklistReason).toBeNull();
    expect(body.recentOrders[0].totalPrice).toBe(12000);
    expect(body.fieldAccess).toEqual({ ...FULL_ACCESS, risk: false });
    expect(h.customerFindUnique).not.toHaveBeenCalled();
  });

  it("shows the customer card but no orders, and reads none, to a member without orders.read", async () => {
    actingWith(without("orders.read"));
    const body = await (await get()).json();
    expect(body.customer.name).toBe("Amine B.");
    expect(body.customer.totalSpent).toBe(98500);
    expect(body.customer.riskScore).toBe(42);
    expect(body.recentOrders).toEqual([]);
    expect(body.deliveryRate).toBeNull();
    expect(body.fieldAccess).toEqual({ ...FULL_ACCESS, orders: false });
    expect(h.orderFindMany).not.toHaveBeenCalled();
    expect(h.orderCount).not.toHaveBeenCalled();
  });

  it("shows only the identity of the customer to a member with only the two customer permissions", async () => {
    actingWith(["conversations.read", "customers.read", "customers.contact.read"]);
    const body = await (await get()).json();
    expect(body).toEqual({
      customer: {
        id: "cust-1",
        name: "Amine B.",
        phone: "0555123456",
        wilaya: "16",
        commune: "Bab El Oued",
        orderCount: 7,
        totalSpent: null,
        riskScore: null,
        isBlacklisted: null,
        blacklistReason: null,
      },
      recentOrders: [],
      deliveryRate: null,
      fieldAccess: { customer: true, contact: true, orders: false, financials: false, risk: false },
    });
    expect(h.customerFindUnique).not.toHaveBeenCalled();
    expect(h.orderFindMany).not.toHaveBeenCalled();
  });

  it("still reads the risk record for a member without orders.read (the risk record does not need the orders permission)", async () => {
    actingWith(without("orders.read"));
    await get();
    expect(h.customerFindUnique).toHaveBeenCalledTimes(1);
  });

  // OBSERVED, not endorsed: orderCount is a column of the customer row, so it is shown to a member who holds the two
  // customer permissions but not orders.read, although it is derived from orders. Update the test if the route changes.
  it("OBSERVED: shows the customer's order count to a member without orders.read", async () => {
    actingWith(["conversations.read", "customers.read", "customers.contact.read"]);
    const body = await (await get()).json();
    expect(body.customer.orderCount).toBe(7);
    expect(body.fieldAccess.orders).toBe(false);
    expect(body.recentOrders).toEqual([]);
  });

  it("builds the customer card field by field: extra columns of the row, and a risk score on the row itself, do not leak", async () => {
    actingWith(without("risk.read"));
    h.customerFindFirst.mockResolvedValue({
      ...CUSTOMER,
      email: "amine@example.test",
      address: "12 rue Didouche Mourad",
      riskScore: 99,
      isBlacklisted: true,
      blacklistReason: "from the row",
    });
    const body = await (await get()).json();
    expect(Object.keys(body.customer).sort()).toEqual(
      ["blacklistReason", "commune", "id", "isBlacklisted", "name", "orderCount", "phone", "riskScore", "totalSpent", "wilaya"].sort(),
    );
    expect(body.customer.riskScore).toBeNull();
    expect(body.customer.isBlacklisted).toBeNull();
    expect(body.customer.blacklistReason).toBeNull();
    expect(JSON.stringify(body)).not.toContain("amine@example.test");
    expect(JSON.stringify(body)).not.toContain("Didouche");
  });

  it("keeps a risk score of 0, an isBlacklisted of false and an empty reason as they are, not as null", async () => {
    h.customerFindUnique.mockResolvedValue({ riskScore: 0, isBlacklisted: false, blacklistReason: "" });
    const body = await (await get()).json();
    expect(body.customer.riskScore).toBe(0);
    expect(body.customer.isBlacklisted).toBe(false);
    expect(body.customer.blacklistReason).toBe("");
  });

  it("shows null risk fields when the risk record has disappeared", async () => {
    h.customerFindUnique.mockResolvedValue(null);
    const body = await (await get()).json();
    expect(body.customer.riskScore).toBeNull();
    expect(body.customer.isBlacklisted).toBeNull();
    expect(body.customer.blacklistReason).toBeNull();
    expect(body.fieldAccess.risk).toBe(true);
  });

  it("keeps a total spent of 0 as 0 for a member who may see the money", async () => {
    h.customerFindFirst.mockResolvedValue({ ...CUSTOMER, totalSpent: 0 });
    expect((await (await get()).json()).customer.totalSpent).toBe(0);
  });

  it("asks only for a risk record by the three risk columns", async () => {
    await get();
    expect(firstArgs(h.customerFindUnique).select).toStrictEqual({
      riskScore: true,
      isBlacklisted: true,
      blacklistReason: true,
    });
  });
});

// The preset roles run through the same real chain; the expected answers are written out, not computed from the table.
type Role = "owner" | "manager" | "operator" | "viewer";
type Access = typeof FULL_ACCESS;
const ROLE_CASES: Array<[Role, Access]> = [
  ["owner", FULL_ACCESS],
  ["manager", FULL_ACCESS],
  ["operator", { customer: true, contact: true, orders: true, financials: false, risk: false }],
  ["viewer", { customer: true, contact: false, orders: true, financials: false, risk: false }],
];

describe("GET /api/inbox/context/[id]: the preset roles", () => {
  // OBSERVED, not endorsed: fieldAccess.orders says the member HOLDS orders.read, not that orders came back. The viewer
  // holds orders.read but not customers.contact.read, so it is told orders: true with an empty list and no customer.
  it("OBSERVED: tells a viewer orders: true although no order and no customer are returned", async () => {
    actingAs("viewer");
    const body = await (await get()).json();
    expect(body.fieldAccess.orders).toBe(true);
    expect(body.recentOrders).toEqual([]);
    expect(body.customer).toBeNull();
  });

  it.each(ROLE_CASES)("shows the %s exactly what that role may see", async (role, fieldAccess) => {
    actingAs(role);
    const response = await get();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.fieldAccess).toEqual(fieldAccess);
    expect(body.customer === null).toBe(!fieldAccess.contact);
    if (fieldAccess.contact) {
      expect(body.customer.totalSpent === null).toBe(!fieldAccess.financials);
      expect(body.customer.riskScore === null).toBe(!fieldAccess.risk);
      expect(body.recentOrders).toHaveLength(2);
    } else {
      expect(body.recentOrders).toEqual([]);
      expectNoCustomerOrOrderRead();
    }
  });
});

describe("GET /api/inbox/context/[id]: the orders and the delivery rate", () => {
  it("reads the last four orders, newest first, not deleted, with the listed columns only", async () => {
    await get();
    expect(h.orderFindMany).toHaveBeenCalledTimes(1);
    expect(firstArgs(h.orderFindMany)).toStrictEqual({
      where: { customerId: "cust-1", deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 4,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        source: true,
        totalPrice: true,
        createdAt: true,
        deliveredAt: true,
      },
    });
  });

  it("counts all of the customer's orders that are not deleted, and the delivered ones by status or by delivery date", async () => {
    await get();
    expect(h.orderCount).toHaveBeenCalledTimes(2);
    const wheres = h.orderCount.mock.calls.map((call) => (call[0] as { where: unknown }).where);
    expect(wheres).toContainEqual({ customerId: "cust-1", deletedAt: null });
    expect(wheres).toContainEqual({
      customerId: "cust-1",
      deletedAt: null,
      OR: [{ status: "delivered" }, { deliveredAt: { not: null } }],
    });
  });

  // OBSERVED, not endorsed: the orders are spread as the query returned them, so what is shown is whatever the `select`
  // above lets through (checked by the test before). A column added to the select would reach the browser.
  it("OBSERVED: passes on every field the order query returned", async () => {
    h.orderFindMany.mockResolvedValue([{ ...ORDERS[0], customerNote: "left at the door" }]);
    const body = await (await get()).json();
    expect(body.recentOrders[0].customerNote).toBe("left at the door");
  });

  it.each([
    ["no orders at all", 0, 0, null],
    ["one order, delivered", 1, 1, 100],
    ["one third delivered", 3, 1, 33],
    ["two thirds delivered", 3, 2, 67],
    ["orders but none delivered", 5, 0, 0],
    ["an exact half step rounds up (12.5 becomes 13)", 8, 1, 13],
    ["almost all delivered (99.5 becomes 100)", 200, 199, 100],
    ["three of seven", 7, 3, 43],
  ])("shows the delivery rate for %s (orders: %s, delivered: %s)", async (_label, total, delivered, expected) => {
    h.orderCount.mockImplementation(async (args: { where: { OR?: unknown } }) => (args.where.OR ? delivered : total));
    const body = await (await get()).json();
    expect(body.deliveryRate).toBe(expected);
  });
});

describe("GET /api/inbox/context/[id]: when the database fails", () => {
  it.each([
    ["the conversation lookup", () => h.conversationFind],
    ["the customer lookup", () => h.customerFindFirst],
    ["the risk lookup", () => h.customerFindUnique],
    ["the order list", () => h.orderFindMany],
    ["an order count", () => h.orderCount],
  ])("answers a generic 500 that holds no secret, and no partial card, when %s fails", async (_label, spy) => {
    spy().mockRejectedValue(new Error(`connection refused for password ${SECRET_IN_ERROR}`));
    const response = await get();
    expect(response.status).toBe(500);
    const text = JSON.stringify(await response.json());
    expect(text).toBe(JSON.stringify({ error: "Internal server error" }));
    expect(text).not.toContain(SECRET_IN_ERROR);
  });
});
