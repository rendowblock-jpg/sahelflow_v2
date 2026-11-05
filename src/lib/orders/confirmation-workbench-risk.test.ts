/**
 * M1 of the fake-order gate: suspicious-order FLAG with a visible reason on each
 * confirmation-queue row. Flag-only: nothing is blocked, rejected or hidden.
 *
 * Flag rule under test (decided from what the engine returns):
 *  - reasons come ONLY from engine factors that really add risk (direction "risk", points > 0):
 *    customer_return_rate -> previous_returns, order_frequency -> repeat_order_24h,
 *    contact_quality -> weak_contact (viewers with contact access only), action "blacklisted" -> blacklisted.
 *  - a row is flagged when it has at least one reason AND (engine level is medium/high/critical
 *    OR the reason is a repeat_order_24h / blacklisted one). Otherwise: no `risk` key at all.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/lib/db";
import { getConfirmationWorkbenchPage } from "@/lib/orders/confirmation-workbench";
import { batchAssessOrdersForWorkbench } from "@/lib/orders/order-risk-workbench";

type Row = {
  id: string; orderNumber: string; customerId: string; phone: string; name: string;
  status: string; createdAt: Date; totalPrice: number;
};
const h = vi.hoisted(() => ({ rows: [] as Row[], log: [] as string[], blacklisted: [] as string[] }));

vi.mock("@/lib/db", () => {
  type Args = { where: Record<string, any>; select?: Record<string, unknown> };
  const order = {
    findMany: vi.fn(async ({ where: w, select }: Args) => {
      if (w.status === "pending") {
        h.log.push("order.pending");
        return h.rows.filter((r) => r.status === "pending")
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
          .map((r) => ({
            id: r.id, orderNumber: r.orderNumber, createdAt: r.createdAt, source: "manual",
            sourceMetadata: null, version: 1,
            ...(select?.totalPrice ? { totalPrice: r.totalPrice } : {}),
            ...(select?.phone ? { phone: r.phone } : {}),
            ...(select?.wilaya ? { wilaya: "16" } : {}),
            ...(select?.customer ? { customer: { name: r.name, phone: r.phone } } : {}),
          }));
      }
      if (w.id?.in) {
        h.log.push("order.riskRows");
        return h.rows.filter((r) => w.id.in.includes(r.id)).map((r) => ({
          id: r.id, totalPrice: r.totalPrice, wilaya: "16", commune: null, address: "12 rue des Freres, Alger",
          phone: r.phone, source: "manual", createdAt: r.createdAt, customerId: r.customerId,
        }));
      }
      if (w.customerId?.in) {
        h.log.push("order.history");
        return h.rows.filter((r) => w.customerId.in.includes(r.customerId))
          .sort((a, b) => a.customerId.localeCompare(b.customerId) || a.createdAt.getTime() - b.createdAt.getTime())
          .map((r) => ({ id: r.id, customerId: r.customerId, status: r.status, totalPrice: r.totalPrice, createdAt: r.createdAt }));
      }
      throw new Error(`unexpected order.findMany ${JSON.stringify(w)}`);
    }),
    count: vi.fn(async () => h.rows.filter((r) => r.status === "pending").length),
    aggregate: vi.fn(async () => ({ _sum: { totalPrice: 0 } })),
  };
  const customer = {
    findMany: vi.fn(async () => {
      h.log.push("customer");
      return [...new Set(h.rows.map((r) => r.customerId))].map((id) => ({ id, isBlacklisted: h.blacklisted.includes(id) }));
    }),
  };
  const wilayaRiskProfile = { findMany: vi.fn(async () => { h.log.push("wilaya"); return []; }) };
  return { db: { order, customer, wilayaRiskProfile } };
});

vi.mock("@/lib/risk-engine", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/risk-engine")>();
  const { DEFAULT_RISK_CONFIG } = await import("@/lib/risk-engine/types");
  return { ...real, getRiskConfig: async () => DEFAULT_RISK_CONFIG, getRiskRules: async () => [] };
});

vi.mock("@/lib/identity/authorization", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/identity/authorization")>()),
  assertTrustedAction: vi.fn(),
  trustedActionAllowed: (ctx: { denied?: string[] }, action: string) => !(ctx.denied ?? []).includes(action),
}));

const NOW = new Date("2026-11-05T12:00:00.000Z");
const hoursAgo = (n: number) => new Date(NOW.getTime() - n * 3_600_000);
const row = (o: Partial<Row> & Pick<Row, "id" | "customerId" | "phone">): Row => ({
  orderNumber: o.id.toUpperCase(), name: `Client ${o.customerId}`, status: "pending",
  createdAt: hoursAgo(1), totalPrice: 450000, ...o,
});
const actor = (denied: string[] = []) => ({ shop: { shopId: "shop-1" }, denied }) as never;
const find = (page: Awaited<ReturnType<typeof getConfirmationWorkbenchPage>>, id: string) =>
  page.queue.find((q) => q.id === id) as ((typeof page.queue)[number] & { risk?: any }) | undefined;

const returnsCustomer = () => [
  row({ id: "r1", customerId: "c-ret", phone: "0555111111", status: "returned", createdAt: hoursAgo(24 * 20) }),
  row({ id: "r2", customerId: "c-ret", phone: "0555111111", status: "returned", createdAt: hoursAgo(24 * 10) }),
  row({ id: "p-ret", customerId: "c-ret", phone: "0555111111", createdAt: hoursAgo(3) }),
];
const dupCustomer = () => [
  row({ id: "d1", customerId: "c-dup", phone: "0555222222", createdAt: hoursAgo(20) }),
  row({ id: "d2", customerId: "c-dup", phone: "0555222222", createdAt: hoursAgo(2) }),
];
const slowCustomer = () => [
  row({ id: "s1", customerId: "c-slow", phone: "0555333333", createdAt: hoursAgo(24 * 4) }),
  row({ id: "s2", customerId: "c-slow", phone: "0555333333", createdAt: hoursAgo(1) }),
];
const cleanCustomer = () => [row({ id: "p-clean", customerId: "c-clean", phone: "0555444444", createdAt: hoursAgo(5) })];

beforeAll(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(NOW); });
afterAll(() => { vi.useRealTimers(); });
beforeEach(() => { h.rows = []; h.log = []; h.blacklisted = []; });

describe("confirmation queue suspicious-order flag (M1)", () => {
  it("(a) a pending order whose customer has 2 returned orders is flagged high, first reason = previous returns", async () => {
    h.rows = returnsCustomer();
    const item = find(await getConfirmationWorkbenchPage(actor()), "p-ret");
    expect(item?.risk?.level).toBe("high");
    expect(item?.risk?.reasons[0]).toMatchObject({ code: "previous_returns", key: "confirmationQueue.risk.reason.previousReturns" });
  });

  it("(b) two pending orders with the same phone within 24 h both carry the repeat_order_24h reason", async () => {
    h.rows = dupCustomer();
    const page = await getConfirmationWorkbenchPage(actor());
    for (const id of ["d1", "d2"]) {
      const codes = (find(page, id)?.risk?.reasons ?? []).map((r: { code: string }) => r.code);
      expect(codes, id).toContain("repeat_order_24h");
    }
    expect(find(page, "d1")?.risk?.reasons.find((r: { code: string }) => r.code === "repeat_order_24h")?.key)
      .toBe("confirmationQueue.risk.reason.repeatOrder24h");
  });

  it("(b2) two pending orders 4 days apart from the same phone are NOT a 24 h repeat and get no flag", async () => {
    h.rows = slowCustomer();
    const page = await getConfirmationWorkbenchPage(actor());
    expect(find(page, "s1")).not.toHaveProperty("risk");
    expect(find(page, "s2")).not.toHaveProperty("risk");
  });

  it("(c) a clean first-time customer gets NO risk key at all (no noise: the order itself is never its own previous order)", async () => {
    h.rows = cleanCustomer();
    const item = find(await getConfirmationWorkbenchPage(actor()), "p-clean");
    expect(item).toBeDefined();
    expect(item).not.toHaveProperty("risk");
    expect(JSON.stringify(item)).not.toContain("risk");
  });

  it("(d) a viewer without contact access gets no phone, name or phone-derived text in the flag; neutral reason stays", async () => {
    h.rows = returnsCustomer();
    const item = find(await getConfirmationWorkbenchPage(actor(["customers.contact.read"])), "p-ret");
    expect(item?.phone).toBeNull();
    expect(item?.customerName).toBeNull();
    const flag = JSON.stringify(item?.risk);
    expect(item?.risk?.reasons[0]?.code).toBe("previous_returns");
    expect(flag).not.toContain("0555111111");
    expect(flag).not.toContain("Client");
    expect(flag).not.toMatch(/\d{6,}/);
    expect(flag).not.toContain("weak_contact");
  });

  it("(e) the page does ONE batched risk query for all visible rows, not one per row", async () => {
    h.rows = [...returnsCustomer(), ...dupCustomer(), ...slowCustomer(), ...cleanCustomer()];
    await getConfirmationWorkbenchPage(actor());
    const n = (k: string) => h.log.filter((x) => x === k).length;
    expect(n("order.pending")).toBe(1);
    expect(n("order.riskRows")).toBe(1);
    expect(n("order.history")).toBe(1);
    expect(n("customer")).toBe(1);
    expect(n("wilaya")).toBe(1);
    expect(vi.mocked(db.order.findMany)).toHaveBeenCalled();
  });

  it("flag-only: the pending rows are all still listed, in the same FIFO order, whatever their risk", async () => {
    h.rows = [...returnsCustomer(), ...dupCustomer(), ...cleanCustomer()];
    const page = await getConfirmationWorkbenchPage(actor());
    expect(page.queue.map((q) => q.id)).toEqual(["p-ret", "d1", "p-clean", "d2"].sort((a, b) => {
      const t = (id: string) => h.rows.find((r) => r.id === id)!.createdAt.getTime();
      return t(a) - t(b);
    }));
    expect(page.total).toBe(4);
  });

  it("records the engine level/score per scenario (documentation of what the rule rests on)", async () => {
    h.rows = [...returnsCustomer(), ...dupCustomer(), ...slowCustomer(), ...cleanCustomer()];
    const ctx = { prisma: db, shop: { shopId: "shop-1" } } as never;
    for (const opts of [undefined, { excludeSelfFromRecency: true }] as const) {
      const map = await (batchAssessOrdersForWorkbench as (...a: unknown[]) => Promise<Map<string, any>>)(
        ctx, ["p-ret", "d1", "d2", "s1", "s2", "p-clean"], opts);
      for (const [id, a] of map) {
        console.info("MEASURE", JSON.stringify(opts ?? "default"), id, a.level, a.score,
          a.factors.filter((f: any) => f.points !== 0).map((f: any) => `${f.id}:${f.points}`).join(","));
      }
      expect(map.size).toBe(6);
    }
  });
});
