import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  settings: new Map<string, string>(),
  workbench: vi.fn(),
  orderFindMany: vi.fn(),
  groupBy: vi.fn(),
  queryRaw: vi.fn(),
  pending: [] as Record<string, unknown>[],
  others: [] as Record<string, unknown>[],
  total: 0,
}));

vi.mock("server-only", () => ({}));
vi.mock("./phone-today-counts", () => ({ readPhoneTodayCounts: vi.fn() }));
vi.mock("@/lib/data/dashboard", () => ({ getDashboardStats: vi.fn(), getRecentOrders: vi.fn() }));
vi.mock("@/lib/data/analytics-data", () => ({ getDashboardAnalytics: vi.fn() }));
vi.mock("@/lib/orders/confirmation-workbench", () => ({ getConfirmationWorkbenchPage: h.workbench }));
vi.mock("@/lib/identity/trusted-actor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/identity/trusted-actor")>();
  return { ...actual, isTrustedActorContext: vi.fn(() => true) };
});
vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  const kit = await import("./__tests__/projection-kit");
  return {
    ...actual,
    db: {
      $transaction: async (run: (tx: unknown) => Promise<unknown>) => run(kit.settingTx(h.settings)),
      order: { findMany: h.orderFindMany },
      collaborationComment: { groupBy: h.groupBy },
      businessAggregateVersion: { findMany: h.queryRaw }, // the note-version rows; there is no $queryRaw here, so a raw query on the canonical client would throw
    },
  };
});

import { SEAL_HARD_LIMIT, type OrdersProjection } from "./contracts";
import { assertSealable, sealAndPutProjection } from "./desktop-projection";
import { publishRemoteOrdersProjection, trimOrdersToBudget } from "./orders-projection";
import { DEVICE_ID, MEMBER_ID, NOW, actor, makeRig } from "./__tests__/projection-kit";

const DAY = 86_400_000;
const ITEMS = [
  { productName: "Shirt", quantity: 1 },
  { productName: "Shoes", quantity: 2 },
  { productName: "Cap", quantity: 1 },
  { productName: "Belt", quantity: 1 },
  { productName: "Socks", quantity: 3 },
];
// The fake database is LEAKY on purpose: it returns every column whatever the
// select says, so only the publisher's own gates keep a field out.
const mk = (n: number, status: string, ageMs: number) => ({
  id: `ord-${n}`, orderNumber: `SF-${n}`, status, version: 3,
  createdAt: new Date(NOW.getTime() - ageMs), source: "whatsapp",
  wilaya: "Alger", phone: "0550000000", address: "12 rue X", totalPrice: 4500,
  customer: { name: "Amine" }, items: ITEMS,
  costPrice: 1200, margin: 0.4, riskScore: 87, clientIp: "10.0.0.9", userAgent: "UA", fbc: "fb.1", sourceMetadata: "{}",
});
const ROW_KEYS = new Set([
  "id", "orderNumber", "status", "version", "createdAt", "wilaya", "items", "moreCount", "source",
  "totalPrice", "customerName", "phone", "address", "noteCount", "noteVersion",
]);

beforeEach(() => {
  h.settings.clear();
  h.pending = [mk(1, "pending", 3 * 3_600_000), mk(2, "pending", 3_600_000)];
  h.others = [mk(3, "confirmed", 2 * DAY), mk(4, "shipped", 5 * DAY)];
  h.total = 2;
  h.workbench.mockReset().mockImplementation(async () => ({
    queue: h.pending.map((o) => ({ id: o.id, orderNumber: o.orderNumber, version: o.version, phone: "leak", customerName: "leak", wilaya: "leak", totalPrice: 1 })),
    total: h.total,
  }));
  h.orderFindMany.mockReset().mockImplementation(async (args: { where: { id?: { in: string[] } }; take?: number }) =>
    args.where.id ? h.pending.filter((o) => args.where.id?.in.includes(o.id as string)) : h.others.slice(0, args.take));
  h.groupBy.mockReset().mockResolvedValue([{ entityId: "ord-1", _count: { _all: 2 } }]);
  h.queryRaw.mockReset().mockResolvedValue([{ aggregateId: "order:ord-1", version: 4n }]);
});

async function run(context = actor("owner"), rig = makeRig()) {
  const result = await publishRemoteOrdersProjection({
    client: rig.client as never, desktopKeys: rig.desktop, actorContext: context, deviceId: DEVICE_ID, now: NOW,
  });
  const envelope = rig.sent[rig.sent.length - 1];
  if (!envelope) throw new Error("the publisher sent nothing");
  return { rig, result, envelope, payload: rig.open<OrdersProjection>(envelope) };
}
const selects = () => h.orderFindMany.mock.calls.map((call) => call[0].select as Record<string, unknown>);

