/**
 * Integration tests for the COD reconciliation routes — Phase 7 priority group 4.
 *
 * Covers:
 *   - GET  /api/accounting/cod-reconciliation       — summary counts + amounts
 *   - POST /api/accounting/cod-reconciliation/bulk   — bulk mark COD as remitted
 *
 * These routes power the Algerian-COD reconciliation page (Phase 4 feature):
 * sellers match courier remittances against orders. The bulk route's
 * idempotency (only updates codCollected=true AND codRemitted=false orders)
 * is the key correctness invariant — verified here.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { rawDb, cleanDb, mockPost, getJson } from "@/app/api/__tests__/helpers";

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: () => undefined,
    set: () => undefined,
    delete: () => undefined,
  })),
}));

import { GET as GETSummary } from "@/app/api/accounting/cod-reconciliation/route";
import { POST as POSTBulk } from "@/app/api/accounting/cod-reconciliation/bulk/route";

process.env.SF_MASTER_KEY = process.env.SF_MASTER_KEY ?? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

let _custCounter = 0;
async function seedCustomer() {
  _custCounter++;
  return rawDb.customer.create({
    data: {
      name: `COD Cust ${_custCounter}`,
      phone: `0770${String(_custCounter).padStart(6, "0")}`,
      nameBlindIndex: `cod-cust-blind-${_custCounter}`,
      wilaya: "Alger",
      commune: "Bab Ezzouar",
      address: "123 Rue",
    },
  });
}

type CodState = "delivered-only" | "collected" | "remitted" | "uncollected";

/** Seed an order with the given COD state. Returns the order. */
async function seedOrderWithCodState(state: CodState, totalPrice = 5000) {
  const customer = await seedCustomer();
  const status =
    state === "delivered-only" ? "delivered" :
    state === "uncollected" ? "delivered" :
    "delivered"; // collected + remitted orders are also delivered
  const codCollected = state === "collected" || state === "remitted";
  const codRemitted = state === "remitted";
  return rawDb.order.create({
    data: {
      orderNumber: `ORD-COD-${state}-${_custCounter}`,
      status,
      customerId: customer.id,
      totalPrice,
      deliveryCost: 600,
      wilaya: "Alger",
      commune: "Bab Ezzouar",
      address: "123 Rue",
      phone: "0770000001",
      source: "manual",
      deliveredAt: new Date(),
      codCollected,
      codCollectedAt: codCollected ? new Date() : null,
      codRemitted,
      codRemittedAt: codRemitted ? new Date() : null,
      codRemittanceRef: codRemitted ? "BANK-REF-001" : null,
    },
  });
}

describe("GET /api/accounting/cod-reconciliation — summary", () => {
  beforeEach(async () => { await cleanDb(); });
  afterAll(async () => { await rawDb.$disconnect(); });

  it("returns zeroed summary on a clean DB", async () => {
    const res = await GETSummary(new Request("http://localhost/api/accounting/cod-reconciliation") as never);
    expect(res.status).toBe(200);
    const body = await getJson(res);
    expect(body.counts).toEqual({ delivered: 0, collected: 0, remitted: 0, uncollected: 0 });
    expect(body.totalCollectedAmount).toBe(0);
    expect(body.totalRemittedAmount).toBe(0);
    expect(body.pendingAmount).toBe(0);
    expect(body.pendingRemittance).toEqual([]);
  });

  it("counts orders in each COD state + computes pending amount", async () => {
    // 2 collected (not remitted) at 5000 each, 1 remitted at 3000, 1 uncollected, 1 delivered-only
    await seedOrderWithCodState("collected", 5000);
    await seedOrderWithCodState("collected", 5000);
    await seedOrderWithCodState("remitted", 3000);
    await seedOrderWithCodState("uncollected", 4000);
    await seedOrderWithCodState("delivered-only", 2000);

    const res = await GETSummary(new Request("http://localhost/api/accounting/cod-reconciliation") as never);
    expect(res.status).toBe(200);
    const body = await getJson(res);
    const counts = body.counts as { delivered: number; collected: number; remitted: number; uncollected: number };
    // delivered = 5 (all 5 are status="delivered")
    expect(counts.delivered).toBe(5);
    // collected = 3 (2 collected + 1 remitted — remitted implies collected)
    expect(counts.collected).toBe(3);
    // remitted = 1
    expect(counts.remitted).toBe(1);
    // uncollected = status=delivered AND codCollected=false → 2 (uncollected + delivered-only)
    expect(counts.uncollected).toBe(2);

    // totalCollectedAmount = 5000 + 5000 + 3000 = 13000
    expect(body.totalCollectedAmount).toBe(13000);
    // totalRemittedAmount = 3000
    expect(body.totalRemittedAmount).toBe(3000);
    // pendingAmount = 13000 - 3000 = 10000
    expect(body.pendingAmount).toBe(10000);

    // pendingRemittance list contains the 2 collected-not-remitted orders
    const pending = body.pendingRemittance as Array<{ id: string }>;
    expect(pending).toHaveLength(2);
  });

  it("returns 401 when auth is set up but no session cookie is present", async () => {
    await rawDb.authSecret.create({
      data: { id: "default", secret: "test-secret-32-chars-long-aaaa", pinHash: "fake-hash" },
    });
    const res = await GETSummary(new Request("http://localhost/api/accounting/cod-reconciliation") as never);
    expect(res.status).toBe(401);
  });
});

