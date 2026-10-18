/**
 * S03c-06 — PATCH /api/delivery/[id] governance (route level, fake Prisma).
 *
 * The route used to accept any of ten free strings for any delivery with no
 * transition table and no audit row, and it propagates delivered / returned /
 * refused to the order. This file pins the new behaviour without a database
 * (the database-backed behaviour stays in delivery-patch.test.ts):
 *
 *   - an impossible jump is refused with 409 INVALID_TRANSITION before any
 *     transaction opens;
 *   - the status write is a claim on the status that was validated, so a
 *     concurrent change cannot slip past the table;
 *   - one audit row per real status change is written INSIDE the same
 *     transaction, after the order effects, so a rolled-back change leaves no
 *     audit row and a committed change cannot lack one;
 *   - canonical orders stay refused, and rows in booking limbo stay fixable.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

import { ConflictError, InvalidTransitionError } from "@/types/errors";

const h = vi.hoisted(() => {
  const tx = {
    delivery: {
      // `update` is the pre-fix write; it is faked so the old route fails the
      // behavioural assertions below instead of a missing-function crash.
      update: vi.fn(),
      updateMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
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
  };
});

vi.mock("@/lib/api/with-error-handler", () => ({
  withErrorHandler: <T,>(handler: T) => handler,
}));
vi.mock("@/lib/auth/route-authority", () => ({
  requireRouteAuth: vi.fn(async () => undefined),
}));
vi.mock("@/lib/db", () => ({
  db: {
    $transaction: h.transaction,
    order: { findFirst: h.findOrder },
  },
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

import { PATCH } from "@/app/api/delivery/[id]/route";

function request(status: string): NextRequest {
  return new Request("http://localhost/api/delivery/d1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status }),
  }) as unknown as NextRequest;
}

function patch(status: string) {
  return PATCH(request(status), { params: Promise.resolve({ id: "d1" }) });
}

function currentDelivery(status: string) {
  h.getById.mockResolvedValue({
    id: "d1",
    orderId: "o1",
    provider: "yalidine",
    status,
  });
}

function auditData(): Record<string, unknown> {
  expect(h.tx.auditLog.create).toHaveBeenCalledTimes(1);
  const call = h.tx.auditLog.create.mock.calls[0]?.[0] as {
    data: Record<string, unknown>;
  };
  return call.data;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.steps.length = 0;
  currentDelivery("in_transit");
  h.tx.delivery.update.mockImplementation(
    async (args: { where: { id: string }; data: { status: string } }) => {
      h.steps.push("claim");
      return { id: args.where.id, orderId: "o1", status: args.data.status };
    },
  );
  h.findOrder.mockResolvedValue({ source: "manual", sourceMetadata: null });
  h.assertFollowup.mockReset();
  h.transaction.mockImplementation(
    async (work: (tx: typeof h.tx) => Promise<unknown>) => {
      h.steps.push("tx:begin");
      try {
        const out = await work(h.tx);
        h.steps.push("tx:commit");
        return out;
      } catch (error) {
        h.steps.push("tx:rollback");
        throw error;
      }
    },
  );
  let claimedStatus = "";
  h.tx.delivery.updateMany.mockImplementation(
    async (args: { data: { status: string } }) => {
      h.steps.push("claim");
      claimedStatus = args.data.status;
      return { count: 1 };
    },
  );
  h.tx.delivery.findUniqueOrThrow.mockImplementation(async () => ({
    id: "d1",
    orderId: "o1",
    status: claimedStatus,
  }));
  h.updateStatusInTx.mockImplementation(async () => {
    h.steps.push("order-effects");
    return { marker: "effects" };
  });
  h.tx.auditLog.create.mockImplementation(async () => {
    h.steps.push("audit");
    return {};
  });
  h.dispatchStatusTransition.mockImplementation(async () => {
    h.steps.push("dispatch");
  });
});

describe("PATCH /api/delivery/[id] — transition table", () => {
  it("refuses delivered -> in_transit with 409 INVALID_TRANSITION before any transaction", async () => {
    currentDelivery("delivered");
    await expect(patch("in_transit")).rejects.toMatchObject({
      code: "INVALID_TRANSITION",
      statusCode: 409,
    });
    expect(h.transaction).not.toHaveBeenCalled();
    expect(h.tx.delivery.updateMany).not.toHaveBeenCalled();
    expect(h.tx.auditLog.create).not.toHaveBeenCalled();
    expect(h.dispatchStatusTransition).not.toHaveBeenCalled();
  });

  it("refuses any jump out of returned", async () => {
    currentDelivery("returned");
    await expect(patch("delivered")).rejects.toBeInstanceOf(InvalidTransitionError);
    expect(h.transaction).not.toHaveBeenCalled();
  });

  it("keeps the working path: in_transit -> delivered still reaches the order", async () => {
    const res = await patch("delivered");
    expect(res.status).toBe(200);
    expect(h.updateStatusInTx).toHaveBeenCalledWith(
      h.tx,
      "o1",
      "delivered",
      { actor: "system" },
    );
    expect(h.dispatchStatusTransition).toHaveBeenCalledTimes(1);
  });

  it("keeps rows in booking limbo fixable (reconciliation_required -> created)", async () => {
    currentDelivery("reconciliation_required");
    const res = await patch("created");
    expect(res.status).toBe(200);
    expect(JSON.parse(auditData().before as string)).toEqual({
      status: "reconciliation_required",
    });
  });

  it("still refuses canonical orders before anything is written", async () => {
    h.assertFollowup.mockImplementation(() => {
      throw new InvalidTransitionError("canonical", "legacy", []);
    });
    await expect(patch("delivered")).rejects.toBeInstanceOf(InvalidTransitionError);
    expect(h.transaction).not.toHaveBeenCalled();
    expect(h.tx.auditLog.create).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/delivery/[id] — claim on the validated status", () => {
  it("writes the status only where the row still has the status the table was checked against", async () => {
    await patch("delivered");
    expect(h.tx.delivery.updateMany).toHaveBeenCalledTimes(1);
    expect(h.tx.delivery.updateMany).toHaveBeenCalledWith({
      where: { id: "d1", deletedAt: null, status: "in_transit" },
      data: { status: "delivered" },
    });
  });

  it("answers 409 and touches nothing else when another writer changed the row first", async () => {
    h.tx.delivery.updateMany.mockImplementation(async () => {
      h.steps.push("claim");
      return { count: 0 };
    });
    await expect(patch("delivered")).rejects.toBeInstanceOf(ConflictError);
    expect(h.updateStatusInTx).not.toHaveBeenCalled();
    expect(h.tx.auditLog.create).not.toHaveBeenCalled();
    expect(h.dispatchStatusTransition).not.toHaveBeenCalled();
    expect(h.steps).toEqual(["tx:begin", "claim", "tx:rollback"]);
  });
});

describe("PATCH /api/delivery/[id] — audit row", () => {
  it("writes exactly one delivery.status.changed row inside the transaction, after the order effects", async () => {
    await patch("delivered");
    expect(h.steps).toEqual([
      "tx:begin",
      "claim",
      "order-effects",
      "audit",
      "tx:commit",
      "dispatch",
    ]);
    const data = auditData();
    expect(data).toMatchObject({
      action: "delivery.status.changed",
      entity: "delivery",
      entityId: "d1",
      actor: "user",
    });
    expect(JSON.parse(data.before as string)).toEqual({ status: "in_transit" });
    expect(JSON.parse(data.after as string)).toEqual({ status: "delivered" });
    expect(JSON.parse(data.metadata as string)).toEqual({
      orderId: "o1",
      provider: "yalidine",
      orderStatus: "delivered",
      via: "manual_override",
    });
  });

  it("records a status that does not touch the order (in_transit -> at_hub) with a null order status", async () => {
    await patch("at_hub");
    expect(h.updateStatusInTx).not.toHaveBeenCalled();
    expect(h.dispatchStatusTransition).not.toHaveBeenCalled();
    expect(JSON.parse(auditData().metadata as string)).toMatchObject({
      orderStatus: null,
    });
  });

  it("writes no audit row when the order transition fails and the transaction rolls back", async () => {
    h.updateStatusInTx.mockImplementation(async () => {
      h.steps.push("order-effects");
      throw new InvalidTransitionError("confirmed", "delivered", ["shipped"]);
    });
    await expect(patch("delivered")).rejects.toMatchObject({
      code: "INVALID_TRANSITION",
    });
    expect(h.tx.auditLog.create).not.toHaveBeenCalled();
    expect(h.steps).toEqual([
      "tx:begin",
      "claim",
      "order-effects",
      "tx:rollback",
    ]);
  });

  it("writes no audit row for a same-status re-apply, but still re-applies it to the order", async () => {
    currentDelivery("delivered");
    const res = await patch("delivered");
    expect(res.status).toBe(200);
    expect(h.updateStatusInTx).toHaveBeenCalledTimes(1);
    expect(h.tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("never puts a tracking number or contact detail in the audit row", async () => {
    await patch("delivered");
    const data = auditData();
    const text = JSON.stringify(data);
    expect(text).not.toMatch(/tracking/i);
    expect(text).not.toMatch(/phone|address|customer/i);
  });
});