describe("publishRemoteOrdersProjection", () => {
  it("sends pending first (queue order), then the newest others, with the exact row", async () => {
    const { payload, envelope, result } = await run();
    expect(result.sequence).toBe(1);
    expect(envelope.messageType).toBe("projection.orders");
    expect(payload.orders.map((o) => o.id)).toEqual(["ord-1", "ord-2", "ord-3", "ord-4"]);
    expect(payload.orders[0]).toEqual({
      id: "ord-1", orderNumber: "SF-1", status: "pending", version: 3,
      createdAt: "2026-10-30T22:00:00.000Z", wilaya: "Alger",
      items: [{ name: "Shirt", qty: 1 }, { name: "Shoes", qty: 2 }, { name: "Cap", qty: 1 }], moreCount: 2,
      source: "whatsapp", totalPrice: 4500, customerName: "Amine", phone: "0550000000", address: "12 rue X",
      noteCount: 2, noteVersion: 4,
    });
    expect(payload.orders[1]).toMatchObject({ id: "ord-2", noteCount: 0, noteVersion: 0 });
    expect(payload.window).toEqual({ shown: 4, pendingTotal: 2, truncated: false });
  });

  it("copies only whitelisted fields (no cost, margin, risk, ip, agent, pixel data)", async () => {
    const { payload } = await run();
    for (const row of payload.orders) {
      for (const key of Object.keys(row)) expect(ROW_KEYS.has(key)).toBe(true);
    }
    expect(JSON.stringify(payload)).not.toMatch(/costPrice|margin|riskScore|10\.0\.0\.9|fb\.1|leak/);
  });

  it("asks the workbench for 50 and the others for the last 14 days, never drafts or pending", async () => {
    await run();
    expect(h.workbench.mock.calls[0]?.[1]).toEqual({ page: 1, pageSize: 50 });
    const others = h.orderFindMany.mock.calls.find((call) => !call[0].where.id)?.[0];
    expect(others.where.deletedAt).toBeNull();
    expect(others.where.status).toEqual({ notIn: ["pending", "draft"] });
    expect(others.where.createdAt).toEqual({ gte: new Date(NOW.getTime() - 14 * DAY) });
    expect(others.take).toBe(49);
  });

  it("hides contact fields and never selects them without customers.contact.read", async () => {
    const { payload } = await run(actor("operator", ["shops.read", "orders.read", "orders.financials.read"]));
    for (const row of payload.orders) {
      for (const key of ["customerName", "phone", "address", "wilaya"]) expect(key in row).toBe(false);
      expect(row.totalPrice).toBe(4500);
    }
    for (const select of selects()) {
      for (const key of ["phone", "address", "wilaya", "customer"]) expect(select[key]).toBeFalsy();
      expect(select.totalPrice).toBeTruthy();
    }
  });

  it("hides the amount and never selects it without orders.financials.read", async () => {
    const { payload } = await run(actor("operator", ["shops.read", "orders.read", "customers.contact.read"]));
    for (const row of payload.orders) {
      expect("totalPrice" in row).toBe(false);
      expect(row.phone).toBe("0550000000");
      expect(row.address).toBe("12 rue X");
      expect(row.customerName).toBe("Amine");
    }
    for (const select of selects()) {
      expect(select.totalPrice).toBeFalsy();
      for (const key of ["phone", "address", "wilaya", "customer"]) expect(select[key]).toBeTruthy();
    }
  });

  it("queries nothing without orders.read and still publishes an empty window", async () => {
    const { payload, result } = await run(actor("operator", ["shops.read", "conversations.read"]));
    expect(h.workbench).not.toHaveBeenCalled();
    expect(h.orderFindMany).not.toHaveBeenCalled();
    expect(payload).toEqual({ orders: [], window: { shown: 0, pendingTotal: 0, truncated: false } });
    expect(result.sequence).toBe(1);
  });

  it("reports pendingTotal and truncated when pending alone fills the window", async () => {
    h.pending = Array.from({ length: 50 }, (_, i) => mk(100 + i, "pending", (i + 1) * 60_000));
    h.total = 80;
    const { payload } = await run();
    expect(payload.orders).toHaveLength(50);
    expect(payload.window).toEqual({ shown: 50, pendingTotal: 80, truncated: true });
    expect(payload.orders.every((o) => o.status === "pending")).toBe(true);
  });

  it("marks truncated when the others do not fit and keeps exactly 50 rows", async () => {
    h.others = Array.from({ length: 49 }, (_, i) => mk(200 + i, "confirmed", (i + 2) * DAY / 4));
    const { payload } = await run();
    expect(payload.orders).toHaveLength(50);
    expect(payload.window).toEqual({ shown: 50, pendingTotal: 2, truncated: true });
    h.others = h.others.slice(0, 48);
    expect((await run()).payload.window.truncated).toBe(false);
  });

  it("keeps a sequence per kind: orders count 1,2 and the dashboard key is untouched", async () => {
    const rig = makeRig();
    expect((await run(actor("owner"), rig)).result.sequence).toBe(1);
    expect((await run(actor("owner"), rig)).result.sequence).toBe(2);
    expect([...h.settings.entries()]).toEqual([[`connected.projection.orders.${DEVICE_ID}.sequence`, "2"]]);
  });

  it("refuses a device that is not enrolled or belongs to another member", async () => {
    const rig = makeRig();
    const empty = { ...rig.client, listDevices: async () => ({ devices: [] }) };
    await expect(publishRemoteOrdersProjection({
      client: empty as never, desktopKeys: rig.desktop, actorContext: actor("owner"), deviceId: DEVICE_ID, now: NOW,
    })).rejects.toThrow(/not enrolled/);
    const other = actor("owner");
    const stranger = { ...other, actor: { ...other.actor, workspaceMemberId: "9".repeat(32) } } as typeof other;
    await expect(run(stranger, rig)).rejects.toThrow(/another member/);
    expect(rig.sent).toHaveLength(0);
    expect(MEMBER_ID).toHaveLength(32);
  });
});

