import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Server readers that say "today" or "this month" must cut it on the shop day
// (Africa/Algiers), whatever zone the computer is set to. Each case fixes the
// clock at an instant where the shop day and the host day differ.

vi.mock("@/lib/wilaya-risk/engine", () => ({ assessOrderRisk: vi.fn() }));

const { projection } = vi.hoisted(() => ({ projection: vi.fn() }));
vi.mock("@/lib/accounting/profitability", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/accounting/profitability")>();
  return { ...original, getProfitabilityProjection: projection };
});

import { loadShopBriefing } from "@/lib/ai/chat/shop-context";
import { getTool, type ChatTool } from "@/lib/ai/chat/tools/registry";
import { shopRecentMonths } from "@/lib/time/shop-day";

interface DayCase {
  zone: string;
  at: string;
  /** 00:00 shop time of the shop day that contains `at`. */
  dayStart: string;
  /** Shop month that contains `at`. */
  monthKey: string;
  monthStart: string;
}

const CASES: DayCase[] = [
  {
    // 00:30 on 1 Nov in Algeria, still 31 Oct 16:30 in Los Angeles.
    zone: "America/Los_Angeles",
    at: "2026-10-31T23:30:00.000Z",
    dayStart: "2026-10-31T23:00:00.000Z",
    monthKey: "2026-11",
    monthStart: "2026-10-31T23:00:00.000Z",
  },
  {
    // 12:00 on 31 Oct in Algeria, already 1 Nov 01:00 on Kiritimati (UTC+14).
    zone: "Pacific/Kiritimati",
    at: "2026-10-31T11:00:00.000Z",
    dayStart: "2026-10-30T23:00:00.000Z",
    monthKey: "2026-10",
    monthStart: "2026-09-30T23:00:00.000Z",
  },
];

const HOUR = 60 * 60 * 1000;

type Call = unknown[];
interface Where {
  createdAt?: { gte?: Date; lte?: Date };
  order?: { createdAt?: { gte?: Date } };
}

function firstWhere(mock: { mock: { calls: Call[] } }): Where {
  const arg = mock.mock.calls[0]?.[0] as { where?: Where } | undefined;
  return arg?.where ?? {};
}

function fakeDb() {
  return {
    order: {
      aggregate: vi.fn((..._args: Call) => Promise.resolve({ _sum: { totalPrice: 0 } })),
      count: vi.fn((..._args: Call) => Promise.resolve(0)),
      findMany: vi.fn((..._args: Call) => Promise.resolve([])),
    },
    orderItem: { findMany: vi.fn((..._args: Call) => Promise.resolve([])) },
  };
}

function ctxFor(db: ReturnType<typeof fakeDb>): never {
  return { db, shop: { shopId: "shop-1", shopIncarnationId: "shop-1" } } as never;
}

let extendedRevenue: ChatTool;
let topProducts: ChatTool;
let returnsSummary: ChatTool;
let salesByWilaya: ChatTool;
let governedRevenue: ChatTool;

function tool(name: string): ChatTool {
  const found = getTool(name);
  if (!found) throw new Error(`tool ${name} is not registered`);
  return found;
}

beforeAll(async () => {
  // get_revenue_report is registered twice; keep each version as it appears.
  await import("@/lib/ai/chat/tools/extended-tools");
  extendedRevenue = tool("get_revenue_report");
  topProducts = tool("get_top_products");
  await import("@/lib/ai/chat/tools/advanced-tools-legacy");
  returnsSummary = tool("get_returns_summary");
  salesByWilaya = tool("get_sales_by_wilaya");
  await import("@/lib/ai/chat/tools/profitability-revenue-report");
  governedRevenue = tool("get_revenue_report");
});

