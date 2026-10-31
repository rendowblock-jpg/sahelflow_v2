process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

const hoisted = vi.hoisted(() => ({
  actor: null as unknown,
  trusted: vi.fn(),
  dispatch: vi.fn(async () => undefined),
  capi: vi.fn(async () => undefined),
  queue: vi.fn(),
  process: vi.fn(async () => undefined),
}));

// Only the brand check of the trusted actor, the automations engine, the CAPI ledger and the WhatsApp queue are replaced.
// The database, the order kernel, the stock reservation, the comments and the envelopes (real keys) run for real.
// The test database's shop id is "test", shorter than the 8 characters the envelope format wants for a shop id. The
// format check is the ONLY thing relaxed: it accepts an envelope that is valid except for that id. Signatures, sealing,
// scope comparison and expiry all run for real.
vi.mock("./protocol", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./protocol")>();
  return {
    ...actual,
    isConnectedEnvelope: (value: unknown) =>
      actual.isConnectedEnvelope(value) ||
      (typeof value === "object" && value !== null && (value as { shopId?: unknown }).shopId === "test" &&
        actual.isConnectedEnvelope({ ...(value as object), shopId: "testshop0001" })),
  };
});
vi.mock("@/lib/identity/trusted-actor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/identity/trusted-actor")>();
  return {
    ...actual,
    isTrustedActorContext: vi.fn(() => true),
    trustedActorForRemoteCommand: (...args: unknown[]) => hoisted.trusted(...args),
  };
});
vi.mock("@/lib/automations/engine", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/automations/engine")>()),
  dispatchTrigger: hoisted.dispatch,
}));
vi.mock("@/lib/meta/capi-triggers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/meta/capi-triggers")>()),
  fireCapiStageForOrder: hoisted.capi,
}));
vi.mock("@/lib/whatsapp/durable-send", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/whatsapp/durable-send")>()),
  queueWhatsAppText: hoisted.queue,
  processWhatsAppEffect: hoisted.process,
}));

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PrismaClient } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { cleanDb, seedCustomer, seedOrder, seedProduct } from "@/lib/data/__tests__/helpers";
import { db, shopContext } from "@/lib/db";
import { decideOrderForActor } from "@/lib/orders/decide-order-for-actor";
import { trustedManualOrderSourceMetadata } from "@/lib/orders/manual-order-authority";
import { SahelFlowError } from "@/types/errors";
import { HANDLERS } from "./command-handlers";
import { EXECUTABLE_COMMAND_KINDS } from "./command-policy";
import { COMMAND_RESULT_TTL_MS } from "./contracts";
import { createConnectedEnvelope, openConnectedEnvelope } from "./envelope";
import { generateConnectedKeyPair } from "./payload-crypto";
import {
  CONNECTED_CIPHER_ALGORITHM,
  CONNECTED_PROTOCOL_VERSION,
  CONNECTED_SIGNATURE_ALGORITHM,
  type ConnectedEnvelope,
} from "./protocol";
import { executeQueuedRemoteCommands } from "./remote-command-executor";

const raw = db as unknown as PrismaClient;
// The shop of the test database itself: the protected key authority is bound to it.
const MEMBER = "a".repeat(32);
const DEVICE = "phone_exec_0001";
const SHOP = shopContext as never;
const HOUR = 3_600_000;
const desktop = generateConnectedKeyPair();
const phone = generateConnectedKeyPair();

function actor(permissions?: readonly string[], over: Record<string, unknown> = {}) {
  return {
    version: 1,
    actor: {
      kind: "person", personId: "5".repeat(32), workspaceMemberId: MEMBER, deviceId: DEVICE, sessionId: "s",
      role: permissions ? "operator" : "owner", policyVersion: 1, revocationEpoch: 0,
      ...(permissions ? { permissions } : {}), ...over,
    },
    shop: SHOP,
  } as never;
}

