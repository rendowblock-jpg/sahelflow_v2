process.env.SF_MASTER_KEY = process.env.SF_MASTER_KEY ?? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const localeHolder: { value?: string } = {};
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => name === "sahelflow-locale" && localeHolder.value
      ? { value: localeHolder.value }
      : undefined,
    set: () => undefined,
    delete: () => undefined,
  })),
}));

const mockDeliveryAdapter = {
  id: "yalidine" as const,
  name: "Yalidine",
  logo: "📦",
  estimateCost: vi.fn(),
  createShipment: vi.fn(),
  syncTracking: vi.fn(),
};
vi.mock("@/lib/integrations/delivery", () => ({
  getDeliveryAdapter: vi.fn(() => mockDeliveryAdapter),
  loadDeliveryCredentials: vi.fn().mockResolvedValue({ apiId: "x", apiToken: "y" }),
}));

const { listOrdersMock, mockCredsProvider } = vi.hoisted(() => ({
  listOrdersMock: vi.fn(),
  mockCredsProvider: vi.fn(),
}));
vi.mock("@/lib/integrations/ecommerce/index", () => ({
  getEcommerceAdapter: vi.fn(() => ({
    platform: "shopify" as const,
    displayName: "Shopify",
    listOrdersSince: listOrdersMock,
  })),
  loadEcommerceCredentials: vi.fn((_context: unknown, platform: string) =>
    mockCredsProvider(platform)),
}));

import { getJson, mockGet, mockPost, rawDb } from "@/app/api/__tests__/helpers";
import { GET as notificationsGet } from "@/app/api/notifications/route";
import { POST as deliveryCreatePost } from "@/app/api/delivery/create/route";
import { POST as deliverySyncPost } from "@/app/api/delivery/sync/route";
import { PATCH as deliveryPatch } from "@/app/api/delivery/[id]/route";
import { GET as confirmationQueueGet } from "@/app/api/orders/confirmation-queue/route";
import { analyticsService } from "@/lib/data/analytics";
import { getCodReconciliationSummary, markCodCollected } from "@/lib/data/cod-service";
import { getConfirmationQueue, getStaleOrderCount } from "@/lib/data/confirmation-queue";
import { courierDeliveryRate, deliveryRate, grossRevenue, netRevenue, realizedRevenue } from "@/lib/data/metrics";
import { orderService } from "@/lib/data/order-service";
import { statsService } from "@/lib/data/stats-service";
import { TEST_SHOP_CONTEXT } from "@/lib/data/__tests__/helpers";
import { createBackup, deleteBackup, restoreBackup } from "@/lib/backup";
import { invalidateMetaCache, invalidateShopClient } from "@/lib/db";
import { syncPlatform } from "@/lib/integrations/ecommerce/sync-engine";
import type { NormalizedOrder, SyncFetchResult } from "@/lib/integrations/ecommerce/types";

async function cleanAll(): Promise<void> {
  for (const table of [
    "CompensationFact", "ProjectionInvalidation", "FinancialMovement",
    "InventoryMovement", "InventoryReservation", "OutboxIntent", "DomainEvent",
    "BusinessCommand", "BusinessAggregateVersion",
  ]) {
    await rawDb.$executeRawUnsafe(`DELETE FROM "${table}"`);
  }
  await rawDb.$transaction([
    rawDb.auditLog.deleteMany(),
    rawDb.session.deleteMany(),
    rawDb.orderChange.deleteMany(),
    rawDb.delivery.deleteMany(),
    rawDb.returnNote.deleteMany(),
    rawDb.return.deleteMany(),
    rawDb.refund.deleteMany(),
    rawDb.orderItem.deleteMany(),
    rawDb.order.deleteMany(),
    rawDb.productVariant.deleteMany(),
    rawDb.product.deleteMany(),
    rawDb.category.deleteMany(),
    rawDb.customer.deleteMany(),
    rawDb.expense.deleteMany(),
    rawDb.counter.deleteMany(),
    rawDb.setting.deleteMany(),
    rawDb.authSecret.deleteMany(),
    rawDb.storefrontConfig.deleteMany(),
    rawDb.whatsAppTemplate.deleteMany(),
    rawDb.integration.deleteMany(),
    rawDb.automationLog.deleteMany(),
    rawDb.automation.deleteMany(),
    rawDb.aiChatMessage.deleteMany(),
    rawDb.aiChatSession.deleteMany(),
    rawDb.extractionMetric.deleteMany(),
    rawDb.wilayaRiskProfile.deleteMany(),
    rawDb.phoneReputation.deleteMany(),
  ]);
  localeHolder.value = undefined;
}

