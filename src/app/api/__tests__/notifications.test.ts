/**
 * Integration tests for the notifications route — Phase 7 priority group 6.
 *
 * Covers:
 *   - GET /api/notifications — derive real-time notifications from recent
 *                              orders / deliveries / low stock / returns /
 *                              stale confirmation queue, fully localized.
 *
 * The key invariant this test guards (Task 8 i18n fix): every user-facing
 * string returned by the route MUST come from the i18n catalog for the
 * request's `sahelflow-locale` cookie (ar/fr/en). No hardcoded English.
 *
 * Actor + i18n cookie isolation:
 *   - `cookies()` is mocked with a stateful Map so we can set the locale
 *     cookie per test.
 *   - The durable trusted-actor resolver is mocked with an explicit owner;
 *     real action policy remains active. The 401 case rejects actor resolution.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { rawDb, cleanDb, getJson, seedProduct } from "@/app/api/__tests__/helpers";
import { SahelFlowError } from "@/types/errors";

const identityHarness = vi.hoisted(() => {
  const actorContext = Object.freeze({
    version: 1 as const,
    actor: Object.freeze({
      kind: "person" as const,
      personId: "1".repeat(32),
      workspaceMemberId: "2".repeat(32),
      deviceId: "3".repeat(32),
      sessionId: "notifications-session",
      role: "owner" as const,
      policyVersion: 1,
      revocationEpoch: 0,
    }),
    shop: Object.freeze({
      workspaceId: "4".repeat(32),
      installationId: "5".repeat(32),
      shopId: "default",
      shopIncarnationId: "6".repeat(32),
      registryRevision: 1,
      databaseFileId: "default.db",
      migrationSetSha256: "7".repeat(64),
    }),
  });
  return { actorContext, requireActor: vi.fn() };
});

vi.mock("@/lib/identity/trusted-actor", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/identity/trusted-actor")
  >();
  return {
    ...actual,
    requireTrustedActor: identityHarness.requireActor,
    isTrustedActorContext: vi.fn(
      (value: unknown) => value === identityHarness.actorContext,
    ),
  };
});

// ── Stateful cookie store (cleared between tests) ───────────────────────────
// Locale cookies remain independent of the durable actor fixture.
const cookieStore = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => (cookieStore.has(name) ? { value: cookieStore.get(name)! } : undefined),
    set: (name: string, value: string) => { cookieStore.set(name, value); },
    delete: (name: string) => { cookieStore.delete(name); },
  })),
}));

import { GET as GETNotifications } from "@/app/api/notifications/route";

process.env.SF_MASTER_KEY = process.env.SF_MASTER_KEY ?? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

/** Set the locale cookie for the next request. */
function setLocale(locale: "ar" | "fr" | "en") {
  cookieStore.set("sahelflow-locale", locale);
}

let _custCounter = 0;
async function seedCustomer() {
  _custCounter++;
  return rawDb.customer.create({
    data: {
      name: `Notif Cust ${_custCounter}`,
      phone: `0770${String(_custCounter).padStart(6, "0")}`,
      nameBlindIndex: `notif-cust-blind-${_custCounter}`,
      wilaya: "Alger",
      commune: "Bab Ezzouar",
      address: "123 Rue",
      orderCount: 0,
      totalSpent: 0,
    },
  });
}