type Meta = Parameters<typeof createConnectedEnvelope>[0];
function sealed(kind: string, payload: unknown, over: Record<string, unknown> = {}): ConnectedEnvelope {
  const id = (over.envelopeId as string | undefined) ?? `command_${randomUUID().replaceAll("-", "")}`;
  const meta = {
    protocolVersion: CONNECTED_PROTOCOL_VERSION, envelopeId: id, idempotencyKey: id,
    workspaceId: shopContext.workspaceId, shopId: shopContext.shopId, memberId: MEMBER, deviceId: DEVICE, installationId: shopContext.installationId,
    senderKind: "device", senderId: DEVICE, recipientKind: "desktop", recipientId: shopContext.installationId, messageType: kind,
    sequence: 1, issuedAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + HOUR).toISOString(),
    revocationEpoch: 0, cipherAlgorithm: CONNECTED_CIPHER_ALGORITHM, encryptionKeyId: "enckey_00000001",
    signatureAlgorithm: CONNECTED_SIGNATURE_ALGORITHM, signingKeyId: "sigkey_00000001", ...over,
  } as unknown as Meta;
  return createConnectedEnvelope(meta, payload, desktop.encryptionPublicKeyJwk, phone.signingPrivateKeyPkcs8);
}

type Done = { id: string; state: string; code?: string; result: Record<string, unknown>; raw: ConnectedEnvelope };
async function run(envelopes: ConnectedEnvelope[], options: { devices?: unknown[]; now?: () => Date } = {}) {
  const done: Done[] = [];
  const device = { device_id: DEVICE, member_id: MEMBER, signing_public_key: phone.signingPublicKey, encryption_public_key: phone.encryptionPublicKeyJwk, revocation_epoch: 0 };
  const client = {
    pollCommands: async () => ({
      commands: envelopes.map((envelope, index) => ({ relaySequence: index + 1, commandId: envelope.envelopeId, envelope })),
      nextCursor: envelopes.length, pairedDevices: 1, activeDevices: 1,
    }),
    listDevices: async () => ({ devices: options.devices ?? [device] }),
    completeCommand: async (id: string, state: string, envelope: ConnectedEnvelope) => {
      let opened;
      try { opened = openConnectedEnvelope<{ state: string; result: Record<string, unknown> }>(envelope, desktop.signingPublicKey, phone.encryptionPrivateKeyPkcs8); }
      catch { opened = openConnectedEnvelope<{ state: string; result: Record<string, unknown> }>(envelope, desktop.signingPublicKey, desktop.encryptionPrivateKeyPkcs8); }
      expect(opened.payload.state).toBe(state);
      done.push({ id, state, code: opened.payload.result.code as string | undefined, result: opened.payload.result, raw: envelope });
      return { commandId: id, state };
    },
  };
  const out = await executeQueuedRemoteCommands({
    client: client as never, desktopKeys: desktop, context: { prisma: db, shop: SHOP } as never, after: 0,
    ...(options.now ? { now: options.now } : {}),
  });
  return { done, out };
}

async function canonicalOrder(stock = 7, threshold = 5, status = "pending") {
  const customer = await seedCustomer(raw);
  const product = await seedProduct(raw, { stock, lowStockThreshold: threshold });
  const order = await seedOrder(raw, { status, customerId: customer.id, productId: product.id });
  await raw.order.update({ where: { id: order.id }, data: { sourceMetadata: trustedManualOrderSourceMetadata() } });
  return { order, product };
}

beforeEach(async () => {
  await cleanDb(raw);
  await db.collaborationComment.deleteMany();
  await db.businessAggregateVersion.deleteMany();
  await db.message.deleteMany();
  await db.conversation.deleteMany();
  vi.clearAllMocks();
  hoisted.actor = actor();
  hoisted.trusted.mockImplementation(async () => hoisted.actor);
  hoisted.queue.mockResolvedValue({ messageId: "msg-queued-1", effectKey: "effect-1", replayed: false });
});

describe("the registry and the relay list agree", () => {
  it("has exactly one handler per executable kind", () => {
    expect(Object.keys(HANDLERS).sort()).toEqual([...EXECUTABLE_COMMAND_KINDS].sort());
  });
});