beforeEach(async () => {
  await cleanAll();
  mockDeliveryAdapter.createShipment.mockReset();
  mockDeliveryAdapter.syncTracking.mockReset();
  listOrdersMock.mockReset();
  mockCredsProvider.mockReset();
  mockCredsProvider.mockResolvedValue({ shop: "test", accessToken: "tok" });
});
afterAll(async () => {
  await cleanAll();
  await rawDb.$disconnect();
});

let sequence = 0;
async function seedCategory() {
  sequence += 1;
  return rawDb.category.create({ data: { name: `Integrity ${sequence}` } });
}
async function seedProduct(options: {
  stock?: number;
  threshold?: number;
  active?: boolean;
  name?: string;
} = {}) {
  const category = await seedCategory();
  return rawDb.product.create({
    data: {
      name: options.name ?? `Product ${sequence}`,
      price: 2500,
      stock: options.stock ?? 100,
      lowStockThreshold: options.threshold ?? 5,
      categoryId: category.id,
      isActive: options.active ?? true,
    },
  });
}
async function seedCustomer(options: { name?: string; phone?: string } = {}) {
  sequence += 1;
  const phone = options.phone ?? `0555${String(sequence).padStart(6, "0")}`;
  return rawDb.customer.create({
    data: {
      name: options.name ?? `Customer ${sequence}`,
      phone,
      nameBlindIndex: `integrity-${sequence}`,
      wilaya: "Alger",
      commune: "Bab Ezzouar",
      address: "123 Rue Didouche",
    },
  });
}
async function seedOrder(options: {
  customerId: string;
  productId?: string;
  quantity?: number;
  totalPrice?: number;
  status?: string;
  source?: string;
  createdAt?: Date;
  deliveredAt?: Date;
}) {
  sequence += 1;
  const quantity = options.quantity ?? 1;
  const totalPrice = options.totalPrice ?? 1000;
  return rawDb.order.create({
    data: {
      orderNumber: `INT-${sequence}`,
      status: options.status ?? "draft",
      customerId: options.customerId,
      totalPrice,
      deliveryCost: 0,
      wilaya: "Alger",
      commune: "Bab Ezzouar",
      address: "123 Rue Didouche",
      phone: "0555123456",
      source: options.source ?? "manual",
      ...(options.createdAt ? { createdAt: options.createdAt } : {}),
      ...(options.deliveredAt ? { deliveredAt: options.deliveredAt } : {}),
      items: {
        create: [{
          productId: options.productId ?? null,
          productName: "Integrity product",
          quantity,
          unitPrice: Math.floor(totalPrice / quantity),
          total: totalPrice,
        }],
      },
    },
    include: { items: true },
  });
}
async function configureAutomation(trigger: string) {
  return rawDb.automation.create({
    data: {
      name: `${trigger} notifier`,
      trigger,
      action: "send_notification",
      config: JSON.stringify({ messageTemplate: `Fired ${trigger}` }),
      isActive: true,
    },
  });
}
async function waitForDispatch(automationId: string, trigger: string) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const [logs, automation] = await Promise.all([
      rawDb.automationLog.findMany({ where: { automationId, trigger } }),
      rawDb.automation.findUnique({ where: { id: automationId } }),
    ]);
    if (logs.length > 0 && (automation?.runCount ?? 0) > 0) return logs;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return rawDb.automationLog.findMany({ where: { automationId, trigger } });
}
async function latestStatusChange(orderId: string) {
  const row = await rawDb.orderChange.findFirst({
    where: { orderId, actionType: "status_change" },
    orderBy: { createdAt: "desc" },
  });
  return JSON.parse(row?.payload ?? "{}") as { from?: string; to?: string };
}