describe("trimOrdersToBudget", () => {
  const rows = Array.from({ length: 6 }, (_, i) => ({
    id: `r${i}`, orderNumber: `SF-${i}`, status: "pending", version: 1, createdAt: NOW.toISOString(),
    items: [{ name: "x".repeat(400), qty: 1 }], moreCount: 0, source: "whatsapp", noteCount: 0, noteVersion: 0,
  }));
  const full: OrdersProjection = { orders: rows, window: { shown: 6, pendingTotal: 6, truncated: false } };
  const bytes = (p: OrdersProjection) => Buffer.byteLength(JSON.stringify(p), "utf8");

  it("leaves a payload that fits exactly alone", () => {
    expect(trimOrdersToBudget(full, bytes(full))).toEqual(full);
  });

  it("drops rows from the end, one at a time, and says so in the window", () => {
    const trimmed = trimOrdersToBudget(full, bytes(full) - 1);
    expect(trimmed.orders.map((r) => r.id)).toEqual(["r0", "r1", "r2", "r3", "r4"]);
    expect(trimmed.window).toEqual({ shown: 5, pendingTotal: 6, truncated: true });
    expect(bytes(trimmed)).toBeLessThanOrEqual(bytes(full) - 1);
    const tiny = trimOrdersToBudget(full, 10);
    expect(tiny.orders).toEqual([]);
    expect(tiny.window.truncated).toBe(true);
  });
});

describe("the sealer limit", () => {
  const pad = (n: number) => ({ p: "x".repeat(n) }); // JSON adds 8 bytes: {"p":""}
  const device = (rig: ReturnType<typeof makeRig>) => ({
    deviceId: DEVICE_ID, memberId: MEMBER_ID, encryptionPublicKey: rig.phone.encryptionPublicKeyJwk, revocationEpoch: 0,
  });
  const seal = (rig: ReturnType<typeof makeRig>, payload: unknown) => sealAndPutProjection({
    client: rig.client as never, desktopKeys: rig.desktop, actorContext: actor("owner"), device: device(rig),
    kind: "orders", payload, sequence: 1, issuedAt: NOW, expiresAt: new Date(NOW.getTime() + 900_000),
  });

  it("accepts exactly SEAL_HARD_LIMIT bytes and throws on one more", () => {
    expect(assertSealable(pad(SEAL_HARD_LIMIT - 8))).toBe(SEAL_HARD_LIMIT);
    expect(() => assertSealable(pad(SEAL_HARD_LIMIT - 7))).toThrow(/too large/);
  });

  it("throws before any PUT when over, and seals at the limit", async () => {
    const rig = makeRig();
    await expect(seal(rig, pad(SEAL_HARD_LIMIT - 7))).rejects.toThrow(/too large/);
    expect(rig.sent).toHaveLength(0);
    await seal(rig, pad(SEAL_HARD_LIMIT - 8));
    expect(rig.sent).toHaveLength(1);
    expect(rig.sent[0]?.messageType).toBe("projection.orders");
  });
});
