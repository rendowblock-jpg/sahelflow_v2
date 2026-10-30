/**
 * S03c-08 — POST /api/delivery/[id]/reconcile (route level, fake Prisma).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

import { ConflictError } from "@/types/errors";

const h = vi.hoisted(() => {
  const tx = {
    delivery: { updateMany: vi.fn(), deleteMany: vi.fn(), findUniqueOrThrow: vi.fn() },
    order: { findFirst: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return {
    steps: [] as string[],
    tx,
    transaction: vi.fn(),
    findOrder: vi.fn(),
    getById: vi.fn(),
    updateStatusInTx: vi.fn(),
    dispatchStatusTransition: vi.fn(),
    assertFollowup: vi.fn(),
    requireRouteAuth: vi.fn(),
    requireTrustedAction: vi.fn(),
  };
});

vi.mock("@/lib/api/with-error-handler", () => ({
  withErrorHandler: <T,>(handler: T) => handler,
}));
vi.mock("@/lib/auth/route-authority", () => ({
  requireRouteAuth: h.requireRouteAuth,
}));
vi.mock("@/lib/identity/authorization", () => ({
  requireTrustedAction: h.requireTrustedAction,
  trustedActorAuditIdentity: (actor: { personId: string }) => `person:${actor.personId}`,
}));
vi.mock("@/lib/db", () => ({
  db: { $transaction: h.transaction, order: { findFirst: h.findOrder } },
  shopContext: { shopId: "shop-test" },
}));
vi.mock("@/lib/data/delivery-service", () => ({
  deliveryService: { getById: h.getById },
}));
vi.mock("@/lib/data/order-service", () => ({
  orderService: {
    updateStatusInTx: h.updateStatusInTx,
    dispatchStatusTransition: h.dispatchStatusTransition,
  },
}));
vi.mock("@/lib/orders/manual-order-authority", () => ({
  assertLegacyOrderFollowupAllowed: h.assertFollowup,
}));

import { POST } from "@/app/api/delivery/[id]/reconcile/route";
import { DELIVERY_STATUS_SET } from "@/lib/delivery/delivery-reconcile";

function post(body: unknown) {
  const req = new Request("http://localhost/api/delivery/d1/reconcile", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
  return POST(req, { params: Promise.resolve({ id: "d1" }) });
}
const HAS_IT = { action: "courier-has-it", tracking: "YAL-123" };
const AGAIN = { action: "book-again", confirmedDuplicateRisk: true };

function current(status: string, trackingNumber: string | null = null) {
  h.getById.mockResolvedValue({ id: "d1", orderId: "o1", provider: "yalidine", status, trackingNumber });
}
function audit(): Record<string, unknown> {
  expect(h.tx.auditLog.create).toHaveBeenCalledTimes(1);
  return (h.tx.auditLog.create.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.steps.length = 0;
  current("reconciliation_required");
  h.requireRouteAuth.mockResolvedValue(undefined);
  h.requireTrustedAction.mockResolvedValue({ actor: { kind: "person", personId: "p1" } });
  h.findOrder.mockResolvedValue({ source: "manual", sourceMetadata: null });
  h.assertFollowup.mockReset();
  h.transaction.mockImplementation(async (work: (tx: typeof h.tx) => Promise<unknown>) => {
    h.steps.push("tx:begin");
    try {
      const out = await work(h.tx);
      h.steps.push("tx:commit");
      return out;
    } catch (error) {
      h.steps.push("tx:rollback");
      throw error;
    }
  });
  h.tx.delivery.updateMany.mockImplementation(async () => { h.steps.push("claim"); return { count: 1 }; });
  h.tx.delivery.deleteMany.mockImplementation(async () => { h.steps.push("release"); return { count: 1 }; });
  h.tx.delivery.findUniqueOrThrow.mockResolvedValue({ id: "d1", orderId: "o1", status: "created", trackingNumber: "YAL-123" });
  h.tx.order.findFirst.mockResolvedValue({ status: "confirmed" });
  h.updateStatusInTx.mockImplementation(async () => { h.steps.push("order:shipped"); return { effects: true }; });
  h.tx.auditLog.create.mockImplementation(async () => { h.steps.push("audit"); return {}; });
  h.dispatchStatusTransition.mockImplementation(async () => { h.steps.push("dispatch"); });
});

describe("permission guard", () => {
  it("asks for exactly the actions POST /api/delivery/create asks for, plus the trusted actor", async () => {
    await post(HAS_IT);
    const options = h.requireRouteAuth.mock.calls[0]?.[1] as { actions: string[] };
    expect([...options.actions].sort()).toEqual(
      ["customers.contact.read", "deliveries.manage", "orders.financials.read", "orders.read", "orders.update"],
    );
    expect(h.requireTrustedAction).toHaveBeenCalledWith("deliveries.manage");
  });
  it("a refused caller touches nothing", async () => {
    h.requireRouteAuth.mockRejectedValue(Object.assign(new Error("no"), { code: "ACTION_FORBIDDEN", statusCode: 403 }));
    await expect(post(HAS_IT)).rejects.toMatchObject({ statusCode: 403 });
    expect(h.getById).not.toHaveBeenCalled();
    expect(h.transaction).not.toHaveBeenCalled();
  });
  it("a refused trusted actor touches nothing", async () => {
    h.requireTrustedAction.mockRejectedValue(Object.assign(new Error("no"), { statusCode: 403 }));
    await expect(post(AGAIN)).rejects.toMatchObject({ statusCode: 403 });
    expect(h.transaction).not.toHaveBeenCalled();
  });
});

describe("body validation", () => {
  it.each([
    [{ action: "delete" }],
    [{ action: "courier-has-it" }],
    [{ action: "courier-has-it", tracking: "   " }],
    [{ action: "courier-has-it", tracking: "YAL 123" }],
    [{ action: "book-again" }],
    [{ action: "book-again", confirmedDuplicateRisk: false }],
    [{ action: "book-again", confirmedDuplicateRisk: "yes" }],
  ])("%j is rejected before anything is read or written", async (body) => {
    await expect(post(body)).rejects.toThrow();
    expect(h.getById).not.toHaveBeenCalled();
    expect(h.transaction).not.toHaveBeenCalled();
  });
});

describe("courier-has-it", () => {
  it("claims the stuck row, ships the order, writes one audit row last, then dispatches", async () => {
    const res = await post({ action: "courier-has-it", tracking: "  YAL-123 " });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, noop: false });
    const claim = h.tx.delivery.updateMany.mock.calls[0]?.[0] as { where: Record<string, unknown>; data: Record<string, unknown> };
    expect(claim.where).toMatchObject({ id: "d1", status: "reconciliation_required", deletedAt: null });
    expect(claim.where.OR).toEqual([{ trackingNumber: null }, { trackingNumber: "YAL-123" }]);
    expect(claim.data).toEqual({ trackingNumber: "YAL-123", status: "created" });
    expect(h.updateStatusInTx).toHaveBeenCalledWith(h.tx, "o1", "shipped");
    expect(audit()).toMatchObject({
      action: "delivery.reconciled.courier_has_it",
      entity: "delivery",
      entityId: "d1",
      actor: "person:p1",
    });
    expect(String(audit().metadata)).not.toContain("YAL-123");
    expect(h.steps).toEqual(["tx:begin", "claim", "order:shipped", "audit", "tx:commit", "dispatch"]);
  });
  it("leaves an order that already moved on alone", async () => {
    h.tx.order.findFirst.mockResolvedValue({ status: "shipped" });
    await post(HAS_IT);
    expect(h.updateStatusInTx).not.toHaveBeenCalled();
    expect(h.dispatchStatusTransition).not.toHaveBeenCalled();
    expect(h.tx.auditLog.create).toHaveBeenCalledTimes(1);
  });
  it("the same tracking twice is a no-op: 200, no transaction, no audit row", async () => {
    current("created", "YAL-123");
    const res = await post(HAS_IT);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, noop: true });
    expect(h.transaction).not.toHaveBeenCalled();
    expect(h.tx.auditLog.create).not.toHaveBeenCalled();
  });
  it("a different tracking number than the saved one is a typed 409", async () => {
    current("created", "OTHER-1");
    await expect(post(HAS_IT)).rejects.toMatchObject({ code: "DELIVERY_TRACKING_MISMATCH", statusCode: 409 });
    expect(h.transaction).not.toHaveBeenCalled();
  });
  it("a lost race whose winner saved the same tracking answers no-op, with no audit row", async () => {
    h.tx.delivery.updateMany.mockResolvedValue({ count: 0 });
    h.getById.mockResolvedValueOnce({ id: "d1", orderId: "o1", provider: "yalidine", status: "reconciliation_required", trackingNumber: null });
    h.getById.mockResolvedValueOnce({ id: "d1", orderId: "o1", provider: "yalidine", status: "created", trackingNumber: "YAL-123" });
    const res = await post(HAS_IT);
    expect(await res.json()).toMatchObject({ ok: true, noop: true });
    expect(h.tx.auditLog.create).not.toHaveBeenCalled();
    expect(h.steps).toContain("tx:rollback");
  });
  it("a lost race with a different tracking number is the typed mismatch", async () => {
    h.tx.delivery.updateMany.mockResolvedValue({ count: 0 });
    h.getById.mockResolvedValueOnce({ id: "d1", orderId: "o1", provider: "yalidine", status: "reconciliation_required", trackingNumber: null });
    h.getById.mockResolvedValueOnce({ id: "d1", orderId: "o1", provider: "yalidine", status: "created", trackingNumber: "OTHER-1" });
    await expect(post(HAS_IT)).rejects.toMatchObject({ code: "DELIVERY_TRACKING_MISMATCH", statusCode: 409 });
  });
});

describe("book-again", () => {
  it("removes the empty reservation, writes the audit row, answers what to book", async () => {
    const res = await post(AGAIN);
    expect(await res.json()).toEqual({ ok: true, noop: false, released: true, orderId: "o1", provider: "yalidine" });
    const del = h.tx.delivery.deleteMany.mock.calls[0]?.[0] as { where: Record<string, unknown> };
    expect(del.where).toEqual({ id: "d1", deletedAt: null, status: "reconciliation_required", trackingNumber: null });
    expect(audit()).toMatchObject({ action: "delivery.reconciled.book_again", actor: "person:p1", entityId: "d1" });
    expect(String(audit().metadata)).toContain("duplicateRiskAcknowledged");
    expect(h.updateStatusInTx).not.toHaveBeenCalled();
    expect(h.steps).toEqual(["tx:begin", "release", "audit", "tx:commit"]);
  });
  it("a stuck row that holds a tracking number can never be released", async () => {
    current("reconciliation_required", "YAL-9");
    await expect(post(AGAIN)).rejects.toMatchObject({ code: "DELIVERY_NOT_AWAITING_DECISION" });
    expect(h.tx.delivery.deleteMany).not.toHaveBeenCalled();
  });
  it("a lost race is the typed refusal and writes no audit row", async () => {
    h.tx.delivery.deleteMany.mockResolvedValue({ count: 0 });
    h.getById.mockResolvedValueOnce({ id: "d1", orderId: "o1", provider: "yalidine", status: "reconciliation_required", trackingNumber: null });
    h.getById.mockResolvedValueOnce({ id: "d1", orderId: "o1", provider: "yalidine", status: "pending", trackingNumber: null });
    await expect(post(AGAIN)).rejects.toMatchObject({ code: "DELIVERY_NOT_AWAITING_DECISION", statusCode: 409 });
    expect(h.tx.auditLog.create).not.toHaveBeenCalled();
  });
});

describe("only reconciliation_required may use the actions", () => {
  const others = DELIVERY_STATUS_SET.filter((s) => s !== "reconciliation_required");
  it.each(others.flatMap((s) => [[s, HAS_IT], [s, AGAIN]] as const))(
    "status %s + %j is refused and writes nothing",
    async (status, body) => {
      current(status);
      await expect(post(body)).rejects.toMatchObject({ code: "DELIVERY_NOT_AWAITING_DECISION", statusCode: 409 });
      expect(h.transaction).not.toHaveBeenCalled();
    },
  );
});

describe("canonical orders", () => {
  it("keep their governed path: refused before any write", async () => {
    h.assertFollowup.mockImplementation(() => { throw new ConflictError("canonical"); });
    await expect(post(HAS_IT)).rejects.toBeInstanceOf(ConflictError);
    expect(h.transaction).not.toHaveBeenCalled();
  });
});