describe("Scenario 1 — order creation integrity", () => {
  it("writes the created ledger and all read models agree", async () => {
    const automation = await configureAutomation("order.created");
    const customer = await seedCustomer();
    const product = await seedProduct({ stock: 10 });
    const order = await orderService.create({ prisma: rawDb as never }, {
      customerId: customer.id,
      items: [{ productId: product.id, productName: product.name, quantity: 5, unitPrice: 1000 }],
      wilaya: "Alger",
      commune: "Bab Ezzouar",
      address: "123 Rue Didouche",
      phone: "0555123456",
      source: "manual",
    });
    expect(await rawDb.orderChange.count({ where: { orderId: order.id, actionType: "created" } })).toBe(1);
    expect((await rawDb.product.findUnique({ where: { id: product.id } }))?.stock).toBe(10);
    expect((await waitForDispatch(automation.id, "order.created")).length).toBeGreaterThan(0);
    expect((await statsService.getDashboard({ prisma: rawDb as never })).ordersToday).toBe(1);
    expect((await analyticsService.getReport({ prisma: rawDb as never }, 30)).summary.totalOrders).toBe(1);
    const groups = await rawDb.order.groupBy({ by: ["status"], where: { deletedAt: null }, _count: { _all: true } });
    expect(groups.reduce((sum, row) => sum + row._count._all, 0)).toBe(1);
  });
});

describe("Scenario 2 — canonical confirmation integrity", () => {
  it("reserves stock, writes truth facts, dispatches and exits the queue", async () => {
    const automation = await configureAutomation("order.confirmed");
    const customer = await seedCustomer();
    const product = await seedProduct({ stock: 10 });
    const order = await seedOrder({ customerId: customer.id, productId: product.id, quantity: 5, totalPrice: 5000, status: "pending" });
    expect((await getConfirmationQueue()).some((row) => row.id === order.id)).toBe(true);
    await orderService.updateStatus({ prisma: rawDb as never }, order.id, "confirmed");
    expect((await rawDb.product.findUnique({ where: { id: product.id } }))?.stock).toBe(5);
    expect(await latestStatusChange(order.id)).toMatchObject({ from: "pending", to: "confirmed" });
    const reservations = await rawDb.$queryRaw<Array<{ total: number | bigint }>>`SELECT COUNT(*) AS total FROM "InventoryReservation" WHERE "orderId" = ${order.id}`;
    const movements = await rawDb.$queryRaw<Array<{ total: number | bigint }>>`SELECT COUNT(*) AS total FROM "InventoryMovement" WHERE "orderId" = ${order.id}`;
    expect(Number(reservations[0]?.total ?? 0)).toBe(1);
    expect(Number(movements[0]?.total ?? 0)).toBe(1);
    expect((await waitForDispatch(automation.id, "order.confirmed")).length).toBeGreaterThan(0);
    expect((await getConfirmationQueue()).some((row) => row.id === order.id)).toBe(false);
    expect(await rawDb.order.findUnique({ where: { id: order.id } })).toMatchObject({ status: "confirmed", version: 2 });
  });
});