describe("confirm from the phone", () => {
  it("does what the Confirm button does: reserves stock once, fires the order trigger, the low-stock trigger and CAPI", async () => {
    const { order, product } = await canonicalOrder(7, 5);
    const envelope = sealed("command.orders.confirm", { orderId: order.id, expectedVersion: order.version });
    const { done, out } = await run([envelope]);
    expect(done[0]).toMatchObject({ state: "committed", result: { orderId: order.id, status: "confirmed", version: order.version + 1, replayed: false } });
    expect(out).toMatchObject({ completed: 1, nextCursor: 1 });
    expect((await raw.order.findUnique({ where: { id: order.id } }))?.status).toBe("confirmed");
    expect((await raw.product.findUnique({ where: { id: product.id } }))?.stock).toBe(5);
    expect(hoisted.dispatch.mock.calls.map((call) => (call as unknown[])[1])).toEqual(["order.confirmed", "stock.low"]);
    expect(hoisted.capi).toHaveBeenCalledWith(order.id, "confirmed");

    // The same sealed command again (a lost cursor): the first result, no second reservation, no second trigger.
    const again = await run([envelope]);
    expect(again.done[0]).toMatchObject({ state: "committed", result: { replayed: true, status: "confirmed" } });
    expect((await raw.product.findUnique({ where: { id: product.id } }))?.stock).toBe(5);
    expect(hoisted.dispatch).toHaveBeenCalledTimes(2);
    expect(hoisted.capi).toHaveBeenCalledTimes(1);
  });

  it("a wrong version is a conflict and changes nothing; an order already confirmed says so", async () => {
    const { order, product } = await canonicalOrder();
    const stale = await run([sealed("command.orders.confirm", { orderId: order.id, expectedVersion: order.version + 5 })]);
    expect(stale.done[0]).toMatchObject({ state: "conflict", code: "ORDER_CHANGED" });
    expect((await raw.order.findUnique({ where: { id: order.id } }))?.status).toBe("pending");
    expect((await raw.product.findUnique({ where: { id: product.id } }))?.stock).toBe(7);
    expect(hoisted.dispatch).not.toHaveBeenCalled();

    await raw.order.update({ where: { id: order.id }, data: { status: "confirmed" } });
    const confirmed = await run([sealed("command.orders.confirm", { orderId: order.id, expectedVersion: order.version })]);
    expect(confirmed.done[0]).toMatchObject({ state: "conflict", code: "ORDER_ALREADY_CONFIRMED" });
    const rejectIt = await run([sealed("command.orders.reject", { orderId: order.id, expectedVersion: order.version, reasonKey: "fakeOrder" })]);
    expect(rejectIt.done[0]).toMatchObject({ state: "conflict", code: "ORDER_CHANGED" });
    await raw.order.update({ where: { id: order.id }, data: { status: "cancelled" } });
    const cancelled = await run([sealed("command.orders.reject", { orderId: order.id, expectedVersion: order.version, reasonKey: "fakeOrder" })]);
    expect(cancelled.done[0]).toMatchObject({ state: "conflict", code: "ORDER_ALREADY_CANCELLED" });
  });

  it("a missing order is NOT_FOUND", async () => {
    const { done } = await run([sealed("command.orders.confirm", { orderId: "no-such-order", expectedVersion: 1 })]);
    expect(done[0]).toMatchObject({ state: "rejected", code: "NOT_FOUND" });
  });

  it("an order that is not a pending manual or legacy one is never changed freely", async () => {
    const { order } = await canonicalOrder(7, 5, "shipped");
    const { done } = await run([sealed("command.orders.confirm", { orderId: order.id, expectedVersion: order.version })]);
    expect(done[0]).toMatchObject({ state: "conflict", code: "ORDER_CHANGED" });
    expect((await raw.order.findUnique({ where: { id: order.id } }))?.status).toBe("shipped");
  });

  it("a legacy order goes through the status transition and CAPI, with the same version check", async () => {
    const customer = await seedCustomer(raw);
    const product = await seedProduct(raw);
    const order = await seedOrder(raw, { status: "pending", customerId: customer.id, productId: product.id });
    const wrong = await run([sealed("command.orders.confirm", { orderId: order.id, expectedVersion: order.version + 1 })]);
    expect(wrong.done[0]).toMatchObject({ state: "conflict", code: "ORDER_CHANGED" });
    expect(hoisted.capi).not.toHaveBeenCalled();
    const right = await run([sealed("command.orders.confirm", { orderId: order.id, expectedVersion: order.version })]);
    expect(right.done[0]).toMatchObject({ state: "committed", result: { status: "confirmed" } });
    expect((await raw.order.findUnique({ where: { id: order.id } }))?.status).toBe("confirmed");
    expect(hoisted.capi).toHaveBeenCalledWith(order.id, "confirmed");
  });
});

