/**
 * Cleared operational alerts must stay cleared after SahelFlow is reopened.
 *
 * The seller reported (2026-10-18): "when I clear old notifications they get
 * removed, but when I close SahelFlow and open it again they reappear".
 * Cause: the memory of what was cleared lived in the WebView's localStorage,
 * and the packaged app serves itself from a loopback port chosen at random on
 * every launch, so every launch is a new origin with an empty localStorage.
 * The memory now lives in the shop database, per member.
 *
 * A "restart" here is a fresh module registry (nothing kept in process memory)
 * reading the same database.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  cleanDb,
  getJson,
  mockPost,
  rawDb,
  seedProduct,
} from "@/app/api/__tests__/helpers";

const MEMBER_A = "2".repeat(32);
const MEMBER_B = "8".repeat(32);

const identityHarness = vi.hoisted(() => {
  const make = (workspaceMemberId: string) =>
    Object.freeze({
      version: 1 as const,
      actor: Object.freeze({
        kind: "person" as const,
        personId: "1".repeat(32),
        workspaceMemberId,
        deviceId: "3".repeat(32),
        sessionId: "dismissals-session",
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
  return { make, requireActor: vi.fn() };
});

vi.mock("@/lib/identity/trusted-actor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/identity/trusted-actor")>();
  return {
    ...actual,
    requireTrustedActor: identityHarness.requireActor,
    isTrustedActorContext: vi.fn(
      (value: unknown) =>
        typeof value === "object" && value !== null && "actor" in value && "shop" in value,
    ),
  };
});

const cookieStore = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => (cookieStore.has(name) ? { value: String(cookieStore.get(name)) } : undefined),
    set: (name: string, value: string) => {
      cookieStore.set(name, value);
    },
    delete: (name: string) => {
      cookieStore.delete(name);
    },
  })),
  headers: vi.fn(async () => ({ get: () => undefined })),
}));

process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

type Alert = { id: string; title: string; body: string; durable: boolean; read: boolean };

async function feed(fresh = false): Promise<{ alerts: Alert[]; unreadCount: number }> {
  if (fresh) vi.resetModules();
  const { GET } = await import("@/app/api/notifications/route");
  const response = await GET();
  expect(response.status).toBe(200);
  const body = await getJson(response);
  return {
    alerts: (body.notifications as Alert[]).filter((item) => item.durable === false),
    unreadCount: body.unreadCount as number,
  };
}

async function post(body: unknown, fresh = false): Promise<Response> {
  if (fresh) vi.resetModules();
  const { POST } = await import("@/app/api/notifications/dismissals/route");
  return POST(mockPost("http://localhost/api/notifications/dismissals", body));
}

let customerCounter = 0;
async function seedPendingOrder(orderNumber: string, total = 5000) {
  customerCounter += 1;
  const customer = await rawDb.customer.create({
    data: {
      name: `Dismissal Cust ${customerCounter}`,
      phone: `0771${String(customerCounter).padStart(6, "0")}`,
      nameBlindIndex: `dismissal-cust-blind-${customerCounter}`,
      wilaya: "Alger",
      commune: "Bab Ezzouar",
      address: "123 Rue",
      orderCount: 0,
      totalSpent: 0,
    },
  });
  const product = await seedProduct();
  return rawDb.order.create({
    data: {
      orderNumber,
      status: "pending",
      customerId: customer.id,
      totalPrice: total,
      deliveryCost: 0,
      wilaya: "Alger",
      commune: "Bab Ezzouar",
      address: "123 Rue",
      phone: "0770000001",
      source: "manual",
      items: {
        create: [
          { productId: product.id, productName: "X", quantity: 1, unitPrice: total, total },
        ],
      },
    },
  });
}

function must<T>(value: T | undefined | null): T {
  if (value === undefined || value === null) throw new Error("expected a value in the test fixture");
  return value;
}

const asItem = (alert: Alert) => ({ id: alert.id, title: alert.title, body: alert.body });

describe("cleared operational alerts survive a restart", () => {
  beforeEach(async () => {
    await cleanDb();
    cookieStore.clear();
    cookieStore.set("sahelflow-locale", "en");
    identityHarness.requireActor
      .mockReset()
      .mockResolvedValue(identityHarness.make(MEMBER_A));
  });

  afterAll(async () => {
    await rawDb.$disconnect();
  });

  it("an alert is shown, cleared, and still gone after a restart", async () => {
    await seedPendingOrder("ORD-DISMISS-0001");
    const before = await feed();
    const alert = must(before.alerts.find((item) => item.title.includes("ORD-DISMISS-0001")));

    const cleared = await post({ action: "dismiss", items: [asItem(alert)] });
    expect(cleared.status).toBe(200);
    expect(await getJson(cleared)).toEqual({ dismissed: 1 });

    const same = await feed();
    expect(same.alerts.some((item) => item.id === alert.id)).toBe(false);

    // "Restart": nothing from the first run is in memory any more.
    const reopened = await feed(true);
    expect(reopened.alerts.some((item) => item.id === alert.id)).toBe(false);
  });

  it("the unread badge drops with it", async () => {
    await seedPendingOrder("ORD-DISMISS-0002");
    const before = await feed();
    const alert = must(before.alerts.find((item) => item.title.includes("ORD-DISMISS-0002")));
    expect(alert.read).toBe(false);

    await post({ action: "dismiss", items: [asItem(alert)] });

    const after = await feed(true);
    expect(after.unreadCount).toBe(before.unreadCount - 1);
  });

  it("clear all is one request and clears every alert", async () => {
    await seedPendingOrder("ORD-DISMISS-0003");
    await seedPendingOrder("ORD-DISMISS-0004");
    const before = await feed();
    expect(before.alerts.length).toBeGreaterThanOrEqual(2);

    const cleared = await post({ action: "dismiss", items: before.alerts.map(asItem) });
    expect(await getJson(cleared)).toEqual({ dismissed: before.alerts.length });

    expect((await feed(true)).alerts).toEqual([]);
  });

  it("an alert returns when its situation changes", async () => {
    const order = await seedPendingOrder("ORD-DISMISS-0005", 5000);
    const before = await feed();
    const alert = must(before.alerts.find((item) => item.title.includes("ORD-DISMISS-0005")));
    await post({ action: "dismiss", items: [asItem(alert)] });
    expect((await feed(true)).alerts.some((item) => item.id === alert.id)).toBe(false);

    // Same order, different total: the alert text now differs.
    await rawDb.order.update({ where: { id: order.id }, data: { totalPrice: 7200 } });

    const changed = await feed(true);
    expect(changed.alerts.some((item) => item.id === alert.id)).toBe(true);
  });

  it("Undo brings the alert back, also after a restart", async () => {
    await seedPendingOrder("ORD-DISMISS-0006");
    const before = await feed();
    const alert = must(before.alerts.find((item) => item.title.includes("ORD-DISMISS-0006")));
    await post({ action: "dismiss", items: [asItem(alert)] });

    const restored = await post({ action: "restore", ids: [alert.id] }, true);
    expect(await getJson(restored)).toEqual({ restored: 1 });

    expect((await feed(true)).alerts.some((item) => item.id === alert.id)).toBe(true);
    // And nothing is left behind once the last entry is restored.
    expect(await rawDb.setting.count({ where: { key: { startsWith: "notification_dismissed:" } } })).toBe(0);
  });

  it("is per member: another member still sees what this member cleared", async () => {
    await seedPendingOrder("ORD-DISMISS-0007");
    const before = await feed();
    const alert = must(before.alerts.find((item) => item.title.includes("ORD-DISMISS-0007")));
    await post({ action: "dismiss", items: [asItem(alert)] });
    expect((await feed(true)).alerts.some((item) => item.id === alert.id)).toBe(false);

    identityHarness.requireActor.mockReset().mockResolvedValue(identityHarness.make(MEMBER_B));
    expect((await feed(true)).alerts.some((item) => item.id === alert.id)).toBe(true);
  });

  it("stores ids and hashes only: no customer name, place or amount", async () => {
    await seedPendingOrder("ORD-DISMISS-0008");
    const alert = must((await feed()).alerts.find((item) => item.title.includes("ORD-DISMISS-0008")));
    await post({ action: "dismiss", items: [asItem(alert)] });

    const rows = await rawDb.setting.findMany({
      where: { key: { startsWith: "notification_dismissed:" } },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.key).toBe(`notification_dismissed:${MEMBER_A}`);
    expect(rows[0]?.value).not.toMatch(/Dismissal Cust|Alger|ORD-DISMISS|5,000/);
  });

  it("keeps at most 200 entries per member and drops the oldest", async () => {
    for (let batch = 0; batch < 3; batch += 1) {
      const items = Array.from({ length: 80 }, (_, index) => ({
        id: `order-synthetic-${batch * 80 + index}`,
        title: "New order",
        body: String(batch * 80 + index),
      }));
      expect((await post({ action: "dismiss", items })).status).toBe(200);
    }
    const row = await rawDb.setting.findUnique({
      where: { key: `notification_dismissed:${MEMBER_A}` },
    });
    const stored = JSON.parse(must(row).value) as { e: Array<[string, string]> };
    expect(stored.e).toHaveLength(200);
    expect(stored.e[0]?.[0]).toBe("order-synthetic-40");
    expect(stored.e.at(-1)?.[0]).toBe("order-synthetic-239");
  });

  it("two quick requests do not overwrite each other", async () => {
    const one = [{ id: "order-quick-1", title: "New order", body: "1" }];
    const two = [{ id: "order-quick-2", title: "New order", body: "2" }];
    const [first, second] = await Promise.all([
      post({ action: "dismiss", items: one }),
      post({ action: "dismiss", items: two }),
    ]);
    expect([first.status, second.status]).toEqual([200, 200]);
    const row = await rawDb.setting.findUnique({
      where: { key: `notification_dismissed:${MEMBER_A}` },
    });
    const ids = (JSON.parse(must(row).value) as { e: Array<[string, string]> }).e.map(([id]) => id);
    expect(ids.sort()).toEqual(["order-quick-1", "order-quick-2"]);
  });

  it("a damaged stored value shows the alerts again instead of failing the feed", async () => {
    await seedPendingOrder("ORD-DISMISS-0009");
    await rawDb.setting.create({
      data: { key: `notification_dismissed:${MEMBER_A}`, value: "{ definitely not json" },
    });
    const result = await feed(true);
    expect(result.alerts.some((item) => item.title.includes("ORD-DISMISS-0009"))).toBe(true);
  });

  it("rejects a malformed request with a coded 400 and stores nothing", async () => {
    for (const body of [
      {},
      { action: "dismiss" },
      { action: "dismiss", items: [] },
      { action: "dismiss", items: [{ id: "", title: "t", body: "b" }] },
      { action: "dismiss", items: [{ id: "a", title: "t", body: "b", extra: 1 }] },
      { action: "dismiss", items: [{ id: "a", title: "t".repeat(513), body: "b" }] },
      { action: "dismiss", items: Array.from({ length: 101 }, (_, i) => ({ id: `a${i}`, title: "t", body: "b" })) },
      { action: "restore", ids: [] },
      { action: "restore", ids: ["a".repeat(129)] },
      { action: "wipe", ids: ["a"] },
    ]) {
      const response = await post(body);
      expect(response.status, JSON.stringify(body).slice(0, 60)).toBe(400);
      expect((await getJson(response)).code).toBe("REQUEST_VALIDATION_FAILED");
    }
    expect(await rawDb.setting.count({ where: { key: { startsWith: "notification_dismissed:" } } })).toBe(0);
  });
});