describe("Scenario 3 — compatibility shipment integrity", () => {
  it("creates delivery, ships order and dispatches after provider success", async () => {
    const automation = await configureAutomation("order.shipped");
    const customer = await seedCustomer();
    const product = await seedProduct({ stock: 5 });
    const order = await seedOrder({ customerId: customer.id, productId: product.id, quantity: 5, totalPrice: 5000, status: "confirmed", source: "storefront" });
    mockDeliveryAdapter.createShipment.mockResolvedValue({ success: true, trackingId: "YAL-123", cost: 600, labelUrl: null, estimatedDelivery: null });
    const response = await deliveryCreatePost(mockPost("http://localhost/api/delivery/create", { orderId: order.id, provider: "yalidine" }));
    expect(response.status).toBe(200);
    expect(await rawDb.order.findUnique({ where: { id: order.id } })).toMatchObject({ status: "shipped" });
    expect(await rawDb.delivery.count({ where: { orderId: order.id } })).toBe(1);
    expect((await waitForDispatch(automation.id, "order.shipped")).length).toBeGreaterThan(0);
    expect((await statsService.getDashboard({ prisma: rawDb as never })).pendingDeliveries).toBe(1);
  });
});

describe("Scenario 4 — compatibility delivery sync integrity", () => {
  it("syncs tracking and applies the delivered transition consistently", async () => {
    const automation = await configureAutomation("order.delivered");
    const customer = await seedCustomer();
    const product = await seedProduct({ stock: 5 });
    const order = await seedOrder({ customerId: customer.id, productId: product.id, quantity: 5, totalPrice: 5000, status: "shipped", source: "storefront" });
    const delivery = await rawDb.delivery.create({ data: { orderId: order.id, provider: "yalidine", trackingNumber: "SYNC-1", cost: 600, status: "in_transit" } });
    mockDeliveryAdapter.syncTracking.mockResolvedValue({ status: "in_transit", events: [], estimatedDelivery: null });
    expect((await deliverySyncPost(mockPost("http://localhost/api/delivery/sync", { deliveryId: delivery.id }))).status).toBe(200);
    await orderService.updateStatus({ prisma: rawDb as never }, order.id, "delivered");
    expect(await rawDb.order.findUnique({ where: { id: order.id } })).toMatchObject({ status: "delivered" });
    expect(await rawDb.customer.findUnique({ where: { id: customer.id } })).toMatchObject({ orderCount: 1, totalSpent: 5000 });
    expect(await latestStatusChange(order.id)).toMatchObject({ from: "shipped", to: "delivered" });
    expect((await waitForDispatch(automation.id, "order.delivered")).length).toBeGreaterThan(0);
    expect((await statsService.getDashboard({ prisma: rawDb as never })).realizedRevenueToday).toBe(5000);
  });
});

describe("Scenario 5 — compatibility delivery PATCH integrity", () => {
  it("matches the delivered side effects of the sync path", async () => {
    const automation = await configureAutomation("order.delivered");
    const customer = await seedCustomer();
    const order = await seedOrder({ customerId: customer.id, productId: (await seedProduct({ stock: 5 })).id, quantity: 5, totalPrice: 5000, status: "shipped", source: "storefront" });
    const delivery = await rawDb.delivery.create({ data: { orderId: order.id, provider: "yalidine", trackingNumber: "PATCH-1", cost: 600, status: "in_transit" } });
    const response = await deliveryPatch(mockPost(`http://localhost/api/delivery/${delivery.id}`, { status: "delivered" }), { params: Promise.resolve({ id: delivery.id }) });
    expect(response.status).toBe(200);
    expect(await rawDb.order.findUnique({ where: { id: order.id } })).toMatchObject({ status: "delivered" });
    expect(await rawDb.customer.findUnique({ where: { id: customer.id } })).toMatchObject({ orderCount: 1, totalSpent: 5000 });
    expect(await latestStatusChange(order.id)).toMatchObject({ from: "shipped", to: "delivered" });
    expect((await waitForDispatch(automation.id, "order.delivered")).length).toBeGreaterThan(0);
  });
});