describe("confirm from the phone: more rules", () => {
  it("a legacy order that is no longer pending says what it is", async () => {
    const customer = await seedCustomer(raw);
    const product = await seedProduct(raw);
    const order = await seedOrder(raw, { status: "confirmed", customerId: customer.id, productId: product.id });
    const { done } = await run([sealed("command.orders.confirm", { orderId: order.id, expectedVersion: order.version })]);
    expect(done[0]).toMatchObject({ state: "conflict", code: "ORDER_ALREADY_CONFIRMED" });
    expect(hoisted.capi).not.toHaveBeenCalled();
  });

  it("the phone's idempotency key lives in its own key space: the desktop's plain key never replays it", async () => {
    const { order } = await canonicalOrder();
    const envelope = sealed("command.orders.confirm", { orderId: order.id, expectedVersion: order.version });
    expect((await run([envelope])).done[0]).toMatchObject({ state: "committed" });
    await expect(decideOrderForActor({ prisma: db, shop: SHOP } as never, actor(), {
      orderId: order.id, decision: "confirm", expectedVersion: order.version, idempotencyKey: envelope.idempotencyKey,
    })).rejects.toMatchObject({ code: "ORDER_ALREADY_CONFIRMED" });
  });
});

describe("reject from the phone", () => {
  it("needs a reason KEY: no reason or free text is INVALID_PAYLOAD and the order stays pending", async () => {
    const { order } = await canonicalOrder();
    for (const payload of [
      { orderId: order.id, expectedVersion: order.version },
      { orderId: order.id, expectedVersion: order.version, reasonKey: "he was rude" },
    ]) {
      const { done } = await run([sealed("command.orders.reject", payload)]);
      expect(done[0]).toMatchObject({ state: "rejected", code: "INVALID_PAYLOAD" });
    }
    expect((await raw.order.findUnique({ where: { id: order.id } }))?.status).toBe("pending");
  });

  it("cancels with the key, keeps the stock, fires the cancel trigger and no CAPI", async () => {
    const { order, product } = await canonicalOrder();
    const { done } = await run([sealed("command.orders.reject", { orderId: order.id, expectedVersion: order.version, reasonKey: "fakeOrder" })]);
    expect(done[0]).toMatchObject({ state: "committed", result: { status: "cancelled" } });
    expect((await raw.product.findUnique({ where: { id: product.id } }))?.stock).toBe(7);
    expect(hoisted.dispatch.mock.calls.map((call) => (call as unknown[])[1])).toEqual(["order.cancelled"]);
    expect(hoisted.capi).not.toHaveBeenCalled();
  });
});

