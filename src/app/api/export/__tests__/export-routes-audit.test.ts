/**
 * Route-level tests for the export fixes (S03c-17): the audit row names the
 * entity, the active filter NAMES and the row count; a capped download is
 * reported through response headers instead of ending silently. The database
 * layer is replaced by spies, so these run without Prisma.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  logAudit: vi.fn(async (..._args: unknown[]) => undefined),
  orderCount: vi.fn(async (..._args: unknown[]) => 0),
  orderFindMany: vi.fn(async (..._args: unknown[]) => [] as unknown[]),
  customerCount: vi.fn(async (..._args: unknown[]) => 0),
  customerFindMany: vi.fn(async (..._args: unknown[]) => [] as unknown[]),
}));

vi.mock("@/lib/db", () => ({
  db: {
    order: { count: h.orderCount, findMany: h.orderFindMany },
    customer: { count: h.customerCount, findMany: h.customerFindMany },
  },
  shopContext: { shopId: "default" },
}));
vi.mock("@/lib/auth/server", () => ({
  requireAuth: vi.fn(async () => ({ actor: { kind: "person" }, shop: { shopId: "default" } })),
}));
vi.mock("@/lib/identity/authorization", () => ({
  trustedActorAuditIdentity: () => "person:test",
  trustedActionAllowed: () => true,
}));
vi.mock("@/lib/audit", () => ({ logAudit: h.logAudit }));
vi.mock("@/lib/i18n-server", () => ({
  getI18n: async () => ({ t: (key: string) => key, locale: "en" }),
}));
vi.mock("@/lib/api/with-error-handler", () => ({
  withErrorHandler: (handler: unknown) => handler,
}));
vi.mock("@/lib/orders/order-list-workbench", () => ({
  buildOrdersWorkbenchWhere: async () => ({}),
  ordersWorkbenchOrderBy: () => [],
  resolveOrdersWorkbenchAccess: () => ({ financials: true }),
}));
vi.mock("@/lib/utils", () => ({ intlLocale: () => "en" }));
vi.mock("@/lib/import/export", () => ({ toXlsx: () => new ArrayBuffer(8) }));

import { GET as exportOrders } from "../orders/route";
import { GET as exportCustomers } from "../customers/route";

type Handler = (req: NextRequest) => Promise<Response>;

async function download(handler: unknown, url: string): Promise<Response> {
  const response = await (handler as Handler)(new NextRequest(url));
  await response.arrayBuffer();
  return response;
}

function auditAfter(action: string): Record<string, unknown> | undefined {
  const entries = h.logAudit.mock.calls.map(
    (call) => call[1] as unknown as { action: string; after: Record<string, unknown> },
  );
  return entries.find((entry) => entry.action === action)?.after;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.orderCount.mockResolvedValue(7000);
  h.orderFindMany.mockResolvedValue([]);
  h.customerCount.mockResolvedValue(42);
  h.customerFindMany.mockResolvedValue([]);
});

describe("filtered orders export beyond the cap (S03c-17)", () => {
  const url = "http://localhost/api/export/orders?q=ahmed&wilaya=16";

  it("tells the caller the file was cut (CSV)", async () => {
    const response = await download(exportOrders, url);
    expect(response.headers.get("X-Export-Truncated")).toBe("true");
    expect(response.headers.get("X-Export-Total-Rows")).toBe("7000");
    expect(response.headers.get("X-Export-Row-Limit")).toBe("5000");
    expect(response.headers.get("X-Export-Row-Count")).toBe("5000");
  });

  it("tells the caller the file was cut (XLSX)", async () => {
    const response = await download(exportOrders, `${url}&format=xlsx`);
    expect(response.headers.get("X-Export-Truncated")).toBe("true");
    expect(response.headers.get("X-Export-Row-Count")).toBe("5000");
  });

  it("audits entity, filter names and row count without filter values", async () => {
    await download(exportOrders, url);
    const after = auditAfter("export.orders");
    expect(after).toMatchObject({
      entity: "orders",
      format: "csv",
      rowCount: 5000,
      truncated: true,
      filterNames: ["q", "wilayaCode"],
    });
    expect(JSON.stringify(after)).not.toContain("ahmed");
  });
});

describe("unfiltered orders export (S03c-17)", () => {
  it("streams everything and does not claim truncation", async () => {
    const response = await download(exportOrders, "http://localhost/api/export/orders");
    expect(response.headers.get("X-Export-Truncated")).toBeNull();
    expect(response.headers.get("X-Export-Row-Count")).toBe("7000");
    expect(auditAfter("export.orders")).toMatchObject({
      rowCount: 7000,
      truncated: false,
      filterNames: [],
    });
  });
});

describe("customers export audit (S03c-17)", () => {
  it("records the row count and keeps the financials flag", async () => {
    const response = await download(exportCustomers, "http://localhost/api/export/customers");
    expect(response.headers.get("X-Export-Row-Count")).toBe("42");
    expect(auditAfter("export.customers")).toMatchObject({
      entity: "customers",
      format: "csv",
      rowCount: 42,
      truncated: false,
      financials: true,
    });
  });
});
