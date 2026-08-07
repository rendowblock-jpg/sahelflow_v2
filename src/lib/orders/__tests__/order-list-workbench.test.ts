import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  count: vi.fn(),
  batchAssessOrders: vi.fn(),
  isTrustedManualOrderAuthority: vi.fn(
    (source: unknown) => source === "canonical",
  ),
  isImportPendingOrderAuthority: vi.fn(
    (source: unknown) => source === "import_pending",
  ),
  shop: Object.freeze({
    workspaceId: "1".repeat(32),
    installationId: "2".repeat(32),
    shopId: "shop-a",
    shopIncarnationId: "3".repeat(32),
    registryRevision: 1,
    databaseFileId: "shop-a.db",
    migrationSetSha256: "4".repeat(64),
  }),
}));

vi.mock("@/lib/db", () => ({
  db: {
    order: {
      findMany: mocks.findMany,
      count: mocks.count,
    },
  },
  shopContext: mocks.shop,
}));

vi.mock("@/lib/risk-engine/service", () => ({
  batchAssessOrders: mocks.batchAssessOrders,
}));

vi.mock("@/lib/orders/manual-order-authority", () => ({
  isTrustedManualOrderAuthority: mocks.isTrustedManualOrderAuthority,
  isImportPendingOrderAuthority: mocks.isImportPendingOrderAuthority,
}));

vi.mock("@/lib/identity/trusted-actor", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/identity/trusted-actor")
  >();
  return { ...actual, isTrustedActorContext: vi.fn(() => true) };
});

import {
  getOrdersWorkbenchPage,
  resolveOrdersWorkbenchAccess,
} from "../order-list-workbench";
import type { Phase2Action } from "@/lib/identity/permissions";
import type { TrustedActorContext } from "@/lib/identity/trusted-actor";

function context(
  role: "owner" | "manager" | "operator" | "viewer",
  permissions?: readonly Phase2Action[],
): TrustedActorContext {
  return {
    version: 1,
    actor: {
      kind: "person",
      personId: "5".repeat(32),
      workspaceMemberId: "6".repeat(32),
      deviceId: "7".repeat(32),
      sessionId: "session-1",
      role,
      policyVersion: 1,
      revocationEpoch: 0,
      ...(permissions ? { permissions } : {}),
    },
    shop: mocks.shop,
  } as TrustedActorContext;
}

function sourceRow(opts: {
  id: string;
  source?: string;
  totalPrice?: number;
  createdAt?: Date;
}) {
  return {
    id: opts.id,
    orderNumber: `ORD-${opts.id}`,
    status: "pending",
    totalPrice: opts.totalPrice ?? 3_500,
    wilaya: "Alger",
    phone: "0555000000",
    createdAt: opts.createdAt ?? new Date("2026-08-01T10:00:00.000Z"),
    source: opts.source ?? "legacy",
    sourceMetadata: null,
    items: [{ id: `item-${opts.id}` }],
    customer: { name: "Customer", phone: "0555000000" },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.count.mockResolvedValue(0);
  mocks.findMany.mockResolvedValue([]);
  mocks.batchAssessOrders.mockResolvedValue(new Map());
});

describe("Orders workbench", () => {
  it("queries a fully authorized page with stable financial sorting and risk", async () => {
    const rows = [
      sourceRow({ id: "a", source: "canonical", totalPrice: 5_000 }),
      sourceRow({ id: "b", source: "import_pending", totalPrice: 5_000 }),
      sourceRow({ id: "c", source: "legacy", totalPrice: 4_000 }),
    ];
    mocks.findMany.mockResolvedValue(rows);
    mocks.count.mockResolvedValue(7);
    mocks.batchAssessOrders.mockResolvedValue(
      new Map([
        ["a", { level: "low", score: 12 }],
        ["b", { level: "high", score: 70 }],
        ["c", { level: "medium", score: 38 }],
      ]),
    );

    const result = await getOrdersWorkbenchPage(context("owner"), {
      page: 2,
      pageSize: 3,
      sort: "totalPrice.desc",
    });

    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          totalPrice: true,
          wilaya: true,
          phone: true,
        }),
        orderBy: [{ totalPrice: "desc" }, { id: "desc" }],
        take: 3,
        skip: 3,
      }),
    );
    expect(mocks.batchAssessOrders).toHaveBeenCalledWith(
      expect.anything(),
      ["a", "b", "c"],
    );
    expect(result).toMatchObject({
      total: 7,
      page: 2,
      pageSize: 3,
      sort: "totalPrice.desc",
      hasNextPage: true,
      fieldAccess: {
        contact: true,
        financials: true,
        risk: true,
        update: true,
        delete: true,
      },
    });
    expect(result.orders.map((order) => order.mutationAuthority)).toEqual([
      "canonical_v1",
      "confirmation_blocked",
      "legacy_compatibility",
    ]);
    expect(result.riskData?.b).toEqual({ level: "high", score: 70 });
  });

  it("does not read or derive protected risk inputs for a viewer", async () => {
    mocks.findMany.mockResolvedValue([
      {
        id: "viewer-order",
        orderNumber: "ORD-viewer",
        status: "pending",
        createdAt: new Date("2026-08-01T10:00:00.000Z"),
        source: "legacy",
        sourceMetadata: null,
        items: [{ id: "item-viewer" }],
      },
    ]);
    mocks.count.mockResolvedValue(1);

    const result = await getOrdersWorkbenchPage(context("viewer"), {
      sort: "totalPrice.asc",
    });

    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          totalPrice: false,
          wilaya: false,
          phone: false,
          customer: false,
        }),
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }),
    );
    expect(mocks.batchAssessOrders).not.toHaveBeenCalled();
    expect(result.fieldAccess).toMatchObject({
      contact: false,
      financials: false,
      risk: false,
      update: false,
      delete: false,
    });
    expect(result.orders[0]).toMatchObject({
      totalPrice: null,
      wilaya: null,
      phone: null,
      customer: null,
    });
    expect(result.sort).toBe("createdAt.desc");
    expect(result.riskData).toBeUndefined();
  });

  it("clamps invalid paging and preserves deterministic order-number sorting", async () => {
    mocks.count.mockResolvedValue(101);

    const result = await getOrdersWorkbenchPage(context("owner"), {
      page: 0,
      pageSize: 1_000,
      sort: "orderNumber.asc",
    });

    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ orderNumber: "asc" }, { id: "asc" }],
        take: 100,
        skip: 0,
      }),
    );
    expect(result).toMatchObject({
      page: 1,
      pageSize: 100,
      total: 101,
      hasNextPage: true,
      sort: "orderNumber.asc",
    });
  });

  it("requires the exact read authority before opening the workbench", () => {
    expect(() =>
      resolveOrdersWorkbenchAccess(
        context("operator", ["customers.contact.read"]),
      ),
    ).toThrow(/orders\.read/);
  });
});