describe("the same rules as the desktop", () => {
  it("decideOrderForActor refuses a member who may not update orders, and the order is untouched", async () => {
    const { order } = await canonicalOrder();
    await expect(decideOrderForActor({ prisma: db, shop: SHOP } as never, actor(["orders.read"]), {
      orderId: order.id, decision: "confirm", expectedVersion: order.version, idempotencyKey: `connected:${randomUUID()}`,
    })).rejects.toBeInstanceOf(SahelFlowError);
    expect((await raw.order.findUnique({ where: { id: order.id } }))?.status).toBe("pending");
  });

  it("each kind asks for every permission of its rule", async () => {
    const { order } = await canonicalOrder();
    const conv = await db.conversation.create({ data: { channel: "whatsapp", contactName: "S", contactPhone: "213661234567", sourceId: "213661234567@s.whatsapp.net" } });
    const cases: Array<[string, unknown, string[]]> = [
      ["command.orders.confirm", { orderId: order.id, expectedVersion: order.version }, ["orders.read"]],
      ["command.orders.reject", { orderId: order.id, expectedVersion: order.version, reasonKey: "fakeOrder" }, ["orders.read"]],
      ["command.messages.reply", { conversationId: conv.id, text: "hello" }, ["conversations.reply"]],
      ["command.messages.reply", { conversationId: conv.id, text: "hello" }, ["customers.contact.read"]],
      ["command.comments.write", { entityType: "order", entityId: order.id, body: "x", expectedVersion: 0 }, ["orders.read"]],
    ];
    for (const [kind, payload, permissions] of cases) {
      hoisted.actor = actor(permissions);
      const { done } = await run([sealed(kind, payload, kind === "command.messages.reply" ? { envelopeId: randomUUID() } : {})]);
      expect(done[0], `${kind} with ${permissions.join()}`).toMatchObject({ state: "rejected", code: "PERMISSION_DENIED" });
    }
    expect(hoisted.queue).not.toHaveBeenCalled();
    expect((await raw.order.findUnique({ where: { id: order.id } }))?.status).toBe("pending");
  });

  it("a policy version or revocation epoch that moved is REMOTE_POLICY_STALE", async () => {
    const { order } = await canonicalOrder();
    const payload = { orderId: order.id, expectedVersion: order.version };
    hoisted.actor = actor(undefined, { policyVersion: 2 });
    expect((await run([sealed("command.orders.confirm", payload)])).done[0]).toMatchObject({ code: "REMOTE_POLICY_STALE" });
    hoisted.actor = actor(undefined, { revocationEpoch: 3 });
    expect((await run([sealed("command.orders.confirm", payload)])).done[0]).toMatchObject({ code: "REMOTE_POLICY_STALE" });
    expect((await raw.order.findUnique({ where: { id: order.id } }))?.status).toBe("pending");
  });
});