describe("POST /api/accounting/cod-reconciliation/bulk — bulk mark remitted", () => {
  beforeEach(async () => { await cleanDb(); });
  afterAll(async () => { await rawDb.$disconnect(); });

  it("marks collected-not-remitted orders as remitted + records ledger entries", async () => {
    const o1 = await seedOrderWithCodState("collected", 5000);
    const o2 = await seedOrderWithCodState("collected", 3000);
    const o3 = await seedOrderWithCodState("collected", 2000);

    const res = await POSTBulk(
      mockPost("http://localhost/api/accounting/cod-reconciliation/bulk", {
        orderIds: [o1.id, o2.id, o3.id],
        remittanceRef: "BANK-2024-001",
      }),
    );
    expect(res.status).toBe(200);
    const body = await getJson(res);
    expect(body.updated).toBe(3);
    expect(body.total).toBe(3);

    // All 3 orders now have codRemitted=true + codRemittanceRef set
    const updated = await rawDb.order.findMany({ where: { id: { in: [o1.id, o2.id, o3.id] } } });
    expect(updated.every((o) => o.codRemitted === true)).toBe(true);
    expect(updated.every((o) => o.codRemittanceRef === "BANK-2024-001")).toBe(true);
    expect(updated.every((o) => o.codRemittedAt !== null)).toBe(true);

    // Ledger entries recorded for each
    const ledger = await rawDb.orderChange.findMany({
      where: { actionType: "cod_remitted", orderId: { in: [o1.id, o2.id, o3.id] } },
    });
    expect(ledger).toHaveLength(3);
  });

  it("skips orders that are not collected (idempotency — only updates collected+not-remitted)", async () => {
    const collected = await seedOrderWithCodState("collected", 5000);
    const uncollected = await seedOrderWithCodState("uncollected", 4000); // codCollected=false
    const alreadyRemitted = await seedOrderWithCodState("remitted", 3000); // codRemitted=true

    const res = await POSTBulk(
      mockPost("http://localhost/api/accounting/cod-reconciliation/bulk", {
        orderIds: [collected.id, uncollected.id, alreadyRemitted.id],
        remittanceRef: "BANK-2024-002",
      }),
    );
    expect(res.status).toBe(200);
    const body = await getJson(res);
    // Only the collected one should have been updated
    expect(body.updated).toBe(1);
    expect(body.total).toBe(3);

    // Verify DB state
    const collectedRow = await rawDb.order.findUnique({ where: { id: collected.id } });
    expect(collectedRow!.codRemitted).toBe(true);
    const uncollectedRow = await rawDb.order.findUnique({ where: { id: uncollected.id } });
    expect(uncollectedRow!.codRemitted).toBe(false); // unchanged
    const remittedRow = await rawDb.order.findUnique({ where: { id: alreadyRemitted.id } });
    expect(remittedRow!.codRemitted).toBe(true); // unchanged (was already true)
    // remittedRef unchanged for the already-remitted order
    expect(remittedRow!.codRemittanceRef).toBe("BANK-REF-001");
  });

  it("returns updated=0 when no candidate orders exist", async () => {
    const o1 = await seedOrderWithCodState("uncollected", 5000);
    const res = await POSTBulk(
      mockPost("http://localhost/api/accounting/cod-reconciliation/bulk", {
        orderIds: [o1.id],
        remittanceRef: "BANK-2024-003",
      }),
    );
    expect(res.status).toBe(200);
    const body = await getJson(res);
    expect(body.updated).toBe(0);
    expect(body.total).toBe(1);
  });

  it("returns 400 on missing remittanceRef", async () => {
    const o1 = await seedOrderWithCodState("collected", 5000);
    const res = await POSTBulk(
      mockPost("http://localhost/api/accounting/cod-reconciliation/bulk", {
        orderIds: [o1.id],
        remittanceRef: "",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 on empty orderIds array", async () => {
    const res = await POSTBulk(
      mockPost("http://localhost/api/accounting/cod-reconciliation/bulk", {
        orderIds: [],
        remittanceRef: "BANK-X",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 401 when auth is set up but no session cookie is present", async () => {
    await rawDb.authSecret.create({
      data: { id: "default", secret: "test-secret-32-chars-long-aaaa", pinHash: "fake-hash" },
    });
    const res = await POSTBulk(
      mockPost("http://localhost/api/accounting/cod-reconciliation/bulk", {
        orderIds: ["x"],
        remittanceRef: "BANK-X",
      }),
    );
    expect(res.status).toBe(401);
  });
});
