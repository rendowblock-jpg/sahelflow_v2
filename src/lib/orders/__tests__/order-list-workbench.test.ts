import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  count: vi.fn(),
  groupBy: vi.fn(),
  deriveExistingShopBlindIndex: vi.fn(),
  batchAssessOrdersForWorkbench: vi.fn(),
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
      groupBy: mocks.groupBy,
    },
  },
  shopContext: mocks.shop,
}));

vi.mock("@/lib/crypto/protected-record", () => ({
  deriveExistingShopBlindIndex: mocks.deriveExistingShopBlindIndex,
}));

vi.mock("@/lib/orders/order-risk-workbench", () => ({
  batchAssessOrdersForWorkbench: mocks.batchAssessOrdersForWorkbench,
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
  getOrdersWorkbenchStatusCounts,
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
  mocks.groupBy.mockResolvedValue([]);
  mocks.batchAssessOrdersForWorkbench.mockResolvedValue(new Map());
  mocks.deriveExistingShopBlindIndex.mockResolvedValue(null);
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
    mocks.batchAssessOrdersForWorkbench.mockResolvedValue(
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
    expect(mocks.batchAssessOrdersForWorkbench).toHaveBeenCalledWith(
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
    expect(mocks.batchAssessOrdersForWorkbench).not.toHaveBeenCalled();
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

  it("composes the free-text search across order number and contact-gated branches", async () => {
    mocks.count.mockResolvedValue(2);
    mocks.deriveExistingShopBlindIndex.mockImplementation(
      async (_prisma, value, reference) =>
        `idx:${reference.recordType}:${reference.field}:${value}`,
    );

    await getOrdersWorkbenchPage(context("owner"), { q: "ORD-1" });

    const where = mocks.findMany.mock.calls[0]?.[0]?.where;
    // NODE_ENV=test keeps the plaintext fallback branches that mirror the
    // command-palette search contract (order-extensions).
    expect(where).toMatchObject({
      deletedAt: null,
      AND: [
        {
          OR: [
            { orderNumber: { contains: "ORD-1" } },
            { wilaya: { contains: "ORD-1" } },
            {
              phoneBlindIndex: { in: ["idx:Order:phone:ORD-1"] },
            },
            {
              customer: {
                nameBlindIndex: { in: ["idx:Customer:name:ord-1"] },
              },
            },
            { phone: { contains: "ORD-1" } },
            { customer: { name: { contains: "ORD-1" } } },
          ],
        },
      ],
    });

    // A viewer without contact read authority may still scope by order number,
    // but never by wilaya, phone or customer name.
    mocks.findMany.mockClear();
    await getOrdersWorkbenchPage(context("viewer"), { q: "ORD-1" });
    const viewerWhere = mocks.findMany.mock.calls[0]?.[0]?.where;
    expect(viewerWhere?.AND?.[0]).toEqual({
      OR: [{ orderNumber: { contains: "ORD-1" } }],
    });
  });

  it("maps the wilaya code to the stored English wilaya name", async () => {
    mocks.count.mockResolvedValue(1);

    await getOrdersWorkbenchPage(context("owner"), { wilayaCode: 16 });

    expect(mocks.findMany.mock.calls[0]?.[0]?.where).toMatchObject({
      wilaya: "Alger",
    });

    // Unknown codes degrade to an unfiltered list rather than a dead end.
    mocks.findMany.mockClear();
    await getOrdersWorkbenchPage(context("owner"), { wilayaCode: 999 });
    expect(mocks.findMany.mock.calls[0]?.[0]?.where).not.toHaveProperty(
      "wilaya",
    );
  });

  it("applies date-only bounds as inclusive whole UTC days", async () => {
    mocks.count.mockResolvedValue(0);

    await getOrdersWorkbenchPage(context("owner"), {
      dateFrom: "2026-08-01",
      dateTo: "2026-08-29",
    });

    expect(mocks.findMany.mock.calls[0]?.[0]?.where).toMatchObject({
      createdAt: {
        gte: new Date("2026-08-01T00:00:00.000Z"),
        lt: new Date("2026-08-30T00:00:00.000Z"),
      },
    });

    // Invalid date input is ignored instead of producing a dead range.
    mocks.findMany.mockClear();
    await getOrdersWorkbenchPage(context("owner"), { dateFrom: "not-a-date" });
    expect(mocks.findMany.mock.calls[0]?.[0]?.where).not.toHaveProperty(
      "createdAt",
    );
  });

  it("keeps total bounds behind the financials authority and echoes applied filters", async () => {
    mocks.count.mockResolvedValue(0);

    const ownerResult = await getOrdersWorkbenchPage(context("owner"), {
      q: "  ORD-9  ",
      wilayaCode: 16,
      dateFrom: "2026-08-01",
      dateTo: "2026-08-29",
      minTotal: 1_000,
      maxTotal: 9_000,
    });
    expect(mocks.findMany.mock.calls[0]?.[0]?.where).toMatchObject({
      totalPrice: { gte: 1_000, lte: 9_000 },
    });
    expect(ownerResult.appliedFilters).toEqual({
      q: "ORD-9",
      wilaya: "16",
      dateFrom: "2026-08-01",
      dateTo: "2026-08-29",
      minTotal: 1_000,
      maxTotal: 9_000,
    });

    // Without financials read the total bound must not filter (nor leak that
    // any order falls inside the asked range).
    mocks.findMany.mockClear();
    const viewerResult = await getOrdersWorkbenchPage(context("viewer"), {
      minTotal: 1_000,
    });
    expect(mocks.findMany.mock.calls[0]?.[0]?.where).not.toHaveProperty(
      "totalPrice",
    );
    expect(viewerResult.appliedFilters).toMatchObject({ minTotal: null });
  });

  it("counts status groups through the active list filters", async () => {
    mocks.groupBy.mockResolvedValue([
      { status: "pending", _count: { _all: 3 } },
      { status: "delivered", _count: { _all: 4 } },
    ]);

    const { counts, total } = await getOrdersWorkbenchStatusCounts(
      context("owner"),
      { q: "ORD", wilayaCode: 16 },
    );

    const where = mocks.groupBy.mock.calls[0]?.[0]?.where;
    expect(where).toMatchObject({ wilaya: "Alger" });
    expect(where).not.toHaveProperty("status");
    expect(counts).toEqual({ all: 7, delivered: 4, pending: 3 });
    expect(total).toBe(7);
  });
});