describe("Scenario 6 — compatibility return integrity", () => {
  it("restores stock, reverses customer stats and writes the return truth", async () => {
    const automation = await configureAutomation("order.returned");
    const customer = await seedCustomer();
    const product = await seedProduct({ stock: 5 });
    await rawDb.customer.update({ where: { id: customer.id }, data: { orderCount: 1, totalSpent: 5000 } });
    const order = await seedOrder({ customerId: customer.id, productId: product.id, quantity: 5, totalPrice: 5000, status: "delivered", source: "storefront", deliveredAt: new Date() });
    await orderService.updateStatus({ prisma: rawDb as never }, order.id, "returned");
    expect((await rawDb.product.findUnique({ where: { id: product.id } }))?.stock).toBe(10);
    expect(await rawDb.customer.findUnique({ where: { id: customer.id } })).toMatchObject({ orderCount: 0, totalSpent: 0 });
    expect(await latestStatusChange(order.id)).toMatchObject({ from: "delivered", to: "returned" });
    expect((await waitForDispatch(automation.id, "order.returned")).length).toBeGreaterThan(0);
    expect((await statsService.getDashboard({ prisma: rawDb as never })).realizedRevenueToday).toBe(0);
  });
});

describe("Scenario 8 — stale queue agreement", () => {
  it("bell, queue API and queue service agree", async () => {
    const customer = await seedCustomer();
    await seedOrder({ customerId: customer.id, status: "pending", createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000) });
    await seedOrder({ customerId: customer.id, status: "pending", createdAt: new Date(Date.now() - 60 * 60 * 1000) });
    await seedOrder({ customerId: customer.id, status: "pending", createdAt: new Date(Date.now() - 60 * 60 * 1000) });
    const response = await confirmationQueueGet(mockGet("http://localhost/api/orders/confirmation-queue"));
    expect(await getJson(response)).toMatchObject({ staleCount: 1, total: 3 });
    expect((await getConfirmationQueue()).filter((row) => row.isStale)).toHaveLength(1);
    expect(await getStaleOrderCount()).toBe(1);
    const bell = await getJson(await notificationsGet());
    expect(bell.notifications).toEqual(expect.arrayContaining([expect.objectContaining({ id: "stale-queue", type: "alert" })]));
  });
});

describe("Scenario 9 — low-stock agreement", () => {
  it("dashboard, bell and products definition agree", async () => {
    await seedProduct({ name: "low-1", stock: 2, threshold: 5 });
    await seedProduct({ name: "low-2", stock: 5, threshold: 5 });
    await seedProduct({ name: "inactive-low", stock: 1, threshold: 5, active: false });
    await seedProduct({ stock: 100, threshold: 5 });
    await seedProduct({ stock: 50, threshold: 5 });
    expect((await statsService.getDashboard({ prisma: rawDb as never })).lowStockProducts).toBe(2);
    const bell = await getJson(await notificationsGet());
    expect((bell.notifications as Array<{ type: string }>).filter((row) => row.type === "stock")).toHaveLength(2);
    const products = await rawDb.product.findMany({ where: { isActive: true, deletedAt: null } });
    expect(products.filter((row) => row.stock <= row.lowStockThreshold)).toHaveLength(2);
  });
});

describe("Scenario 10 — revenue formula agreement", () => {
  it("all surfaces agree on gross, realized, net and delivery rates", async () => {
    const customer = await seedCustomer();
    await seedOrder({ customerId: customer.id, totalPrice: 1000, status: "delivered", source: "storefront", deliveredAt: new Date() });
    await seedOrder({ customerId: customer.id, totalPrice: 2000, status: "pending" });
    await seedOrder({ customerId: customer.id, totalPrice: 3000, status: "returned", source: "storefront", deliveredAt: new Date() });
    await seedOrder({ customerId: customer.id, totalPrice: 4000, status: "cancelled", source: "storefront" });
    const from = new Date(); from.setHours(0, 0, 0, 0);
    const to = new Date(from); to.setDate(to.getDate() + 1);
    const today = { from, to };
    const last30 = { from: new Date(Date.now() - 30 * 86_400_000), to: new Date(Date.now() + 86_400_000) };
    expect(await grossRevenue(rawDb as never, today)).toBe(6000);
    expect(await realizedRevenue(rawDb as never, today)).toBe(1000);
    expect(await netRevenue(rawDb as never, last30)).toBe(1000);
    expect(await deliveryRate(rawDb as never, today)).toEqual({ rate: 25, delivered: 1, total: 4 });
    expect(await courierDeliveryRate(rawDb as never)).toEqual({ rate: 0, delivered: 0, total: 0 });
    const dashboard = await statsService.getDashboard({ prisma: rawDb as never });
    expect(dashboard).toMatchObject({ revenueToday: 6000, realizedRevenueToday: 1000 });
    expect((await analyticsService.getReport({ prisma: rawDb as never }, 30)).summary).toMatchObject({ totalRevenue: 6000, totalOrders: 4 });
  });
});