describe.each(CASES)("server readers on the shop day, host in $zone", (testCase) => {
  const { zone, at, dayStart, monthKey, monthStart } = testCase;
  const yesterdayStart = new Date(new Date(dayStart).getTime() - 24 * HOUR).toISOString();
  const lastMsOfYesterday = new Date(new Date(dayStart).getTime() - 1).toISOString();
  let previousZone: string | undefined;

  beforeEach(() => {
    previousZone = process.env.TZ;
    process.env.TZ = zone;
    vi.useFakeTimers();
    vi.setSystemTime(new Date(at));
    projection.mockReset();
    projection.mockResolvedValue({});
  });

  afterEach(() => {
    vi.useRealTimers();
    if (previousZone === undefined) delete process.env.TZ;
    else process.env.TZ = previousZone;
  });

  it("runs under a host zone whose day differs from the shop day", () => {
    const hostMidnight = new Date(at);
    hostMidnight.setHours(0, 0, 0, 0);
    expect(hostMidnight.toISOString()).not.toBe(dayStart);
  });

  it("shop briefing counts orders from the start of the shop day", async () => {
    const count = vi.fn((..._args: Call) => Promise.resolve(0));
    const prisma = {
      order: { count },
      product: { count, fields: { lowStockThreshold: "lowStockThreshold" } },
      delivery: { count },
      $queryRaw: vi.fn(() => Promise.resolve([{ count: 0 }])),
    };
    await loadShopBriefing(prisma as never, { shopIncarnationId: "shop-1" } as never);
    const withDate = count.mock.calls
      .map((call) => (call[0] as { where?: Where } | undefined)?.where)
      .find((where) => where?.createdAt?.gte);
    expect(withDate?.createdAt?.gte?.toISOString()).toBe(dayStart);
  });

  it("get_revenue_report (extended) cuts today and yesterday on the shop day", async () => {
    const today = fakeDb();
    await extendedRevenue.execute({ period: "today" }, ctxFor(today));
    const todayWhere = firstWhere(today.order.aggregate);
    expect(todayWhere.createdAt?.gte?.toISOString()).toBe(dayStart);
    expect(todayWhere.createdAt?.lte?.toISOString()).toBe(at);

    const yesterday = fakeDb();
    await extendedRevenue.execute({ period: "yesterday" }, ctxFor(yesterday));
    const yesterdayWhere = firstWhere(yesterday.order.aggregate);
    expect(yesterdayWhere.createdAt?.gte?.toISOString()).toBe(yesterdayStart);
    expect(yesterdayWhere.createdAt?.lte?.toISOString()).toBe(lastMsOfYesterday);
  });

  it("get_top_products counts today from the start of the shop day", async () => {
    const db = fakeDb();
    await topProducts.execute({ period: "today" }, ctxFor(db));
    expect(firstWhere(db.orderItem.findMany).order?.createdAt?.gte?.toISOString()).toBe(dayStart);
  });

  it("get_returns_summary and get_sales_by_wilaya count today from the start of the shop day", async () => {
    const returns = fakeDb();
    await returnsSummary.execute({ period: "today" }, ctxFor(returns));
    expect(firstWhere(returns.order.count).createdAt?.gte?.toISOString()).toBe(dayStart);

    const wilaya = fakeDb();
    await salesByWilaya.execute({ period: "today" }, ctxFor(wilaya));
    expect(firstWhere(wilaya.order.findMany).createdAt?.gte?.toISOString()).toBe(dayStart);
  });

  it("governed get_revenue_report cuts today and yesterday on the shop day", async () => {
    await governedRevenue.execute({ period: "today" }, ctxFor(fakeDb()));
    const today = projection.mock.calls[0]?.[1] as { from: Date; to: Date } | undefined;
    expect(today?.from.toISOString()).toBe(dayStart);
    expect(today?.to.toISOString()).toBe(at);

    await governedRevenue.execute({ period: "yesterday" }, ctxFor(fakeDb()));
    const yesterday = projection.mock.calls[1]?.[1] as { from: Date; to: Date } | undefined;
    expect(yesterday?.from.toISOString()).toBe(yesterdayStart);
    expect(yesterday?.to.toISOString()).toBe(dayStart);
  });

  it("the accounting page's six month windows end with the shop month", () => {
    const months = shopRecentMonths(new Date(), 6);
    const last = months[months.length - 1];
    expect(months).toHaveLength(6);
    expect(last?.key).toBe(monthKey);
    expect(last?.gte.toISOString()).toBe(monthStart);
  });
});

describe("pages that cut the day or the month use the shop day helpers", () => {
  const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

  it("orders page takes 'today' from shopDayBounds, not from the computer's midnight", () => {
    const page = read("src/app/(dashboard)/orders/page.tsx");
    expect(page).toContain("shopDayBounds(");
    expect(page).not.toMatch(/\.setHours\(/);
  });

  it("accounting page takes its month windows from shopRecentMonths", () => {
    const page = read("src/app/(dashboard)/accounting/page.tsx");
    expect(page).toContain("shopRecentMonths(");
    expect(page).not.toMatch(/\.getFullYear\(\)|\.getMonth\(\)/);
  });
});