describe("GET /api/notifications — derived notification feed", () => {
  beforeEach(async () => {
    await cleanDb();
    cookieStore.clear();
    identityHarness.requireActor
      .mockReset()
      .mockResolvedValue(identityHarness.actorContext);
  });

  afterAll(async () => {
    await rawDb.$disconnect();
  });

  // ─── Happy path / shape ─────────────────────────────────────────────────
  it("returns 200 + empty notifications list on a clean DB", async () => {
    const res = await GETNotifications();
    expect(res.status).toBe(200);
    const body = await getJson(res);
    expect(body.notifications).toEqual([]);
  });

  it("returns a notification for a new pending order (en)", async () => {
    setLocale("en");
    const customer = await seedCustomer();
    const product = await seedProduct();
    await rawDb.order.create({
      data: {
        orderNumber: "ORD-NOTIF-0001",
        status: "pending",
        customerId: customer.id,
        totalPrice: 5000,
        deliveryCost: 600,
        wilaya: "Alger",
        commune: "Bab Ezzouar",
        address: "123 Rue",
        phone: "0770000001",
        source: "manual",
        items: { create: [{ productId: product.id, productName: "X", quantity: 1, unitPrice: 5000, total: 5000 }] },
      },
    });

    const res = await GETNotifications();
    expect(res.status).toBe(200);
    const body = await getJson(res);
    const notifs = body.notifications as Array<Record<string, unknown>>;
    const newOrder = notifs.find((n) => n.type === "order");
    expect(newOrder).toBeTruthy();
    expect(String(newOrder!.title)).toMatch(/New order ORD-NOTIF-0001/);
    // Body interpolates customer + wilaya + total (en uses DZD)
    expect(String(newOrder!.body)).toMatch(/Notif Cust 1/);
    expect(String(newOrder!.body)).toMatch(/Alger/);
    expect(String(newOrder!.body)).toMatch(/5,000/); // en-US grouping
    expect(String(newOrder!.body)).toMatch(/DZD/);
  });

  // ─── i18n: same order → 3 locales → 3 localized strings ─────────────────
  it("localizes the new-order title for ar / fr / en", async () => {
    // Seed once; read 3 times with different locale cookies.
    const customer = await seedCustomer();
    const product = await seedProduct();
    await rawDb.order.create({
      data: {
        orderNumber: "ORD-I18N-0001",
        status: "pending",
        customerId: customer.id,
        totalPrice: 2500,
        deliveryCost: 0,
        wilaya: "Alger",
        commune: "B",
        address: "A",
        phone: "0770000001",
        source: "manual",
        items: { create: [{ productId: product.id, productName: "X", quantity: 1, unitPrice: 2500, total: 2500 }] },
      },
    });

    for (const [locale, expectedTitlePrefix] of [
      ["en", "New order"],
      ["fr", "Nouvelle commande"],
      ["ar", "طلب جديد"],
    ] as const) {
      setLocale(locale);
      const res = await GETNotifications();
      expect(res.status).toBe(200);
      const body = await getJson(res);
      const notifs = body.notifications as Array<Record<string, unknown>>;
      const newOrder = notifs.find((n) => n.type === "order");
      expect(newOrder).toBeTruthy();
      // Title must start with the localized prefix (not "New order" for ar/fr)
      expect(String(newOrder!.title)).toContain(expectedTitlePrefix);
      expect(String(newOrder!.title)).toContain("ORD-I18N-0001");
    }
  });

  it("localizes delivery-status label via deliveries.status.* keys (camelCased)", async () => {
    const customer = await seedCustomer();
    const product = await seedProduct();
    const order = await rawDb.order.create({
      data: {
        orderNumber: "ORD-DEL-STAT",
        status: "shipped",
        customerId: customer.id,
        totalPrice: 5000, deliveryCost: 0, wilaya: "Alger", commune: "B", address: "A",
        phone: "0770000001", source: "manual",
        items: { create: [{ productId: product.id, productName: "X", quantity: 1, unitPrice: 5000, total: 5000 }] },
      },
    });
    await rawDb.delivery.create({
      data: {
        orderId: order.id, provider: "yalidine", trackingNumber: "YAL-1", cost: 0,
        status: "in_transit", estimatedDelivery: null,
      },
    });

    // en: "Delivery: In transit" (statusToCamel("in_transit") = "inTransit")
    setLocale("en");
    let res = await GETNotifications();
    let body = await getJson(res);
    let enNotif = (body.notifications as Array<Record<string, unknown>>).find((n) => n.type === "delivery");
    expect(enNotif).toBeTruthy();
    expect(String(enNotif!.title)).toMatch(/Delivery:/);

    // fr: "Livraison : ..."
    setLocale("fr");
    res = await GETNotifications();
    body = await getJson(res);
    enNotif = (body.notifications as Array<Record<string, unknown>>).find((n) => n.type === "delivery");
    expect(enNotif).toBeTruthy();
    expect(String(enNotif!.title)).toMatch(/Livraison/);
  });

  it("emits a low-stock notification when product.stock <= lowStockThreshold", async () => {
    setLocale("en");
    // Default threshold is 10 (from the Prisma schema default).
    await seedProduct({ name: "Widget A", stock: 3 });

    const res = await GETNotifications();
    expect(res.status).toBe(200);
    const body = await getJson(res);
    const notifs = body.notifications as Array<Record<string, unknown>>;
    const stock = notifs.find((n) => n.type === "stock");
    expect(stock).toBeTruthy();
    expect(String(stock!.title)).toMatch(/Low stock: Widget A/);
    expect(String(stock!.body)).toMatch(/3 left/);
  });

  it("emits a return notification with localized type label", async () => {
    setLocale("en");
    const customer = await seedCustomer();
    const product = await seedProduct();
    const order = await rawDb.order.create({
      data: {
        orderNumber: "ORD-RET-NOTIF",
        status: "delivered",
        customerId: customer.id,
        totalPrice: 5000, deliveryCost: 0, wilaya: "Alger", commune: "B", address: "A",
        phone: "0770000001", source: "manual", deliveredAt: new Date(),
        items: { create: [{ productId: product.id, productName: "X", quantity: 1, unitPrice: 5000, total: 5000 }] },
      },
    });
    await rawDb.return.create({
      data: { orderId: order.id, reason: "Customer changed mind", type: "return", status: "requested", notes: null },
    });

    const res = await GETNotifications();
    expect(res.status).toBe(200);
    const body = await getJson(res);
    const notifs = body.notifications as Array<Record<string, unknown>>;
    const ret = notifs.find((n) => n.type === "return");
    expect(ret).toBeTruthy();
    // en return-type label = "Return" (returns.type.return)
    expect(String(ret!.title)).toMatch(/Return/);
    expect(String(ret!.body)).toContain("ORD-RET-NOTIF");
  });

  it("emits a stale-queue alert when a pending order is older than 2h", async () => {
    setLocale("en");
    const customer = await seedCustomer();
    const product = await seedProduct();
    // 3 hours ago
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
    await rawDb.order.create({
      data: {
        orderNumber: "ORD-STALE-1",
        status: "pending",
        customerId: customer.id,
        totalPrice: 1000, deliveryCost: 0, wilaya: "Alger", commune: "B", address: "A",
        phone: "0770000001", source: "manual",
        createdAt: threeHoursAgo,
        items: { create: [{ productId: product.id, productName: "X", quantity: 1, unitPrice: 1000, total: 1000 }] },
      },
    });

    const res = await GETNotifications();
    expect(res.status).toBe(200);
    const body = await getJson(res);
    const notifs = body.notifications as Array<Record<string, unknown>>;
    const stale = notifs.find((n) => n.id === "stale-queue");
    expect(stale).toBeTruthy();
    expect(stale!.type).toBe("alert");
    // Plural-aware: "1 order needs confirmation" / "N orders need confirmation"
    expect(String(stale!.title)).toMatch(/order(s)? need(s)? confirmation/);
  });

  // ─── Auth ───────────────────────────────────────────────────────────────
  it("returns 401 when durable trusted-actor resolution is rejected", async () => {
    identityHarness.requireActor.mockRejectedValueOnce(
      new SahelFlowError("Unauthorized", "UNAUTHORIZED", 401),
    );
    // The production route maps the durable identity rejection to 401.
    const res = await GETNotifications();
    expect(res.status).toBe(401);
  });
});