describe("Scenario 11 — COD reconciliation arithmetic", () => {
  it("agrees on collected, remitted and pending amounts", async () => {
    const customer = await seedCustomer();
    const first = await seedOrder({ customerId: customer.id, totalPrice: 1000, status: "delivered", source: "storefront", deliveredAt: new Date() });
    const second = await seedOrder({ customerId: customer.id, totalPrice: 2000, status: "delivered", source: "storefront", deliveredAt: new Date() });
    const third = await seedOrder({ customerId: customer.id, totalPrice: 3000, status: "shipped", source: "storefront" });
    await markCodCollected({ prisma: rawDb as never }, first.id, "user");
    await markCodCollected({ prisma: rawDb as never }, second.id, "user");
    await markCodCollected({ prisma: rawDb as never }, third.id, "user");
    await rawDb.order.update({ where: { id: first.id }, data: { codRemitted: true, codRemittedAt: new Date(), codRemittanceRef: "BANK-1" } });
    const summary = await getCodReconciliationSummary({ prisma: rawDb as never });
    expect(summary.counts).toMatchObject({ delivered: 2, collected: 3, remitted: 1, uncollected: 0 });
    expect(summary.pendingRemittance.map((row) => row.id).sort()).toEqual([second.id, third.id].sort());
    expect(summary).toMatchObject({ totalCollectedAmount: 6000, totalRemittedAmount: 1000, pendingAmount: 5000 });
  });
});

describe("Scenario 12 — notifications i18n", () => {
  it("returns AR, FR and EN notification copy for all types", async () => {
    const customer = await seedCustomer();
    const product = await seedProduct({ stock: 1, threshold: 5 });
    await seedOrder({ customerId: customer.id, status: "pending", createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000) });
    const order = await seedOrder({ customerId: customer.id, productId: product.id, totalPrice: 2000, status: "delivered", source: "storefront", deliveredAt: new Date() });
    await rawDb.delivery.create({ data: { orderId: order.id, provider: "yalidine", trackingNumber: "I18N-1", cost: 600, status: "delivered" } });
    await rawDb.return.create({ data: { orderId: order.id, reason: "Customer not satisfied", status: "approved", type: "return" } });
    localeHolder.value = "ar";
    const ar = (await getJson(await notificationsGet())).notifications as Array<{ id: string; type: string; title: string; time: string }>;
    expect(new Set(ar.map((row) => row.type))).toEqual(new Set(["alert", "order", "delivery", "stock", "return"]));
    expect(ar.find((row) => row.id === "stale-queue")?.title).toContain("تأكيد");
    localeHolder.value = "fr";
    expect(((await getJson(await notificationsGet())).notifications as Array<{ title: string }>).some((row) => row.title.includes("confirmer"))).toBe(true);
    localeHolder.value = "en";
    expect(((await getJson(await notificationsGet())).notifications as Array<{ title: string }>).some((row) => row.title.includes("confirmation"))).toBe(true);
  });
});

