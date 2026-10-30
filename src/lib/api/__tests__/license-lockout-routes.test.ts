/**
 * IDN-03, at route level: with a lapsed licence the seller's data can still
 * leave (every entity export, the backup list, a local backup) while operating
 * the shop (orders, restore, delete, ...) is refused with the existing lockout
 * response. The real withErrorHandler and the real route handlers run; only the
 * licence authority, identity, database and logging are stand-ins.
 */
import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SahelFlowError } from "@/types/errors";

const h = vi.hoisted(() => ({
  licence: { valid: false },
  requireLicense: vi.fn(),
  requireAuth: vi.fn(),
  createManualOrder: vi.fn(),
}));

vi.mock("@/lib/license/license-authority", () => ({ requireLicenseEntitlement: h.requireLicense }));
vi.mock("@/lib/shops/authority", () => ({ assertProcessShopAuthority: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/monitoring/sentry", () => ({ captureError: vi.fn() }));
vi.mock("@/lib/redact-pii", () => ({ redactError: (error: unknown) => error }));
vi.mock("@/lib/auth/server", () => ({ requireAuth: h.requireAuth }));
vi.mock("@/lib/identity/authorization", () => ({
  trustedActorAuditIdentity: () => "actor-1",
  trustedActionAllowed: () => true,
}));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => undefined) }));
vi.mock("@/lib/i18n-server", () => ({
  getI18n: async () => ({ t: (key: string) => key, locale: "en" }),
}));
vi.mock("@/lib/orders/manual-order", () => ({ createTrustedManualOrder: h.createManualOrder }));
vi.mock("@/lib/orders/order-list-workbench", () => ({
  resolveOrdersWorkbenchAccess: () => ({ financials: true }),
  buildOrdersWorkbenchWhere: async () => ({ deletedAt: null }),
  ordersWorkbenchOrderBy: () => [{ createdAt: "desc" }],
}));
// Every table answers "no rows", so each export streams just its header row.
vi.mock("@/lib/db", () => ({
  db: new Proxy(
    {},
    {
      get: () => ({
        count: async () => 0,
        findMany: async () => [],
        aggregate: async () => ({ _sum: {} }),
        groupBy: async () => [],
      }),
    },
  ),
  shopContext: { shopId: "default", registryRevision: 1, workspaceId: "1".repeat(32) },
}));

import { GET as customersExport } from "@/app/api/export/customers/route";
import { GET as deliveriesExport } from "@/app/api/export/deliveries/route";
import { GET as expensesExport } from "@/app/api/export/expenses/route";
import { GET as ordersExport } from "@/app/api/export/orders/route";
import { GET as productsExport } from "@/app/api/export/products/route";
import { GET as returnsExport } from "@/app/api/export/returns/route";
import { POST as createOrder } from "@/app/api/orders/route";
import { withErrorHandler } from "@/lib/api/with-error-handler";

type RouteHandler = (request: NextRequest) => Promise<Response>;

const LAPSED = new SahelFlowError("Your trial has ended", "LICENSE_EXPIRED", 403);
const request = (method: string, path: string) =>
  new NextRequest(`http://localhost${path}`, { method });

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  h.licence.valid = false;
  h.requireLicense.mockReset();
  h.requireLicense.mockImplementation(async () => {
    if (!h.licence.valid) throw LAPSED;
    return { status: "valid" };
  });
  h.requireAuth.mockReset();
  h.requireAuth.mockResolvedValue({
    actor: { kind: "person", personId: "5".repeat(32), role: "owner" },
    shop: { shopId: "default" },
  });
  h.createManualOrder.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("lapsed licence: the data still leaves", () => {
  const exportsByEntity: ReadonlyArray<readonly [string, RouteHandler]> = [
    ["orders", ordersExport],
    ["customers", customersExport],
    ["products", productsExport],
    ["deliveries", deliveriesExport],
    ["returns", returnsExport],
    ["expenses", expensesExport],
  ];

  it.each(exportsByEntity)("GET /api/export/%s answers 200 and a file", async (entity, route) => {
    const response = await route(request("GET", `/api/export/${entity}?format=csv`));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toMatch(/^attachment/);
    expect(h.requireLicense).not.toHaveBeenCalled();
    expect(h.requireAuth).toHaveBeenCalledTimes(1);
  });

  it("GET /api/orders and POST /api/orders are still refused with the lockout response", async () => {
    const created = await createOrder(request("POST", "/api/orders"));
    expect(created.status).toBe(403);
    expect(await created.json()).toEqual({ error: "Your trial has ended", code: "LICENSE_EXPIRED" });
    expect(h.requireAuth).not.toHaveBeenCalled();
    expect(h.createManualOrder).not.toHaveBeenCalled();
  });

  it("an export is refused for a write method even on the export path", async () => {
    const handler = vi.fn(async () => NextResponse.json({ ok: true }));
    const wrapped = withErrorHandler(handler, "POST /api/export/orders") as unknown as RouteHandler;
    const response = await wrapped(request("POST", "/api/export/orders"));
    expect(response.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("lapsed licence: everything that operates the shop stays locked", () => {
  const LOCKED: ReadonlyArray<readonly [string, string]> = [
    ["GET", "/api/orders"],
    ["POST", "/api/orders"],
    ["PUT", "/api/orders/abc"],
    ["PATCH", "/api/customers/abc"],
    ["DELETE", "/api/products/abc"],
    ["POST", "/api/whatsapp/send"],
    ["POST", "/api/ai/chat"],
    ["POST", "/api/backup/restore"],
    ["POST", "/api/backup/recovery-kit"],
    ["DELETE", "/api/backup/sahelflow-backup-shop-2026-01-01T00-00-00-000Z.db"],
    ["GET", "/api/backup/create"],
    ["POST", "/api/backup/list"],
    ["GET", "/api/exports-evil"],
    ["GET", "/api/backup/../orders"],
  ];

  it.each(LOCKED)("%s %s is refused and the handler never runs", async (method, path) => {
    const handler = vi.fn(async () => NextResponse.json({ ok: true }));
    const wrapped = withErrorHandler(handler, `${method} ${path}`) as unknown as RouteHandler;
    const response = await wrapped(request(method, path));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "LICENSE_EXPIRED" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("the data-safe calls pass the gate", async () => {
    for (const [method, path] of [
      ["GET", "/api/backup/list"],
      ["POST", "/api/backup/create"],
      ["GET", "/api/license/status"],
      ["POST", "/api/auth/login"],
    ] as const) {
      const handler = vi.fn(async () => NextResponse.json({ ok: true }));
      const wrapped = withErrorHandler(handler, `${method} ${path}`) as unknown as RouteHandler;
      const response = await wrapped(request(method, path));
      expect(response.status, `${method} ${path}`).toBe(200);
      expect(handler).toHaveBeenCalledTimes(1);
    }
  });
});

describe("a valid licence", () => {
  it("still lets a write through the gate (the lockout is not blanket-off)", async () => {
    h.licence.valid = true;
    const handler = vi.fn(async () => NextResponse.json({ ok: true }));
    const wrapped = withErrorHandler(handler, "POST /api/orders") as unknown as RouteHandler;
    const response = await wrapped(request("POST", "/api/orders"));
    expect(response.status).toBe(200);
    expect(h.requireLicense).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
