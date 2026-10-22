import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// /api/automations (POST create, GET list) and /api/automations/[id] (PATCH change, DELETE remove) are where a seller writes
// the workflows that later message customers and change order status as the system. What matters here: only a member who
// holds automations.manage writes (automations.read lists), before the body is even parsed; a new or changed definition
// passes the seller write policy and the author must hold the grant of every outward effect (conversations.reply for a
// WhatsApp step, orders.update for a status step), while CLOSING a definition (switching it off, deleting it) is never blocked
// by either; a change is merged over the stored row and judged as one whole definition; a soft-deleted row does not exist;
// nothing is written and no audit entry is made when anything refuses; and every change leaves one audit entry with the actor.
//
// Real code under test: the four handlers, withErrorHandler (so each refusal has the real status and body), zod, SahelFlowError,
// the automation contracts (canonicalizeAutomationMutation), the seller write policy and its catalog, the authoring grants, the
// real trusted-actor chain (requireTrustedActor, assertTrustedAction, trustedActorAuditIdentity) and the permission catalog and
// role table. Stand-ins: the session authority and the durable identity lookup (they hand the real chain a role or an explicit
// permission list), requireAuth (a copy of the body of the real function, run over the real chain, so the permission the route
// asks for is recorded and then really judged), the audit writer, the database handle (its calls are inspected and their
// answers are canned: whether a where really filters is NOT tested) and the logger/monitoring hooks withErrorHandler calls (its
// shop-authority and licence hooks only run when NODE_ENV is production, so those two mocks are inert here and the production
// checks that run before the route are NOT tested). A failing audit write is not tested on purpose: the real logAudit swallows
// its own errors. A rejected session beyond the two 401 codes tested below (the other refusals of the trusted-actor chain) is not
// covered. The stand-in requireAuth is a copy of the body of the real function (the action form, src/lib/auth/server.ts): if the
// real one changes this copy does not follow it, and nothing here notices. The seller policy and the catalog have their own tests in
// src/lib/automations/__tests__; the contract bounds (name length, number of steps, wait minutes, retry numbers) are pinned only
// here, through the routes. There is one row per refusal code that can be reached. AUTOMATION_SELLER_TRIGGER_UNAVAILABLE cannot be
// reached today because every trigger in the catalog is seller-ready and the schema refuses an unknown trigger first;
// AUTOMATION_SELLER_RECHECK_STATUS_UNAVAILABLE cannot be reached because a re-check is only allowed on the order.* triggers, which
// accept every status the schema knows, and the other triggers refuse the step as incompatible first. A test below guards both claims.
//
// Several tests say "(observed)": they pin what looks unintended and should be updated if the route changes on purpose. A stored row
// that is not valid JSON makes a PATCH answer "Invalid JSON in request body" although the request is fine; a stored config that is
// not valid JSON blocks a repair that sends steps alone; a PATCH of only `action` is ignored when the row has steps; an edit that
// also sends isActive false is judged as a whole definition instead of switching off; an empty PATCH re-saves the definition; the
// list returns the stored JSON strings unparsed; and the DELETE audit entry holds the whole stored row (steps, conditions, config,
// last error text) while the POST and PATCH entries hold only five fields. The update is read-then-write with no transaction: a
// race is not testable here and has no test.
const h = vi.hoisted(() => ({
  getAuthority: vi.fn(),
  resolveIdentity: vi.fn(),
  requireAuth: vi.fn(),
  logAudit: vi.fn(),
  create: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
  findMany: vi.fn(),
  hardDelete: vi.fn(),
  runGroupBy: vi.fn(),
  runFindMany: vi.fn(),
  runDeleteMany: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({ getCurrentSessionAuthority: h.getAuthority, requireAuth: h.requireAuth }));
// Only resolveDurableIdentityActor is provided: the trusted-actor chain imports one more name from this module, and it is only
// called lazily, so a path that called it at load time would fail here.
vi.mock("@/lib/identity/control-authority", () => ({ resolveDurableIdentityActor: h.resolveIdentity }));
vi.mock("@/lib/audit", () => ({ logAudit: h.logAudit }));
vi.mock("@/lib/db", () => ({
  db: {
    automation: { create: h.create, findUnique: h.findUnique, update: h.update, findMany: h.findMany, delete: h.hardDelete },
    automationRun: { groupBy: h.runGroupBy, findMany: h.runFindMany, deleteMany: h.runDeleteMany },
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

import * as collection from "@/app/api/automations/route";
import * as item from "@/app/api/automations/[id]/route";
import { SELLER_AUTOMATION_TRIGGERS, actionAllowedForTrigger, getSellerRecheckStatuses } from "@/lib/automations/catalog";
import { AUTOMATION_ORDER_CHECK_STATUSES, AUTOMATION_TRIGGERS } from "@/lib/automations/contracts";
import { db, shopContext } from "@/lib/db";
import { assertTrustedAction } from "@/lib/identity/authorization";
import { PHASE2_ACTIONS, getPhase2PresetPermissions, hasPhase2Permission, type Phase2Action } from "@/lib/identity/permissions";
import { requireTrustedActor } from "@/lib/identity/trusted-actor";

const ROLES = ["owner", "manager", "operator", "viewer"] as const;
type Role = (typeof ROLES)[number];
const SECRET_IN_ERROR = "SECRET-DB-PASSWORD-0006";
const IDENTITY = {
  personId: "5".repeat(32),
  workspaceMemberId: "6".repeat(32),
  deviceId: "7".repeat(32),
  policyVersion: 1,
  revocationEpoch: 0,
};
const AUDIT_ACTOR = `person:${"5".repeat(32)}`;
const ID = "auto-1";
const NOT_FOUND = { error: "Automation not found", code: "NOT_FOUND" };

const NOTIFY_STEP = { action: "send_notification", onFailure: "stop", config: { messageTemplate: "Order {{orderNumber}} confirmed" } };
const WHATSAPP_STEP = { action: "send_whatsapp", onFailure: "continue", config: { messageTemplate: "Hello, your order {{orderNumber}} is confirmed" } };
const TAG_STEP = { action: "tag_customer", onFailure: "stop", config: { noteText: "Confirmed buyer" } };
const WAIT_STEP = { action: "wait", onFailure: "stop", config: { delayMinutes: 30 } };
const RECHECK_STEP = { action: "recheck_order_status", onFailure: "stop", config: { expectedStatus: "confirmed" } };
const STATUS_STEP = { action: "update_status", onFailure: "stop", config: { targetStatus: "shipped" } };
const CONDITIONS = { all: [{ field: "wilaya", operator: "equal", value: "Alger" }] };

/** The smallest body a seller sends: a single action and its config. */
function single(over: Record<string, unknown> = {}): Record<string, unknown> {
  return { name: "Confirmed order alert", trigger: "order.confirmed", action: "send_notification", config: NOTIFY_STEP.config, ...over };
}

/** A row as the database holds it. */
function stored(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: ID,
    name: "Confirmed order alert",
    trigger: "order.confirmed",
    action: "send_notification",
    isActive: true,
    dryRun: false,
    conditions: null,
    steps: JSON.stringify([NOTIFY_STEP]),
    config: JSON.stringify(NOTIFY_STEP.config),
    maxRetries: 2,
    retryDelayMs: 500,
    retryCount: 1,
    lastError: "an old error",
    nextRunAt: new Date("2026-10-22T10:00:00.000Z"),
    runCount: 5,
    deletedAt: null,
    createdAt: new Date("2026-10-01T08:00:00.000Z"),
    updatedAt: new Date("2026-10-02T08:00:00.000Z"),
    ...over,
  };
}

/** What the browser receives: Dates become text, undefined keys disappear. */
function wire<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value));
}

/** A copy of the body of the real requireAuth(actions), over the real trusted-actor chain. */
async function requireAuthLikeTheRealOne(required: string | readonly string[]) {
  const context = await requireTrustedActor();
  const actions = typeof required === "string" ? [required] : required;
  for (const action of actions) {
    assertTrustedAction(context, action as Phase2Action, { shopId: context.shop.shopId });
  }
  return context;
}

function actingWith(permissions: readonly string[]): void {
  // The manager preset's ceiling holds every permission used here, so each list is a legal custom policy for it.
  h.resolveIdentity.mockResolvedValue({ ...IDENTITY, role: "manager", permissions });
}

function actingAs(role: Role): void {
  h.resolveIdentity.mockResolvedValue({ ...IDENTITY, role, permissions: null });
}

function jsonRequest(method: string, body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/automations", {
    method,
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function create(body: unknown) {
  return collection.POST(jsonRequest("POST", body));
}

function patch(body: unknown, id: string = ID) {
  return item.PATCH(jsonRequest("PATCH", body), { params: Promise.resolve({ id }) });
}

function remove(id: string = ID) {
  return item.DELETE(new NextRequest("http://localhost/api/automations/x", { method: "DELETE" }), { params: Promise.resolve({ id }) });
}

async function bodyOf(response: Response) {
  return (await response.json()) as Record<string, unknown>;
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

function createdData(): Record<string, unknown> {
  return (firstCall(h.create)[0] as { data: Record<string, unknown> }).data;
}

function updatedData(): Record<string, unknown> {
  return (firstCall(h.update)[0] as { data: Record<string, unknown> }).data;
}

function auditEntry(): Record<string, unknown> {
  return firstCall(h.logAudit)[1] as Record<string, unknown>;
}

function parsed(text: unknown): unknown {
  expect(typeof text).toBe("string");
  return JSON.parse(text as string);
}

function expectNothingWritten(): void {
  expect(h.create).not.toHaveBeenCalled();
  expect(h.update).not.toHaveBeenCalled();
  expect(h.hardDelete).not.toHaveBeenCalled();
  expect(h.logAudit).not.toHaveBeenCalled();
}

function expectNoDatabaseCall(): void {
  expectNothingWritten();
  for (const spy of [h.findUnique, h.findMany, h.runGroupBy, h.runFindMany, h.runDeleteMany]) expect(spy).not.toHaveBeenCalled();
}

beforeEach(() => {
  h.getAuthority.mockReset().mockResolvedValue({ status: "authenticated", sessionId: "automations-session" });
  h.requireAuth.mockReset().mockImplementation(requireAuthLikeTheRealOne);
  h.resolveIdentity.mockReset();
  actingAs("manager");
  h.logAudit.mockReset().mockResolvedValue(undefined);
  h.create.mockReset().mockImplementation(async (args: { data: Record<string, unknown> }) => ({
    id: "auto-new",
    ...args.data,
    createdAt: new Date("2026-10-22T09:00:00.000Z"),
    updatedAt: new Date("2026-10-22T09:00:00.000Z"),
  }));
  h.findUnique.mockReset().mockResolvedValue(stored());
  h.update.mockReset().mockImplementation(async (args: { where: { id: string }; data: Record<string, unknown> }) => ({
    ...stored(),
    ...args.data,
    id: args.where.id,
  }));
  h.findMany.mockReset().mockResolvedValue([]);
  h.hardDelete.mockReset();
  h.runGroupBy.mockReset().mockResolvedValue([]);
  h.runFindMany.mockReset().mockResolvedValue([]);
  h.runDeleteMany.mockReset();
  h.logError.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("who may use /api/automations", () => {
  it("exports exactly POST and GET on the collection and PATCH and DELETE on one definition (a new export, such as a route segment option, is then a deliberate decision)", () => {
    expect(Object.keys(collection).sort()).toEqual(["GET", "POST"]);
    expect(Object.keys(item).sort()).toEqual(["DELETE", "PATCH"]);
  });

  it("asks for automations.manage to write and automations.read to list, and both are real permissions", async () => {
    await create(single());
    await patch({ name: "x" });
    await remove();
    await collection.GET();
    const asked = h.requireAuth.mock.calls.map((call) => call[0]);
    expect(asked).toEqual(["automations.manage", "automations.manage", "automations.manage", "automations.read"]);
    for (const action of asked) expect(PHASE2_ACTIONS as readonly string[], String(action)).toContain(action);
  });

  it("is held, in the real role table, by the owner and manager to write and also by the operator to list", () => {
    const holders = (action: Phase2Action) => ROLES.filter((role) => hasPhase2Permission(getPhase2PresetPermissions(role), action));
    expect(holders("automations.manage")).toEqual(["owner", "manager"]);
    expect(holders("automations.read")).toEqual(["owner", "manager", "operator"]);
    // The two grants an outward effect needs: held by the owner, manager and operator, so a definition that uses them is not narrower than the roles that write.
    expect(holders("conversations.reply")).toEqual(["owner", "manager", "operator"]);
    expect(holders("orders.update")).toEqual(["owner", "manager", "operator"]);
  });

  it.each([
    ["owner", 201],
    ["manager", 201],
    ["operator", 403],
    ["viewer", 403],
  ] as Array<[Role, number]>)("POST: a %s gets %i", async (role, status) => {
    actingAs(role);
    const response = await create(single());
    expect(response.status).toBe(status);
    expect(h.create).toHaveBeenCalledTimes(status === 201 ? 1 : 0);
  });

  it.each([
    ["owner", 200],
    ["manager", 200],
    ["operator", 403],
    ["viewer", 403],
  ] as Array<[Role, number]>)("PATCH and DELETE: a %s gets %i", async (role, status) => {
    actingAs(role);
    expect((await patch({ name: "New name" })).status).toBe(status);
    expect((await remove()).status).toBe(status);
    expect(h.update).toHaveBeenCalledTimes(status === 200 ? 2 : 0);
  });

  it.each([
    ["owner", 200],
    ["manager", 200],
    ["operator", 200],
    ["viewer", 403],
  ] as Array<[Role, number]>)("GET: a %s gets %i", async (role, status) => {
    actingAs(role);
    expect((await collection.GET()).status).toBe(status);
    expect(h.findMany).toHaveBeenCalledTimes(status === 200 ? 1 : 0);
  });

  it("answers 403 ACTION_FORBIDDEN before the body is parsed: a broken body from a viewer is a 403, not a 400, on both writes that take a body", async () => {
    actingAs("viewer");
    for (const response of [
      await collection.POST(jsonRequest("POST", "{ not json")),
      await item.PATCH(jsonRequest("PATCH", "{ not json"), { params: Promise.resolve({ id: ID }) }),
    ]) {
      expect(response.status).toBe(403);
      expect(await bodyOf(response)).toEqual({ error: "The current member is not authorized to perform automations.manage", code: "ACTION_FORBIDDEN" });
    }
    expectNoDatabaseCall();
  });

  it("answers 403 before the stored row is looked up, so a viewer cannot tell a missing automation from an existing one", async () => {
    actingAs("viewer");
    h.findUnique.mockResolvedValue(null);
    expect((await patch({ name: "x" })).status).toBe(403);
    expect((await remove()).status).toBe(403);
    expectNoDatabaseCall();
  });

  it("answers 401 TRUSTED_ACTOR_REQUIRED before authentication setup is complete, on every handler, and reads nothing", async () => {
    h.getAuthority.mockResolvedValue({ status: "setup" });
    for (const response of [await create(single()), await patch({ name: "x" }), await remove(), await collection.GET()]) {
      expect(response.status).toBe(401);
      expect(await bodyOf(response)).toMatchObject({ code: "TRUSTED_ACTOR_REQUIRED" });
    }
    expectNoDatabaseCall();
  });

  it("answers 401 IDENTITY_SESSION_BINDING_REQUIRED for a session with no durable identity", async () => {
    h.resolveIdentity.mockResolvedValue(null);
    const response = await create(single());
    expect(response.status).toBe(401);
    expect(await bodyOf(response)).toMatchObject({ code: "IDENTITY_SESSION_BINDING_REQUIRED" });
    expectNoDatabaseCall();
  });
});

describe("POST /api/automations: what is stored", () => {
  it("creates a single-action definition with every column set, the defaults filled in and one step with onFailure stop, and answers 201 { automation }", async () => {
    const response = await create(single({ name: "  Confirmed order alert  " }));
    expect(response.status).toBe(201);
    expect(h.create).toHaveBeenCalledTimes(1);
    const args = firstCall(h.create)[0] as { data: Record<string, unknown> };
    expect(Object.keys(args)).toEqual(["data"]);
    const data = createdData();
    expect(Object.keys(data).sort()).toEqual(
      ["action", "conditions", "config", "dryRun", "isActive", "lastError", "maxRetries", "name", "nextRunAt", "retryCount", "retryDelayMs", "runCount", "steps", "trigger"],
    );
    expect(data).toMatchObject({
      name: "Confirmed order alert",
      trigger: "order.confirmed",
      action: "send_notification",
      isActive: true,
      dryRun: false,
      conditions: null,
      maxRetries: 2,
      retryDelayMs: 500,
      retryCount: 0,
      lastError: null,
      nextRunAt: null,
      runCount: 0,
    });
    expect(parsed(data.steps)).toEqual([NOTIFY_STEP]);
    expect(parsed(data.config)).toEqual(NOTIFY_STEP.config);
    const body = await bodyOf(response);
    expect(Object.keys(body)).toEqual(["automation"]);
    expect(body.automation).toMatchObject({ id: "auto-new", name: "Confirmed order alert", trigger: "order.confirmed" });
    expect(response.headers.get("X-SahelFlow-Shop-Id")).toBe("shop-a");
  });

  it("stores the steps a seller gave, in order, and takes the action and config columns from the FIRST step, whatever action the body said", async () => {
    const response = await create(single({ action: "send_notification", steps: [WAIT_STEP, WHATSAPP_STEP, NOTIFY_STEP], config: undefined }));
    expect(response.status).toBe(201);
    const data = createdData();
    expect(parsed(data.steps)).toEqual([WAIT_STEP, WHATSAPP_STEP, NOTIFY_STEP]);
    expect(data.action).toBe("wait");
    expect(parsed(data.config)).toEqual(WAIT_STEP.config);
  });

  it("carries a switched-off, dry-run definition with its own retry numbers and its conditions as JSON text", async () => {
    await create(single({ isActive: false, dryRun: true, maxRetries: 5, retryDelayMs: 2500, conditions: CONDITIONS }));
    const data = createdData();
    expect(data).toMatchObject({ isActive: false, dryRun: true, maxRetries: 5, retryDelayMs: 2500 });
    expect(parsed(data.conditions)).toEqual(CONDITIONS);
  });

  it("accepts a group of conditions written with any", async () => {
    const any = { any: [{ field: "totalPrice", operator: "greater_than", value: 5000 }, { field: "wilaya", operator: "in", value: ["Alger", "Oran"] }] };
    const response = await create(single({ conditions: any }));
    expect(response.status).toBe(201);
    expect(parsed(createdData().conditions)).toEqual(any);
  });

  it("answers 400 REQUEST_VALIDATION_FAILED for a body that is not a valid definition, and writes nothing", async () => {
    const response = await create(single({ name: "   " }));
    expect(response.status).toBe(400);
    expect(await bodyOf(response)).toMatchObject({ error: "Validation failed", code: "REQUEST_VALIDATION_FAILED" });
    expectNothingWritten();
  });

  it("answers 400 INVALID_REQUEST_JSON for a body that is not JSON, and writes nothing", async () => {
    const response = await create("{ not json");
    expect(response.status).toBe(400);
    expect(await bodyOf(response)).toEqual({ error: "Invalid JSON in request body", code: "INVALID_REQUEST_JSON" });
    expectNothingWritten();
  });

  it.each([
    ["an empty name", single({ name: "" })],
    ["a name of only spaces", single({ name: "   " })],
    ["a 121-character name", single({ name: "n".repeat(121) })],
    ["no name", { trigger: "order.confirmed", action: "send_notification", config: NOTIFY_STEP.config }],
    ["an unknown trigger", single({ trigger: "order.exploded" })],
    ["an unknown action", single({ action: "format_disk" })],
    ["a field the contract does not know", single({ owner: "me" })],
    ["maxRetries 9", single({ maxRetries: 9 })],
    ["maxRetries -1", single({ maxRetries: -1 })],
    ["maxRetries 1.5", single({ maxRetries: 1.5 })],
    ["retryDelayMs 99", single({ retryDelayMs: 99 })],
    ["retryDelayMs 300001", single({ retryDelayMs: 300_001 })],
    ["an empty list of steps", single({ steps: [] })],
    ["21 steps", single({ steps: Array.from({ length: 21 }, () => NOTIFY_STEP) })],
    ["a step with an unknown field", single({ steps: [{ ...NOTIFY_STEP, extra: 1 }] })],
    ["a step with no onFailure", single({ steps: [{ action: "send_notification", config: NOTIFY_STEP.config }] })],
    ["a config with an unknown field", single({ config: { messageTemplate: "hi", extra: 1 } })],
    ["an empty message", single({ config: { messageTemplate: "  " } })],
    ["a 1001-character notification", single({ config: { messageTemplate: "m".repeat(1001) } })],
    ["a wait of 0 minutes", single({ action: "wait", config: { delayMinutes: 0 } })],
    ["a wait of 10081 minutes", single({ action: "wait", config: { delayMinutes: 10_081 } })],
    ["an empty group of conditions", single({ conditions: { all: [] } })],
    ["a group with both all and any", single({ conditions: { all: CONDITIONS.all, any: CONDITIONS.all } })],
    ["a condition field with a space", single({ conditions: { all: [{ field: "wi laya", operator: "equal", value: "x" }] } })],
    ["a body that is a list", [single()]],
    ["a body that is null", null],
    ["isActive as text", single({ isActive: "yes" })],
  ])("answers 400 REQUEST_VALIDATION_FAILED for %s, and writes nothing", async (_label, body) => {
    const response = await create(body);
    expect(response.status).toBe(400);
    expect(await bodyOf(response)).toMatchObject({ code: "REQUEST_VALIDATION_FAILED" });
    expectNothingWritten();
  });

  it.each([
    ["a 120-character name", single({ name: "n".repeat(120) })],
    ["maxRetries 0", single({ maxRetries: 0 })],
    ["maxRetries 8", single({ maxRetries: 8 })],
    ["retryDelayMs 100", single({ retryDelayMs: 100 })],
    ["retryDelayMs 300000", single({ retryDelayMs: 300_000 })],
    ["20 steps", single({ steps: Array.from({ length: 20 }, () => NOTIFY_STEP) })],
    ["a wait of 1 minute", single({ action: "wait", config: { delayMinutes: 1 } })],
    ["a wait of 10080 minutes", single({ action: "wait", config: { delayMinutes: 10_080 } })],
    ["a 1000-character notification", single({ config: { messageTemplate: "m".repeat(1000) } })],
  ])("accepts %s", async (_label, body) => {
    expect((await create(body)).status).toBe(201);
  });

  type Check = (data: Record<string, unknown>) => void;
  const STORED_AS_GIVEN: Array<[string, Record<string, unknown>, Check]> = [
    ["maxRetries 0", single({ maxRetries: 0 }), (data) => expect(data.maxRetries).toBe(0)],
    ["maxRetries 8", single({ maxRetries: 8 }), (data) => expect(data.maxRetries).toBe(8)],
    ["retryDelayMs 100", single({ retryDelayMs: 100 }), (data) => expect(data.retryDelayMs).toBe(100)],
    ["retryDelayMs 300000", single({ retryDelayMs: 300_000 }), (data) => expect(data.retryDelayMs).toBe(300_000)],
    ["20 steps", single({ steps: Array.from({ length: 20 }, () => NOTIFY_STEP) }), (data) => expect(parsed(data.steps) as unknown[]).toHaveLength(20)],
    ["a wait of 1 minute", single({ action: "wait", config: { delayMinutes: 1 } }), (data) => expect(parsed(data.config)).toEqual({ delayMinutes: 1 })],
    ["a wait of 10080 minutes", single({ action: "wait", config: { delayMinutes: 10_080 } }), (data) => expect(parsed(data.config)).toEqual({ delayMinutes: 10_080 })],
    ["a 120-character name", single({ name: "n".repeat(120) }), (data) => expect(data.name).toBe("n".repeat(120))],
    ["a 1000-character notification", single({ config: { messageTemplate: "m".repeat(1000) } }), (data) => expect((parsed(data.config) as { messageTemplate: string }).messageTemplate).toHaveLength(1000)],
  ];

  it.each(STORED_AS_GIVEN)("stores %s exactly as given, not clamped or defaulted", async (_label, body, check) => {
    expect((await create(body)).status).toBe(201);
    check(createdData());
  });

  it("ignores the config of the body when the body gives steps: the config column follows the first step", async () => {
    const response = await create(single({ steps: [TAG_STEP, NOTIFY_STEP], config: { messageTemplate: "ignored" } }));
    expect(response.status).toBe(201);
    expect(parsed(createdData().config)).toEqual(TAG_STEP.config);
    expect(JSON.stringify(createdData())).not.toContain("ignored");
  });
});

describe("POST /api/automations: the seller write policy", () => {
  it.each([
    [
      "an action the trigger cannot use",
      single({ trigger: "message.received", action: "send_whatsapp", config: { messageTemplate: "hi" } }),
      "AUTOMATION_SELLER_ACTION_INCOMPATIBLE",
      "Automation action 'send_whatsapp' is not compatible with trigger 'message.received'",
    ],
    [
      "two status changes",
      single({ action: "update_status", config: undefined, steps: [STATUS_STEP, { ...STATUS_STEP, config: { targetStatus: "cancelled" } }] }),
      "AUTOMATION_SELLER_MULTIPLE_STATUS_MUTATIONS",
      "Seller automations may contain only one order status mutation",
    ],
    [
      "a status change after a wait with no live re-check",
      single({ action: "wait", config: undefined, steps: [WAIT_STEP, STATUS_STEP] }),
      "AUTOMATION_SELLER_STATUS_RECHECK_REQUIRED_AFTER_WAIT",
      "A delayed order status change requires a live order-status check after the last wait",
    ],
    [
      "a status the order cannot reach from that trigger",
      single({ action: "update_status", config: { targetStatus: "delivered" } }),
      "AUTOMATION_SELLER_STATUS_TARGET_UNREACHABLE",
      "Order status 'delivered' is not reachable from trigger 'order.confirmed'",
    ],
    [
      "a template variable the trigger does not carry",
      single({ config: { messageTemplate: "Hello {{customerName}}" } }),
      "AUTOMATION_SELLER_TEMPLATE_VARIABLE_UNAVAILABLE",
      "Template variable 'customerName' is not available on trigger 'order.confirmed'",
    ],
    [
      "a template with spaces inside the braces",
      single({ config: { messageTemplate: "Order {{ orderNumber }}" } }),
      "AUTOMATION_SELLER_TEMPLATE_SYNTAX_INVALID",
      "Automation template contains malformed placeholder syntax",
    ],
    [
      "a condition on a field the trigger does not carry",
      single({ conditions: { all: [{ field: "productName", operator: "equal", value: "Shoes" }] } }),
      "AUTOMATION_SELLER_CONDITION_FIELD_UNAVAILABLE",
      "Condition field 'productName' is not available on trigger 'order.confirmed'",
    ],
    [
      "an operator the field does not take",
      single({ conditions: { all: [{ field: "totalPrice", operator: "contains", value: "5" }] } }),
      "AUTOMATION_SELLER_CONDITION_OPERATOR_INVALID",
      "Condition operator 'contains' is not valid for field 'totalPrice'",
    ],
    [
      "a text value for a number field",
      single({ conditions: { all: [{ field: "totalPrice", operator: "equal", value: "abc" }] } }),
      "AUTOMATION_SELLER_CONDITION_VALUE_INVALID",
      "Condition value for 'totalPrice' does not match the selected operator and field type",
    ],
    [
      "an empty list for in",
      single({ conditions: { all: [{ field: "wilaya", operator: "in", value: [] }] } }),
      "AUTOMATION_SELLER_CONDITION_VALUE_INVALID",
      "Condition value for 'wilaya' does not match the selected operator and field type",
    ],
  ])("answers 400 with the policy's own code for %s, and writes nothing", async (_label, body, code, message) => {
    const response = await create(body);
    expect(response.status).toBe(400);
    expect(await bodyOf(response)).toEqual({ error: message, code });
    expectNothingWritten();
  });

  it("creates the same status change when the target is reachable, so the refusal above is the policy and not the schema", async () => {
    expect((await create(single({ action: "update_status", config: { targetStatus: "shipped" } }))).status).toBe(201);
  });

  it("accepts a status change after a wait once a live re-check sits in between", async () => {
    const response = await create(single({ action: "wait", config: undefined, steps: [WAIT_STEP, RECHECK_STEP, STATUS_STEP] }));
    expect(response.status).toBe(201);
    expect((parsed(createdData().steps) as Array<{ action: string }>).map((step) => step.action)).toEqual(["wait", "recheck_order_status", "update_status"]);
  });
});

describe("the two policy codes these routes cannot reach (a guard for the claim in the header)", () => {
  it("keeps every trigger of the catalog seller-ready and equal to the triggers the schema accepts", () => {
    expect(SELLER_AUTOMATION_TRIGGERS.map((trigger) => trigger.value).sort()).toEqual([...AUTOMATION_TRIGGERS].sort());
    expect(SELLER_AUTOMATION_TRIGGERS.every((trigger) => trigger.sellerReady)).toBe(true);
  });

  it("allows a re-check only on the order.* triggers, and lets those accept every status the schema knows", () => {
    for (const trigger of AUTOMATION_TRIGGERS) {
      const isOrder = trigger.startsWith("order.");
      // A re-check is allowed on exactly the seven order.* triggers (customer.blacklisted, message.received and stock.low refuse it).
      expect(actionAllowedForTrigger(trigger, "recheck_order_status"), trigger).toBe(isOrder);
      if (isOrder) expect([...getSellerRecheckStatuses(trigger)].sort(), trigger).toEqual([...AUTOMATION_ORDER_CHECK_STATUSES].sort());
      else expect(getSellerRecheckStatuses(trigger), trigger).toEqual([]);
    }
    expect(AUTOMATION_TRIGGERS.filter((trigger) => actionAllowedForTrigger(trigger, "recheck_order_status")).every((trigger) => trigger.startsWith("order."))).toBe(true);
  });
});

describe("POST /api/automations: the author's own grants (INT-05)", () => {
  const ONLY_MANAGE = ["automations.manage"];

  it.each([
    ["a WhatsApp message", single({ action: "send_whatsapp", config: WHATSAPP_STEP.config }), "conversations.reply"],
    ["an order status change", single({ action: "update_status", config: { targetStatus: "shipped" } }), "orders.update"],
  ])("answers 403 ACTION_FORBIDDEN naming the missing grant for %s, to a member who may only manage automations, and writes nothing", async (_label, body, grant) => {
    actingWith(ONLY_MANAGE);
    const response = await create(body);
    expect(response.status).toBe(403);
    expect(await bodyOf(response)).toEqual({ error: `The current member is not authorized to perform ${grant}`, code: "ACTION_FORBIDDEN" });
    expectNothingWritten();
  });

  it.each([
    ["a WhatsApp message", single({ action: "send_whatsapp", config: WHATSAPP_STEP.config }), ["automations.manage", "conversations.reply"]],
    ["an order status change", single({ action: "update_status", config: { targetStatus: "shipped" } }), ["automations.manage", "orders.update"]],
  ])("accepts %s once the author holds the matching grant", async (_label, body, permissions) => {
    actingWith(permissions);
    expect((await create(body)).status).toBe(201);
  });

  it("still refuses a WhatsApp message when the author holds only the status grant, and a status change when the author holds only the reply grant", async () => {
    actingWith(["automations.manage", "orders.update"]);
    expect(await bodyOf(await create(single({ action: "send_whatsapp", config: WHATSAPP_STEP.config })))).toMatchObject({ code: "ACTION_FORBIDDEN" });
    actingWith(["automations.manage", "conversations.reply"]);
    expect(await bodyOf(await create(single({ action: "update_status", config: { targetStatus: "shipped" } })))).toMatchObject({ code: "ACTION_FORBIDDEN" });
    expect(h.create).not.toHaveBeenCalled();
  });

  it("names the first missing grant in the order of the steps", async () => {
    actingWith(ONLY_MANAGE);
    const replyFirst = await create(single({ action: "send_whatsapp", config: undefined, steps: [WHATSAPP_STEP, STATUS_STEP] }));
    expect((await bodyOf(replyFirst)).error).toContain("conversations.reply");
    const statusFirst = await create(single({ action: "update_status", config: undefined, steps: [STATUS_STEP, WHATSAPP_STEP] }));
    expect((await bodyOf(statusFirst)).error).toContain("orders.update");
  });

  it("asks for nothing extra for the steps with no outward effect: a notification, a note, a wait and a re-check", async () => {
    actingWith(ONLY_MANAGE);
    const response = await create(single({ action: "send_notification", config: undefined, steps: [NOTIFY_STEP, TAG_STEP, WAIT_STEP, RECHECK_STEP] }));
    expect(response.status).toBe(201);
  });

  it("accepts a definition with both outward effects from an author who holds both grants, and from the owner and the manager preset", async () => {
    const both = single({ action: "send_whatsapp", config: undefined, steps: [WHATSAPP_STEP, STATUS_STEP] });
    actingWith(["automations.manage", "conversations.reply", "orders.update"]);
    expect((await create(both)).status).toBe(201);
    actingAs("owner");
    expect((await create(both)).status).toBe(201);
    actingAs("manager");
    expect((await create(both)).status).toBe(201);
  });

  it("judges the policy before the grants: an incompatible definition from a member without the grant is a 400, not a 403", async () => {
    actingWith(ONLY_MANAGE);
    const response = await create(single({ trigger: "message.received", action: "send_whatsapp", config: { messageTemplate: "hi" } }));
    expect(response.status).toBe(400);
    expect(await bodyOf(response)).toMatchObject({ code: "AUTOMATION_SELLER_ACTION_INCOMPATIBLE" });
  });
});

describe("POST /api/automations: the audit entry and failures", () => {
  it("writes one automation.created entry after the row, with the actor, the shop's own handle and context, and the values of the row that was stored", async () => {
    h.create.mockResolvedValue({ id: "auto-77", name: "Stored name", trigger: "order.shipped", action: "wait", isActive: false, dryRun: true });
    await create(single());
    expect(h.logAudit).toHaveBeenCalledTimes(1);
    const [context, entry] = firstCall(h.logAudit) as [{ prisma: unknown; shop: unknown }, Record<string, unknown>];
    expect(context.prisma).toBe(db);
    expect(context.shop).toBe(shopContext);
    expect(entry).toEqual({
      action: "automation.created",
      entity: "automation",
      entityId: "auto-77",
      actor: AUDIT_ACTOR,
      after: { name: "Stored name", trigger: "order.shipped", action: "wait", isActive: false, dryRun: true },
    });
    expect(Object.keys(entry)).not.toContain("before");
    expect(firstOrder(h.create)).toBeLessThan(firstOrder(h.logAudit));
  });

  it("holds no step text, condition or config in the audit entry", async () => {
    await create(single({ conditions: CONDITIONS }));
    const text = JSON.stringify(auditEntry());
    for (const forbidden of ["Order {{orderNumber}}", "Alger", "messageTemplate", "retryDelayMs"]) expect(text).not.toContain(forbidden);
  });

  it("answers a generic 500 that holds no secret, and writes no audit entry, when the database fails", async () => {
    h.create.mockRejectedValue(new Error(`connection refused for password ${SECRET_IN_ERROR}`));
    const response = await create(single());
    expect(response.status).toBe(500);
    const text = JSON.stringify(await response.json());
    expect(text).toBe(JSON.stringify({ error: "Internal server error" }));
    expect(text).not.toContain(SECRET_IN_ERROR);
    expect(h.logError).toHaveBeenCalledTimes(1);
    expect(h.logAudit).not.toHaveBeenCalled();
  });
});

describe("GET /api/automations", () => {
  const A1 = stored({ id: "a1", name: "First" });
  const A2 = stored({ id: "a2", name: "Second" });
  const A3 = stored({ id: "a3", name: "Third" });
  const T1 = new Date("2026-10-21T10:00:00.000Z");
  const T2 = new Date("2026-10-20T10:00:00.000Z");
  const runRow = (id: string, automationId: string, createdAt: Date) => ({
    id,
    automationId,
    status: "succeeded",
    succeededStepCount: 2,
    failedStepCount: 0,
    skippedStepCount: 1,
    stepCount: 3,
    lastErrorCode: null,
    createdAt,
    completedAt: createdAt,
  });

  it("lists the definitions that are not soft-deleted, newest first", async () => {
    await collection.GET();
    expect(h.findMany).toHaveBeenCalledTimes(1);
    expect(firstCall(h.findMany)[0]).toEqual({ where: { deletedAt: null }, orderBy: { createdAt: "desc" } });
  });

  it("answers 200 { automations: [] } for none, and does not touch the run history at all", async () => {
    const response = await collection.GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ automations: [] });
    expect(h.runGroupBy).not.toHaveBeenCalled();
    expect(h.runFindMany).not.toHaveBeenCalled();
    expect(response.headers.get("X-SahelFlow-Shop-Id")).toBe("shop-a");
  });

  it("asks the run history for the newest run time of the listed definitions only, in one grouped query", async () => {
    h.findMany.mockResolvedValue([A1, A2]);
    await collection.GET();
    expect(h.runGroupBy).toHaveBeenCalledTimes(1);
    expect(firstCall(h.runGroupBy)[0]).toEqual({ by: ["automationId"], where: { automationId: { in: ["a1", "a2"] } }, _max: { createdAt: true } });
  });

  it("does not fetch run rows, and gives every definition latestRun null, when none has ever run", async () => {
    h.findMany.mockResolvedValue([A1, A2]);
    const response = await collection.GET();
    expect(h.runFindMany).not.toHaveBeenCalled();
    const { automations } = (await response.json()) as { automations: Array<Record<string, unknown>> };
    expect(automations.map((entry) => entry.latestRun)).toEqual([null, null]);
  });

  it("fetches only the newest run of each definition that has one, with the ten fields the screen shows, newest first", async () => {
    h.findMany.mockResolvedValue([A1, A2, A3]);
    h.runGroupBy.mockResolvedValue([
      { automationId: "a1", _max: { createdAt: T1 } },
      { automationId: "a2", _max: { createdAt: T2 } },
    ]);
    await collection.GET();
    expect(h.runFindMany).toHaveBeenCalledTimes(1);
    expect(firstCall(h.runFindMany)[0]).toEqual({
      where: {
        OR: [
          { automationId: "a1", createdAt: T1 },
          { automationId: "a2", createdAt: T2 },
        ],
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        automationId: true,
        status: true,
        succeededStepCount: true,
        failedStepCount: true,
        skippedStepCount: true,
        stepCount: true,
        lastErrorCode: true,
        createdAt: true,
        completedAt: true,
      },
    });
  });

  it("matches a group with no newest time at the epoch rather than failing", async () => {
    h.findMany.mockResolvedValue([A1]);
    h.runGroupBy.mockResolvedValue([{ automationId: "a1", _max: { createdAt: null } }]);
    await collection.GET();
    const where = (firstCall(h.runFindMany)[0] as { where: { OR: Array<{ createdAt: Date }> } }).where;
    expect(where.OR[0]?.createdAt).toEqual(new Date(0));
  });

  it("attaches each definition's own newest run, keeps the first when two share a time, and gives null to one that never ran", async () => {
    h.findMany.mockResolvedValue([A1, A2, A3]);
    h.runGroupBy.mockResolvedValue([
      { automationId: "a1", _max: { createdAt: T1 } },
      { automationId: "a2", _max: { createdAt: T2 } },
    ]);
    h.runFindMany.mockResolvedValue([runRow("run-1b", "a1", T1), runRow("run-1a", "a1", T1), runRow("run-2", "a2", T2)]);
    const response = await collection.GET();
    expect(response.status).toBe(200);
    const { automations } = (await response.json()) as { automations: Array<{ id: string; latestRun: { id: string } | null }> };
    expect(automations.map((entry) => [entry.id, entry.latestRun?.id ?? null])).toEqual([
      ["a1", "run-1b"],
      ["a2", "run-2"],
      ["a3", null],
    ]);
    // The whole selected row is passed on, not a subset of it.
    expect(automations[0]?.latestRun).toEqual(wire(runRow("run-1b", "a1", T1)));
    expect(automations[1]?.latestRun).toEqual(wire(runRow("run-2", "a2", T2)));
  });

  // OBSERVED, not endorsed: the stored JSON columns (steps, conditions, config) go to the browser as the text they are stored
  // as, not as parsed values, and every column of the row is sent (retry counters, last error text, nextRunAt, deletedAt).
  it("sends every column of the row through, the stored JSON as text, with latestRun added (observed)", async () => {
    const row = stored({ id: "a1", conditions: JSON.stringify(CONDITIONS) });
    h.findMany.mockResolvedValue([row]);
    const response = await collection.GET();
    const { automations } = (await response.json()) as { automations: Array<Record<string, unknown>> };
    expect(automations).toEqual([{ ...(wire(row) as Record<string, unknown>), latestRun: null }]);
    expect(typeof automations[0]?.steps).toBe("string");
    expect(typeof automations[0]?.conditions).toBe("string");
  });

  it("answers a generic 500 that holds no secret when the list or the run history fails", async () => {
    h.findMany.mockRejectedValue(new Error(`connection refused for password ${SECRET_IN_ERROR}`));
    const first = await collection.GET();
    expect(first.status).toBe(500);
    expect(JSON.stringify(await first.json())).toBe(JSON.stringify({ error: "Internal server error" }));
    h.findMany.mockResolvedValue([A1]);
    h.runGroupBy.mockRejectedValue(new Error(`run table locked ${SECRET_IN_ERROR}`));
    const second = await collection.GET();
    expect(second.status).toBe(500);
    expect(JSON.stringify(await second.json())).not.toContain(SECRET_IN_ERROR);
  });
});

describe("PATCH /api/automations/[id]: finding the definition", () => {
  it("looks the definition up by the id in the address", async () => {
    await patch({ name: "x" }, "Auto-Mixed-42");
    expect(firstCall(h.findUnique)[0]).toEqual({ where: { id: "Auto-Mixed-42" } });
    expect(firstCall(h.update)[0]).toEqual({ where: { id: "Auto-Mixed-42" }, data: expect.any(Object) });
  });

  it.each([
    ["does not exist", null],
    ["was deleted", stored({ deletedAt: new Date("2026-10-21T00:00:00.000Z") })],
  ])("answers 404 NOT_FOUND for a definition that %s, and writes nothing", async (_label, row) => {
    h.findUnique.mockResolvedValue(row);
    const response = await patch({ name: "x" });
    expect(response.status).toBe(404);
    expect(await bodyOf(response)).toEqual(NOT_FOUND);
    expectNothingWritten();
  });

  it.each([
    ["does not exist", null],
    ["was deleted", stored({ deletedAt: new Date("2026-10-21T00:00:00.000Z") })],
  ])("answers 404 even to the switch-off shortcut for a definition that %s, and writes nothing", async (_label, row) => {
    h.findUnique.mockResolvedValue(row);
    const response = await patch({ isActive: false });
    expect(response.status).toBe(404);
    expect(await bodyOf(response)).toEqual(NOT_FOUND);
    expectNothingWritten();
  });

  it("judges the body before looking for the definition: a bad body for a missing id is a 400, a good one a 404", async () => {
    h.findUnique.mockResolvedValue(null);
    expect((await patch({ name: "" })).status).toBe(400);
    expect(h.findUnique).not.toHaveBeenCalled();
    expect((await patch({ name: "fine" })).status).toBe(404);
    expect(h.findUnique).toHaveBeenCalledTimes(1);
  });

  it("judges the lookup before the policy: a body that breaks the policy, for a missing id, is a 404", async () => {
    h.findUnique.mockResolvedValue(null);
    const response = await patch({ trigger: "message.received", steps: [WHATSAPP_STEP] });
    expect(response.status).toBe(404);
  });

  it("answers 400 INVALID_REQUEST_JSON for a body that is not JSON", async () => {
    const response = await patch("{ not json");
    expect(response.status).toBe(400);
    expect(await bodyOf(response)).toEqual({ error: "Invalid JSON in request body", code: "INVALID_REQUEST_JSON" });
    expectNothingWritten();
  });

  it.each([
    ["an empty name", { name: "" }],
    ["a name of only spaces", { name: "  " }],
    ["a 121-character name", { name: "n".repeat(121) }],
    ["an unknown trigger", { trigger: "order.exploded" }],
    ["an unknown action", { action: "format_disk" }],
    ["isActive as text", { isActive: "no" }],
    ["dryRun as a number", { dryRun: 1 }],
    ["maxRetries 9", { maxRetries: 9 }],
    ["maxRetries -1", { maxRetries: -1 }],
    ["maxRetries 1.5", { maxRetries: 1.5 }],
    ["retryDelayMs 99", { retryDelayMs: 99 }],
    ["retryDelayMs 150.5", { retryDelayMs: 150.5 }],
    ["retryDelayMs 300001", { retryDelayMs: 300_001 }],
    ["an empty list of steps", { steps: [] }],
    ["21 steps", { steps: Array.from({ length: 21 }, () => NOTIFY_STEP) }],
    ["a config that is not an object", { config: "x" }],
    ["an empty group of conditions", { conditions: { all: [] } }],
    ["a field the contract does not know", { owner: "me" }],
    ["a body that is a list", [{ name: "x" }]],
    ["a body that is null", null],
  ])("answers 400 REQUEST_VALIDATION_FAILED for %s, before the definition is even looked up", async (_label, body) => {
    const response = await patch(body);
    expect(response.status).toBe(400);
    expect(await bodyOf(response)).toMatchObject({ code: "REQUEST_VALIDATION_FAILED" });
    expect(h.findUnique).not.toHaveBeenCalled();
    expectNothingWritten();
  });

  it.each([
    ["a 120-character name", { name: "n".repeat(120) }],
    ["maxRetries 0", { maxRetries: 0 }],
    ["maxRetries 8", { maxRetries: 8 }],
    ["retryDelayMs 100", { retryDelayMs: 100 }],
    ["retryDelayMs 300000", { retryDelayMs: 300_000 }],
    ["dryRun on", { dryRun: true }],
  ])("accepts %s", async (_label, body) => {
    expect((await patch(body)).status).toBe(200);
  });

  type Check = (data: Record<string, unknown>) => void;
  const STORED_AS_GIVEN: Array<[string, Record<string, unknown>, Check]> = [
    ["a 120-character name", { name: "n".repeat(120) }, (data) => expect(data.name).toBe("n".repeat(120))],
    ["maxRetries 0", { maxRetries: 0 }, (data) => expect(data.maxRetries).toBe(0)],
    ["maxRetries 8", { maxRetries: 8 }, (data) => expect(data.maxRetries).toBe(8)],
    ["retryDelayMs 100", { retryDelayMs: 100 }, (data) => expect(data.retryDelayMs).toBe(100)],
    ["retryDelayMs 300000", { retryDelayMs: 300_000 }, (data) => expect(data.retryDelayMs).toBe(300_000)],
    ["dryRun on", { dryRun: true }, (data) => expect(data.dryRun).toBe(true)],
  ];

  it.each(STORED_AS_GIVEN)("writes %s exactly as given, not clamped or defaulted", async (_label, body, check) => {
    expect((await patch(body)).status).toBe(200);
    check(updatedData());
  });

  it("ignores the config of the body when the row has steps: the stored steps stay as they are", async () => {
    const response = await patch({ config: { messageTemplate: "ignored" } });
    expect(response.status).toBe(200);
    expect(parsed(updatedData().steps)).toEqual([NOTIFY_STEP]);
    expect(parsed(updatedData().config)).toEqual(NOTIFY_STEP.config);
    expect(JSON.stringify(updatedData())).not.toContain("ignored");
  });
});

describe("PATCH /api/automations/[id]: switching a definition off", () => {
  // The screen sends exactly { isActive: !isActive } for its switch, so one key set to false is the only shortcut.
  it("writes only isActive false and nextRunAt null, reads no step, and audits automation.disabled with the before and after of isActive", async () => {
    const response = await patch({ isActive: false });
    expect(response.status).toBe(200);
    expect(h.update).toHaveBeenCalledTimes(1);
    expect(firstCall(h.update)[0]).toEqual({ where: { id: ID }, data: { isActive: false, nextRunAt: null } });
    const body = await bodyOf(response);
    expect(Object.keys(body)).toEqual(["automation"]);
    expect(body).toMatchObject({ automation: { id: ID, isActive: false, nextRunAt: null } });
    expect(h.logAudit).toHaveBeenCalledTimes(1);
    const [context, entry] = firstCall(h.logAudit) as [{ prisma: unknown; shop: unknown }, Record<string, unknown>];
    expect(context.prisma).toBe(db);
    expect(context.shop).toBe(shopContext);
    expect(entry).toEqual({
      action: "automation.disabled",
      entity: "automation",
      entityId: ID,
      actor: AUDIT_ACTOR,
      before: { isActive: true },
      after: { isActive: false },
    });
    expect(firstOrder(h.update)).toBeLessThan(firstOrder(h.logAudit));
  });

  it("switches off a definition that is broken beyond repair: an unknown trigger and action and steps that are not JSON", async () => {
    h.findUnique.mockResolvedValue(stored({ trigger: "order.retired", action: "format_disk", steps: "not json", config: "{", conditions: "[[" }));
    const response = await patch({ isActive: false });
    expect(response.status).toBe(200);
    expect(firstCall(h.update)[0]).toEqual({ where: { id: ID }, data: { isActive: false, nextRunAt: null } });
  });

  it("is never blocked by a missing outward-effect grant: a member who may only manage automations switches off a WhatsApp and status definition", async () => {
    actingWith(["automations.manage"]);
    h.findUnique.mockResolvedValue(stored({ steps: JSON.stringify([WHATSAPP_STEP, STATUS_STEP]), action: "send_whatsapp" }));
    expect((await patch({ isActive: false })).status).toBe(200);
  });

  it("does not skip a definition that is already off: it still writes and audits, with before isActive false", async () => {
    h.findUnique.mockResolvedValue(stored({ isActive: false }));
    await patch({ isActive: false });
    expect(h.update).toHaveBeenCalledTimes(1);
    expect(auditEntry()).toMatchObject({ action: "automation.disabled", before: { isActive: false } });
  });

  it("does not take the shortcut when anything else is sent: a broken definition cannot be edited and switched off in one go (observed)", async () => {
    h.findUnique.mockResolvedValue(stored({ trigger: "order.retired" }));
    const response = await patch({ isActive: false, name: "Renamed" });
    expect(response.status).toBe(400);
    expect(await bodyOf(response)).toMatchObject({ code: "REQUEST_VALIDATION_FAILED" });
    expectNothingWritten();
  });

  it("does not take the shortcut for isActive true: switching on judges the whole definition, not the shortcut", async () => {
    h.findUnique.mockResolvedValue(stored({ isActive: false, trigger: "order.retired" }));
    const response = await patch({ isActive: true });
    expect(response.status).toBe(400);
    expectNothingWritten();
  });

  it("answers a generic 500 that holds no secret, and no audit entry, when the write fails", async () => {
    h.update.mockRejectedValue(new Error(`connection refused for password ${SECRET_IN_ERROR}`));
    const response = await patch({ isActive: false });
    expect(response.status).toBe(500);
    const text = JSON.stringify(await response.json());
    expect(text).toBe(JSON.stringify({ error: "Internal server error" }));
    expect(text).not.toContain(SECRET_IN_ERROR);
    expect(h.logError).toHaveBeenCalledTimes(1);
    expect(h.logAudit).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/automations/[id]: changing a definition", () => {
  it("merges the change over the stored row, writes every column, and resets the retry state and the next run", async () => {
    const response = await patch({ name: "  New name  " });
    expect(response.status).toBe(200);
    const data = updatedData();
    expect(Object.keys(data).sort()).toEqual(
      ["action", "conditions", "config", "dryRun", "isActive", "lastError", "maxRetries", "name", "nextRunAt", "retryCount", "retryDelayMs", "steps", "trigger"],
    );
    expect(data).toMatchObject({
      name: "New name",
      trigger: "order.confirmed",
      action: "send_notification",
      isActive: true,
      dryRun: false,
      conditions: null,
      maxRetries: 2,
      retryDelayMs: 500,
      retryCount: 0,
      lastError: null,
      nextRunAt: null,
    });
    expect(parsed(data.steps)).toEqual([NOTIFY_STEP]);
    expect(parsed(data.config)).toEqual(NOTIFY_STEP.config);
    const body = await bodyOf(response);
    expect(Object.keys(body)).toEqual(["automation"]);
    expect(body).toMatchObject({ automation: { id: ID, name: "New name" } });
  });

  it("writes the trimmed name even when the body gives none: a stored name with spaces around it is cleaned on the next save", async () => {
    h.findUnique.mockResolvedValue(stored({ name: "  Old name  " }));
    await patch({ maxRetries: 3 });
    expect(updatedData().name).toBe("Old name");
  });

  it("takes every field from the body when the body gives it, and from the stored row when it does not", async () => {
    h.findUnique.mockResolvedValue(
      stored({ name: "Old", isActive: false, dryRun: true, maxRetries: 4, retryDelayMs: 900, conditions: JSON.stringify(CONDITIONS) }),
    );
    await patch({ maxRetries: 6 });
    expect(updatedData()).toMatchObject({ name: "Old", isActive: false, dryRun: true, maxRetries: 6, retryDelayMs: 900 });
    expect(parsed(updatedData().conditions)).toEqual(CONDITIONS);
    h.update.mockClear();
    await patch({ name: "Newer", isActive: true, dryRun: false, retryDelayMs: 1200 });
    expect(updatedData()).toMatchObject({ name: "Newer", isActive: true, dryRun: false, maxRetries: 4, retryDelayMs: 1200 });
  });

  it("keeps the stored conditions when the body says nothing about them, replaces them when it gives some, and clears them with null", async () => {
    h.findUnique.mockResolvedValue(stored({ conditions: JSON.stringify(CONDITIONS) }));
    await patch({ name: "Same conditions" });
    expect(parsed(updatedData().conditions)).toEqual(CONDITIONS);
    h.update.mockClear();
    const replacement = { any: [{ field: "totalPrice", operator: "greater_than", value: 9000 }] };
    await patch({ conditions: replacement });
    expect(parsed(updatedData().conditions)).toEqual(replacement);
    h.update.mockClear();
    await patch({ conditions: null });
    expect(updatedData().conditions).toBeNull();
  });

  it("replaces the stored steps when the body gives steps, and the action and config columns then follow the first step", async () => {
    await patch({ steps: [TAG_STEP, NOTIFY_STEP] });
    const data = updatedData();
    expect(parsed(data.steps)).toEqual([TAG_STEP, NOTIFY_STEP]);
    expect(data.action).toBe("tag_customer");
    expect(parsed(data.config)).toEqual(TAG_STEP.config);
  });

  it("builds one step from the stored action and config for an older row that has no steps", async () => {
    h.findUnique.mockResolvedValue(stored({ steps: null, config: JSON.stringify({ messageTemplate: "Legacy for {{orderNumber}}" }) }));
    const response = await patch({ name: "Migrated" });
    expect(response.status).toBe(200);
    const data = updatedData();
    expect(parsed(data.steps)).toEqual([{ action: "send_notification", onFailure: "stop", config: { messageTemplate: "Legacy for {{orderNumber}}" } }]);
    expect(parsed(data.config)).toEqual({ messageTemplate: "Legacy for {{orderNumber}}" });
  });

  it("builds that single step from the body's action and config when the body gives them and the row has no steps", async () => {
    h.findUnique.mockResolvedValue(stored({ steps: null }));
    await patch({ action: "tag_customer", config: TAG_STEP.config });
    expect(parsed(updatedData().steps)).toEqual([{ action: "tag_customer", onFailure: "stop", config: TAG_STEP.config }]);
    expect(updatedData().action).toBe("tag_customer");
  });

  // OBSERVED, not endorsed: when the row has steps, a body that only changes `action` is accepted and ignored, because the
  // action column is always taken from the first step.
  it("ignores a change of action alone when the row has steps (observed)", async () => {
    h.findUnique.mockResolvedValue(stored({ action: "wait", steps: JSON.stringify([WAIT_STEP, NOTIFY_STEP]), config: JSON.stringify(WAIT_STEP.config) }));
    const response = await patch({ action: "tag_customer" });
    expect(response.status).toBe(200);
    expect(updatedData().action).toBe("wait");
    expect((parsed(updatedData().steps) as unknown[]).length).toBe(2);
  });

  // OBSERVED, not endorsed: an empty body passes the key check, goes through the whole canonical path and re-saves the row.
  it("re-saves the definition for an empty body, resetting the retry state (observed)", async () => {
    const response = await patch({});
    expect(response.status).toBe(200);
    expect(updatedData()).toMatchObject({ retryCount: 0, lastError: null, nextRunAt: null });
    expect(auditEntry()).toMatchObject({ action: "automation.updated" });
  });

  it("judges the merged definition, not the body: a new trigger that does not carry the stored template's variable is refused", async () => {
    const response = await patch({ trigger: "message.received" });
    expect(response.status).toBe(400);
    expect(await bodyOf(response)).toEqual({
      error: "Template variable 'orderNumber' is not available on trigger 'message.received'",
      code: "AUTOMATION_SELLER_TEMPLATE_VARIABLE_UNAVAILABLE",
    });
    expectNothingWritten();
  });

  it("judges the merged definition for the actions too: the stored steps send WhatsApp, the body moves the trigger to one that cannot", async () => {
    h.findUnique.mockResolvedValue(stored({ action: "send_whatsapp", steps: JSON.stringify([WHATSAPP_STEP]), config: JSON.stringify(WHATSAPP_STEP.config) }));
    const response = await patch({ trigger: "stock.low" });
    expect(response.status).toBe(400);
    expect(await bodyOf(response)).toEqual({
      error: "Automation action 'send_whatsapp' is not compatible with trigger 'stock.low'",
      code: "AUTOMATION_SELLER_ACTION_INCOMPATIBLE",
    });
    expectNothingWritten();
  });

  it("refuses a body that moves the trigger and brings steps the new trigger cannot use", async () => {
    const response = await patch({ trigger: "stock.low", steps: [WHATSAPP_STEP] });
    expect(response.status).toBe(400);
    expect(await bodyOf(response)).toMatchObject({ code: "AUTOMATION_SELLER_ACTION_INCOMPATIBLE" });
    expectNothingWritten();
  });

  it("refuses a body that breaks the seller policy with its code, and writes nothing", async () => {
    const response = await patch({ steps: [{ ...STATUS_STEP, config: { targetStatus: "delivered" } }] });
    expect(response.status).toBe(400);
    expect(await bodyOf(response)).toMatchObject({ code: "AUTOMATION_SELLER_STATUS_TARGET_UNREACHABLE" });
    expectNothingWritten();
  });

  it("switches a definition on through the whole definition: a valid stored row is switched on and the isActive audit values change", async () => {
    h.findUnique.mockResolvedValue(stored({ isActive: false }));
    const response = await patch({ isActive: true });
    expect(response.status).toBe(200);
    expect(updatedData().isActive).toBe(true);
    expect(auditEntry()).toMatchObject({ action: "automation.updated", before: { isActive: false }, after: { isActive: true } });
  });

  // OBSERVED, not endorsed: the stored row is parsed with JSON.parse inside the handler, so a stored value that is not JSON
  // surfaces as the request-body error although the request was fine.
  it("answers 400 'Invalid JSON in request body' when a STORED value is not JSON, although the request is fine (observed)", async () => {
    h.findUnique.mockResolvedValue(stored({ steps: "not json" }));
    const response = await patch({ name: "Renamed" });
    expect(response.status).toBe(400);
    expect(await bodyOf(response)).toEqual({ error: "Invalid JSON in request body", code: "INVALID_REQUEST_JSON" });
    expectNothingWritten();
  });

  it("answers 400 REQUEST_VALIDATION_FAILED when the stored trigger is no longer known, so an edit cannot repair it silently", async () => {
    h.findUnique.mockResolvedValue(stored({ trigger: "order.retired" }));
    const response = await patch({ name: "Renamed" });
    expect(response.status).toBe(400);
    expect(await bodyOf(response)).toMatchObject({ code: "REQUEST_VALIDATION_FAILED" });
    expectNothingWritten();
  });

  it("repairs a stored row that is no longer valid when the body brings the trigger, the steps and the config", async () => {
    h.findUnique.mockResolvedValue(stored({ trigger: "order.retired", steps: "not json", config: "{" }));
    const response = await patch({ trigger: "order.confirmed", steps: [NOTIFY_STEP], config: NOTIFY_STEP.config });
    expect(response.status).toBe(200);
    expect(updatedData().trigger).toBe("order.confirmed");
    expect(parsed(updatedData().steps)).toEqual([NOTIFY_STEP]);
  });

  // OBSERVED, not endorsed: the stored config is parsed even when the body's steps make it unused, so a corrupt stored
  // config blocks a repair that sends only the steps.
  it("cannot be repaired with steps alone while the stored config is corrupt, although the steps replace it (observed)", async () => {
    h.findUnique.mockResolvedValue(stored({ trigger: "order.retired", steps: "not json", config: "{" }));
    const response = await patch({ trigger: "order.confirmed", steps: [NOTIFY_STEP] });
    expect(response.status).toBe(400);
    expect(await bodyOf(response)).toEqual({ error: "Invalid JSON in request body", code: "INVALID_REQUEST_JSON" });
    expectNothingWritten();
  });
});

describe("PATCH /api/automations/[id]: the author's own grants (INT-05)", () => {
  const ONLY_MANAGE = ["automations.manage"];

  it("refuses even a rename of a definition that sends WhatsApp messages, to a member without conversations.reply: editing is authoring too", async () => {
    actingWith(ONLY_MANAGE);
    h.findUnique.mockResolvedValue(stored({ action: "send_whatsapp", steps: JSON.stringify([WHATSAPP_STEP]), config: JSON.stringify(WHATSAPP_STEP.config) }));
    const response = await patch({ name: "Renamed" });
    expect(response.status).toBe(403);
    expect(await bodyOf(response)).toEqual({ error: "The current member is not authorized to perform conversations.reply", code: "ACTION_FORBIDDEN" });
    expectNothingWritten();
  });

  it("refuses a status change step to a member without orders.update, and accepts it once the grant is held", async () => {
    h.findUnique.mockResolvedValue(stored({ action: "update_status", steps: JSON.stringify([STATUS_STEP]), config: JSON.stringify(STATUS_STEP.config) }));
    actingWith(ONLY_MANAGE);
    const refused = await patch({ name: "Renamed" });
    expect(refused.status).toBe(403);
    expect(await bodyOf(refused)).toMatchObject({ error: "The current member is not authorized to perform orders.update" });
    actingWith(["automations.manage", "orders.update"]);
    expect((await patch({ name: "Renamed" })).status).toBe(200);
  });

  it("asks nothing extra for a definition with no outward effect", async () => {
    actingWith(ONLY_MANAGE);
    expect((await patch({ name: "Renamed" })).status).toBe(200);
  });

  it("judges the grants of the final steps: adding a WhatsApp step to a quiet definition needs conversations.reply", async () => {
    actingWith(ONLY_MANAGE);
    const response = await patch({ steps: [NOTIFY_STEP, WHATSAPP_STEP] });
    expect(response.status).toBe(403);
    expectNothingWritten();
  });

  it("judges the policy before the grants: an incompatible change from a member without the grant is a 400", async () => {
    actingWith(ONLY_MANAGE);
    const response = await patch({ trigger: "message.received", steps: [WHATSAPP_STEP] });
    expect(response.status).toBe(400);
    expect(await bodyOf(response)).toMatchObject({ code: "AUTOMATION_SELLER_ACTION_INCOMPATIBLE" });
  });
});

describe("PATCH /api/automations/[id]: the audit entry", () => {
  it("writes one automation.updated entry after the row, with the actor, the shop's own handle and context, the stored row before and the written row after", async () => {
    h.findUnique.mockResolvedValue(stored({ name: "Old name", isActive: false, dryRun: true }));
    h.update.mockResolvedValue({ id: ID, name: "Written name", trigger: "order.shipped", action: "wait", isActive: true, dryRun: false });
    await patch({ name: "Whatever", isActive: true, dryRun: false });
    expect(h.logAudit).toHaveBeenCalledTimes(1);
    const [context, entry] = firstCall(h.logAudit) as [{ prisma: unknown; shop: unknown }, Record<string, unknown>];
    expect(context.prisma).toBe(db);
    expect(context.shop).toBe(shopContext);
    expect(entry).toEqual({
      action: "automation.updated",
      entity: "automation",
      entityId: ID,
      actor: AUDIT_ACTOR,
      before: { name: "Old name", trigger: "order.confirmed", action: "send_notification", isActive: false, dryRun: true },
      after: { name: "Written name", trigger: "order.shipped", action: "wait", isActive: true, dryRun: false },
    });
    expect(firstOrder(h.update)).toBeLessThan(firstOrder(h.logAudit));
  });

  it("holds no step text, condition or config in the audit entry", async () => {
    h.findUnique.mockResolvedValue(stored({ conditions: JSON.stringify(CONDITIONS) }));
    await patch({ name: "Renamed" });
    const text = JSON.stringify(auditEntry());
    for (const forbidden of ["Order {{orderNumber}}", "Alger", "messageTemplate", "an old error"]) expect(text).not.toContain(forbidden);
  });

  it("answers a generic 500 that holds no secret, and no audit entry, when the write fails", async () => {
    h.update.mockRejectedValue(new Error(`connection refused for password ${SECRET_IN_ERROR}`));
    const response = await patch({ name: "Renamed" });
    expect(response.status).toBe(500);
    const text = JSON.stringify(await response.json());
    expect(text).toBe(JSON.stringify({ error: "Internal server error" }));
    expect(text).not.toContain(SECRET_IN_ERROR);
    expect(h.logAudit).not.toHaveBeenCalled();
  });

  it("answers a generic 500, and writes nothing, when the lookup fails", async () => {
    h.findUnique.mockRejectedValue(new Error(`connection refused for password ${SECRET_IN_ERROR}`));
    const response = await patch({ name: "Renamed" });
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain(SECRET_IN_ERROR);
    expectNothingWritten();
  });
});

describe("DELETE /api/automations/[id]", () => {
  const NOW = new Date("2026-10-22T12:34:56.000Z");

  it("soft-deletes: stamps deletedAt with the current time, switches the definition off and clears its next run, and answers 200 { success: true }", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const response = await remove("Auto-Mixed-9");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(firstCall(h.findUnique)[0]).toEqual({ where: { id: "Auto-Mixed-9" } });
    expect(h.update).toHaveBeenCalledTimes(1);
    expect(firstCall(h.update)[0]).toEqual({ where: { id: "Auto-Mixed-9" }, data: { deletedAt: NOW, isActive: false, nextRunAt: null } });
    expect(response.headers.get("X-SahelFlow-Shop-Id")).toBe("shop-a");
  });

  it("never removes a row or any run history", async () => {
    const response = await remove();
    expect(response.status).toBe(200);
    expect(h.update).toHaveBeenCalledTimes(1);
    expect(h.hardDelete).not.toHaveBeenCalled();
    expect(h.runDeleteMany).not.toHaveBeenCalled();
  });

  it.each([
    ["does not exist", null],
    ["was already deleted", stored({ deletedAt: new Date("2026-10-21T00:00:00.000Z") })],
  ])("answers 404 NOT_FOUND for a definition that %s, so a second delete is a 404, and writes nothing", async (_label, row) => {
    h.findUnique.mockResolvedValue(row);
    const response = await remove();
    expect(response.status).toBe(404);
    expect(await bodyOf(response)).toEqual(NOT_FOUND);
    expectNothingWritten();
  });

  // OBSERVED, not endorsed: unlike the POST and PATCH entries, the DELETE entry holds the whole stored row, with the steps, the conditions,
  // the config and the last error text.
  it("writes one automation.deleted entry after the update, with the actor, the shop's own handle and context, and the whole stored row as before (observed)", async () => {
    const row = stored({ conditions: JSON.stringify(CONDITIONS) });
    h.findUnique.mockResolvedValue(row);
    await remove();
    expect(h.logAudit).toHaveBeenCalledTimes(1);
    const [context, entry] = firstCall(h.logAudit) as [{ prisma: unknown; shop: unknown }, Record<string, unknown>];
    expect(context.prisma).toBe(db);
    expect(context.shop).toBe(shopContext);
    expect(entry).toEqual({ action: "automation.deleted", entity: "automation", entityId: ID, actor: AUDIT_ACTOR, before: row });
    expect(Object.keys(entry)).not.toContain("after");
    expect(firstOrder(h.update)).toBeLessThan(firstOrder(h.logAudit));
  });

  it("is never blocked by a missing outward-effect grant: a member who may only manage automations deletes a WhatsApp and status definition", async () => {
    actingWith(["automations.manage"]);
    h.findUnique.mockResolvedValue(stored({ action: "send_whatsapp", steps: JSON.stringify([WHATSAPP_STEP, STATUS_STEP]) }));
    expect((await remove()).status).toBe(200);
  });

  it("deletes a definition that is broken beyond repair", async () => {
    h.findUnique.mockResolvedValue(stored({ trigger: "order.retired", steps: "not json", config: "{" }));
    expect((await remove()).status).toBe(200);
  });

  it("answers a generic 500 that holds no secret, and no audit entry, when the write fails", async () => {
    h.update.mockRejectedValue(new Error(`connection refused for password ${SECRET_IN_ERROR}`));
    const response = await remove();
    expect(response.status).toBe(500);
    const text = JSON.stringify(await response.json());
    expect(text).toBe(JSON.stringify({ error: "Internal server error" }));
    expect(text).not.toContain(SECRET_IN_ERROR);
    expect(h.logError).toHaveBeenCalledTimes(1);
    expect(h.logAudit).not.toHaveBeenCalled();
  });
});