describe("Scenario 13 — backup/restore PII integrity", () => {
  const dataDir = process.env.SF_DATA_DIR!;
  const metaPath = join(dataDir, "shop-registry.json");
  let savedMeta: string | null = null;
  beforeEach(() => { savedMeta = existsSync(metaPath) ? readFileSync(metaPath, "utf8") : null; });
  afterEach(() => {
    if (savedMeta !== null) writeFileSync(metaPath, savedMeta);
    else rmSync(metaPath, { force: true });
    rmSync(join(dataDir, "backups"), { recursive: true, force: true });
  });
  it("decrypts restored PII and preserves blind-index search", async () => {
    mkdirSync(dataDir, { recursive: true });
    const dbUrl = process.env.DATABASE_URL ?? "";
    const dbPath = dbUrl.startsWith("file:") ? dbUrl.slice(5) : join(process.cwd(), "data", "shops", "dev.db");
    writeFileSync(metaPath, JSON.stringify({ formatVersion: 2, revision: 1, workspaceId: "a".repeat(32), installationId: "b".repeat(32), shops: [{ id: "test", incarnationId: "c".repeat(32), name: "Test", databaseFile: dbPath.split(/[\\/]/).pop(), icon: null, createdAt: new Date().toISOString() }], activeShopId: "test" }));
    const { db } = await import("@/lib/db");
    const phone = "0770000001";
    const customer = await db.customer.create({ data: { name: "PII Backup", phone, wilaya: "Alger", commune: "Bab Ezzouar", address: "123 Rue Didouche" } });
    const raw = await rawDb.customer.findUnique({ where: { id: customer.id } });
    expect(raw?.phone).toMatch(/^[0-9a-f]{64}$/);
    expect(raw?.phoneEnc).toContain('"ciphertext"');
    const backup = await createBackup();
    await rawDb.customer.deleteMany();
    await rawDb.$disconnect();
    expect((await restoreBackup(backup.filename)).success).toBe(true);
    expect(await db.customer.findUnique({ where: { id: customer.id } })).toMatchObject({ phone, name: "PII Backup" });
    expect(await db.customer.findFirst({ where: { phone } })).toMatchObject({ id: customer.id, phone });
    await deleteBackup(backup.filename);
  });
});

describe("Scenario 14 — ecommerce sync deduplication", () => {
  it("creates one order, one customer and one created ledger entry", async () => {
    const order: NormalizedOrder = {
      sourceOrderId: "shop-1",
      orderNumber: "#1001",
      customerName: "Sync Customer",
      customerPhone: "0555888801",
      wilaya: "Alger",
      commune: "Bab Ezzouar",
      address: "123 Rue Didouche",
      items: [{ productName: "Widget", quantity: 2, unitPrice: 2000 }],
      totalPrice: 4000,
      source: "shopify",
      sourceMetadata: { sourceOrderId: "shop-1" },
      createdAt: "2026-01-02T10:00:00Z",
    };
    listOrdersMock.mockResolvedValueOnce({ orders: [order], nextWatermark: "2", hasMore: false } satisfies SyncFetchResult);
    expect(await syncPlatform({ prisma: rawDb as never, shop: TEST_SHOP_CONTEXT }, "shopify")).toMatchObject({ created: 1, errors: [] });
    const created = await rawDb.order.findFirstOrThrow();
    expect(await rawDb.orderChange.count({ where: { orderId: created.id, actionType: "created" } })).toBe(1);
    listOrdersMock.mockResolvedValueOnce({ orders: [order], nextWatermark: "2", hasMore: false } satisfies SyncFetchResult);
    expect(await syncPlatform({ prisma: rawDb as never, shop: TEST_SHOP_CONTEXT }, "shopify")).toMatchObject({ created: 0, skipped: 1, errors: [] });
    expect(await rawDb.order.count()).toBe(1);
    expect(await rawDb.customer.count()).toBe(1);
    expect(await rawDb.orderChange.count({ where: { orderId: created.id, actionType: "created" } })).toBe(1);
  });
});

describe("Scenario 15 — multi-shop test-mode boundary", () => {
  it("documents and verifies the fallback-client test boundary", async () => {
    expect(() => invalidateMetaCache()).not.toThrow();
    expect(() => invalidateShopClient("/tmp/never-cached.db")).not.toThrow();
    const { db } = await import("@/lib/db");
    expect(typeof await db.order.count()).toBe("number");
  });
});