describe("the command itself", () => {
  it("an expired command is EXPIRED and nothing is executed", async () => {
    const { order } = await canonicalOrder();
    const envelope = sealed("command.orders.confirm", { orderId: order.id, expectedVersion: order.version }, {
      issuedAt: new Date(Date.now() - 2 * HOUR).toISOString(), expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    const { done } = await run([envelope]);
    expect(done[0]).toMatchObject({ state: "rejected", code: "EXPIRED" });
    expect(hoisted.trusted).not.toHaveBeenCalled();
    expect((await raw.order.findUnique({ where: { id: order.id } }))?.status).toBe("pending");
    // Valid when sealed, late when the PC gets to it.
    const late = await run([sealed("command.orders.confirm", { orderId: order.id, expectedVersion: order.version })], { now: () => new Date(Date.now() + 2 * HOUR) });
    expect(late.done[0]).toMatchObject({ code: "EXPIRED" });
  });

  it("a command that lives longer than its kind allows is EXPIRY_TOO_LONG; a reply allows 4 h, not 5", async () => {
    const { order } = await canonicalOrder();
    const issuedAt = new Date(Date.now() - 1000);
    const over = (hours: number) => ({ issuedAt: issuedAt.toISOString(), expiresAt: new Date(issuedAt.getTime() + hours * HOUR).toISOString() });
    const conv = await db.conversation.create({ data: { channel: "whatsapp", contactName: "S", sourceId: "213661234567@s.whatsapp.net" } });
    expect((await run([sealed("command.orders.confirm", { orderId: order.id, expectedVersion: order.version }, over(13))])).done[0]).toMatchObject({ code: "EXPIRY_TOO_LONG" });
    expect((await run([sealed("command.messages.reply", { conversationId: conv.id, text: "hi" }, { envelopeId: randomUUID(), ...over(5) })])).done[0]).toMatchObject({ code: "EXPIRY_TOO_LONG" });
    expect((await run([sealed("command.orders.confirm", { orderId: order.id, expectedVersion: order.version }, over(11))])).done[0]).toMatchObject({ state: "committed" });
  });

  it("an unknown device and an unsupported kind are COMPLETED with a code, so the page [bad, good] moves the cursor", async () => {
    const ghost = sealed("command.orders.confirm", { orderId: "x", expectedVersion: 1 }, { deviceId: "ghost_device_01", senderId: "ghost_device_01" });
    const unsupported = sealed("command.orders.refund", { orderId: "x" });
    const good = sealed("command.orders.confirm", { orderId: "no-such-order", expectedVersion: 1 });
    const { done, out } = await run([ghost, unsupported, good]);
    expect(done.map((entry) => entry.code)).toEqual(["REMOTE_DEVICE_UNKNOWN", "REMOTE_COMMAND_UNSUPPORTED", "NOT_FOUND"]);
    expect(out).toMatchObject({ completed: 3, nextCursor: 3 });
  });

  it("keeps a result for 24 hours so a phone that was offline can still open it", async () => {
    const { done } = await run([sealed("command.orders.confirm", { orderId: "no-such-order", expectedVersion: 1 })]);
    const result = done[0]?.raw;
    expect(Date.parse(result?.expiresAt ?? "") - Date.parse(result?.issuedAt ?? "")).toBe(COMMAND_RESULT_TTL_MS);
  });
});

describe("note from the phone", () => {
  it("is written once, a replay returns the first result, and a stale note version is a conflict", async () => {
    const { order } = await canonicalOrder();
    const payload = { entityType: "order", entityId: order.id, body: "Call him after 6", expectedVersion: 0 };
    const envelope = sealed("command.comments.write", payload);
    const first = await run([envelope]);
    expect(first.done[0]).toMatchObject({ state: "committed", result: { replayed: false } });
    const replay = await run([envelope]);
    expect(replay.done[0]).toMatchObject({ state: "committed", result: { replayed: true } });
    expect(await db.collaborationComment.count()).toBe(1);
    const stale = await run([sealed("command.comments.write", payload)]);
    expect(stale.done[0]).toMatchObject({ state: "conflict", code: "ENTITY_CHANGED" });
  });
});

describe("reply from the phone", () => {
  async function chat() {
    const conversation = await db.conversation.create({
      data: { channel: "whatsapp", contactName: "Samira", contactPhone: "213661234567", sourceId: "98765432101@lid" },
    });
    const inbound = await db.message.create({ data: { conversationId: conversation.id, body: "hello", direction: "inbound", timestamp: new Date("2026-10-31T06:00:00Z") } });
    return { conversation, inbound };
  }
  const reply = (payload: unknown, id: string = randomUUID()) => sealed("command.messages.reply", payload, { envelopeId: id });

  it("goes to the conversation's own address (a hidden-id chat included), with the command id as the client id", async () => {
    const { conversation } = await chat();
    const id = randomUUID();
    const { done } = await run([reply({ conversationId: conversation.id, text: "  On the way  " }, id)]);
    expect(done[0]).toMatchObject({ state: "committed", result: { messageId: "msg-queued-1", effectKey: "effect-1", state: "queued" } });
    expect(hoisted.queue).toHaveBeenCalledTimes(1);
    expect(hoisted.queue.mock.calls[0]?.[1]).toEqual({ clientMessageId: id, to: "98765432101@lid", text: "On the way", conversationId: conversation.id });
    expect(hoisted.process).toHaveBeenCalledWith(expect.anything(), "effect-1");
  });

  it("refuses a payload that names a number, an id that is not a uuid, and a conversation that is not here", async () => {
    const { conversation } = await chat();
    const withTo = await run([reply({ conversationId: conversation.id, text: "hi", to: "213550000000" })]);
    expect(withTo.done[0]).toMatchObject({ state: "rejected", code: "INVALID_PAYLOAD" });
    const notUuid = await run([sealed("command.messages.reply", { conversationId: conversation.id, text: "hi" })]);
    expect(notUuid.done[0]).toMatchObject({ state: "rejected", code: "INVALID_PAYLOAD" });
    const missing = await run([reply({ conversationId: "missing-conversation", text: "hi" })]);
    expect(missing.done[0]).toMatchObject({ state: "rejected", code: "NOT_FOUND" });
    expect(hoisted.queue).not.toHaveBeenCalled();
  });

  it("is ALREADY_ANSWERED when the PC replied after what the phone saw, unless the seller says send anyway", async () => {
    const { conversation, inbound } = await chat();
    const outbound = await db.message.create({ data: { conversationId: conversation.id, body: "done", direction: "outbound", timestamp: new Date("2026-10-31T06:05:00Z") } });
    const blocked = await run([reply({ conversationId: conversation.id, text: "hi", lastSeenMessageId: inbound.id })]);
    expect(blocked.done[0]).toMatchObject({ state: "conflict", code: "ALREADY_ANSWERED" });
    expect(hoisted.queue).not.toHaveBeenCalled();
    const forced = await run([reply({ conversationId: conversation.id, text: "hi", lastSeenMessageId: inbound.id, force: true })]);
    expect(forced.done[0]).toMatchObject({ state: "committed" });
    const current = await run([reply({ conversationId: conversation.id, text: "hi", lastSeenMessageId: outbound.id })]);
    expect(current.done[0]).toMatchObject({ state: "committed" });
    expect(hoisted.queue).toHaveBeenCalledTimes(2);
  });

  it("a send-guard refusal is SEND_GUARD_REFUSED", async () => {
    const { conversation } = await chat();
    hoisted.queue.mockRejectedValueOnce(new SahelFlowError("paused", "SEND_GUARD_REFUSED", 429));
    const { done } = await run([reply({ conversationId: conversation.id, text: "hi" })]);
    expect(done[0]).toMatchObject({ state: "rejected", code: "SEND_GUARD_REFUSED" });
  });
});

describe("routes and phone share one function", () => {
  it("the decision route no longer fires triggers itself", () => {
    const route = readFileSync(join(process.cwd(), "src/app/api/orders/[id]/decision/route.ts"), "utf8");
    expect(route).toContain("runManualDecisionEffects(context, command)");
    expect(route).not.toContain("dispatchTrigger(");
    expect(route).not.toContain("fireCapiStageForOrder(");
    const status = readFileSync(join(process.cwd(), "src/app/api/orders/[id]/status/route.ts"), "utf8");
    expect(status).toContain("runLegacyStatusEffects(id, data.status)");
    expect(status).not.toContain("fireCapiStageForOrder(");
  });
});

// W3b SEC3 (c): a note needs comments.write AND the read right of ITS entity (orders.read for an order or a confirmation,
// conversations.read for a conversation). Every combination, with real SQLite; allowed notes are written, the rest change nothing.
describe("note from the phone: comments.write plus the read right of its own entity", () => {
  const sets: Array<[string, string[]]> = [
    ["nothing", []],
    ["write only", ["comments.write"]],
    ["write + orders.read", ["comments.write", "orders.read"]],
    ["write + conversations.read", ["comments.write", "conversations.read"]],
    ["both reads, no write", ["orders.read", "conversations.read"]],
    ["write + both reads", ["comments.write", "orders.read", "conversations.read"]],
  ];
  it("refuses every combination that lacks one of the two, and writes exactly the allowed ones", async () => {
    let written = 0;
    let n = 0;
    const customer = await seedCustomer(raw);
    const product = await seedProduct(raw, { stock: 7, lowStockThreshold: 5 });
    for (const [label, permissions] of sets) {
      for (const entityType of ["order", "conversation", "confirmation"] as const) {
        n += 1;
        const order = await seedOrder(raw, { status: "pending", customerId: customer.id, productId: product.id });
        const phoneNo = `2136612340${String(n).padStart(2, "0")}`;
        const conv = await db.conversation.create({ data: { channel: "whatsapp", contactName: "S", contactPhone: phoneNo, sourceId: `${phoneNo}@s.whatsapp.net` } });
        const entityId = entityType === "conversation" ? conv.id : order.id;
        hoisted.actor = actor(permissions);
        const { done } = await run([sealed("command.comments.write", { entityType, entityId, body: "private note", expectedVersion: 0 })]);
        const key = `${label} / ${entityType}`;
        const readOk = permissions.includes(entityType === "conversation" ? "conversations.read" : "orders.read");
        if (!permissions.includes("comments.write") || !readOk) {
          expect(done[0], key).toMatchObject({ state: "rejected", code: "PERMISSION_DENIED" });
        } else {
          expect(done[0], key).toMatchObject({ state: "committed" });
          written += 1;
        }
      }
    }
    expect(written).toBe(6); // order x2, conversation x2, confirmation x2 (a confirmation is an order's, so it asks orders.read)
    expect(await db.collaborationComment.count()).toBe(6);
  });
});
