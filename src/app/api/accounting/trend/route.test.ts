import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

const mockOrders = [
  { total_price: 10000, delivered_at: "2026-05-18T10:00:00Z", items: [{ cost_price: 3000, quantity: 2 }] },
  { total_price: 5000, delivered_at: "2026-05-19T14:30:00Z", items: [{ cost_price: 1500, quantity: 1 }] },
];

const mockAllOrders = [
  { delivery_cost: 1000, status: "delivered", created_at: "2026-05-18T09:00:00Z" },
  { delivery_cost: 800, status: "returned", created_at: "2026-05-19T11:00:00Z" },
];

const mockExpenses = [
  { amount: 500, expense_date: "2026-05-18" },
  { amount: 1500, expense_date: "2026-05-19" },
];

const mockRefunds = [
  { refund_amount: 2000, resolved_at: "2026-05-19T16:00:00Z" },
];

const mockDb = {
  orders_delivered: { data: mockOrders, error: null },
  orders_all: { data: mockAllOrders, error: null },
  expenses: { data: mockExpenses, error: null },
  returns: { data: mockRefunds, error: null },
};

function createMockSupabase() {
  const chain: any = {};
  chain.from = vi.fn((table) => {
    const tableChain: any = {};
    tableChain.select = vi.fn(() => tableChain);
    tableChain.eq = vi.fn(() => tableChain);
    tableChain.in = vi.fn(() => tableChain);
    tableChain.gte = vi.fn(() => {
      if (table === "expenses") {
        return Promise.resolve(mockDb.expenses);
      }
      if (table === "returns") {
        return Promise.resolve(mockDb.returns);
      }
      return tableChain;
    });
    tableChain.is = vi.fn(() => {
      const isDeliveredQuery = tableChain.eq.mock.calls.some((c: any) => c[0] === "status" && c[1] === "delivered");
      return Promise.resolve(isDeliveredQuery ? mockDb.orders_delivered : mockDb.orders_all);
    });
    return tableChain;
  });
  return chain;
}

const mockSupabase = createMockSupabase();

// Mock Supabase Server Client
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve({
    auth: {
      getUser: vi.fn(() => Promise.resolve({
        data: { user: { id: "test-user-id" } },
        error: null,
      })),
    },
    from: mockSupabase.from,
  })),
}));

// Mock Team Service
vi.mock("@/lib/data/team-service", () => ({
  getUserSellerContext: vi.fn(() => Promise.resolve({
    sellerId: "test-user-id",
    role: "owner",
    status: "active",
  })),
}));

// Mock Rate Limiting
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn().mockResolvedValue({
    allowed: true,
    remaining: 59,
    resetAt: Date.now() + 60000,
    provider: "memory",
  }),
  rateLimitHeaders: vi.fn().mockReturnValue({}),
  getClientIP: vi.fn().mockReturnValue("127.0.0.1"),
}));

describe("GET /api/accounting/trend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-24T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should aggregate daily trend data correctly", async () => {
    const req = new NextRequest("http://localhost/api/accounting/trend?period=7d");
    const res = await GET(req as any);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.trend).toBeDefined();
    expect(Array.isArray(body.trend)).toBe(true);

    // Let's check grouping logic for 2026-05-18
    const entry18 = body.trend.find((t: any) => t.date === "2026-05-18");
    expect(entry18).toBeDefined();
    // 2026-05-18:
    // Revenue: 10000 (delivered)
    // COGS: 3000 * 2 = 6000
    // Delivery: 1000
    // Return losses: 0 (delivered)
    // Expenses: 500
    // Refunds: 0
    // Total Expenses: 6000 + 1000 + 0 + 500 + 0 = 7500
    // Net Profit: 10000 - 7500 = 2500
    expect(entry18.revenue).toBe(10000);
    expect(entry18.cogs).toBe(6000);
    expect(entry18.delivery).toBe(1000);
    expect(entry18.expenses).toBe(500);
    expect(entry18.totalExpenses).toBe(7500);
    expect(entry18.netProfit).toBe(2500);

    // Let's check grouping logic for 2026-05-19
    const entry19 = body.trend.find((t: any) => t.date === "2026-05-19");
    expect(entry19).toBeDefined();
    // 2026-05-19:
    // Revenue: 5000 (delivered)
    // COGS: 1500 * 1 = 1500
    // Delivery: 800 (from mockAllOrders returned)
    // Return losses: 800 (returned status)
    // Expenses: 1500
    // Refunds: 2000
    // Total Expenses: 1500 + 800 + 800 + 1500 + 2000 = 6600
    // Net Profit: 5000 - 6600 = -1600
    expect(entry19.revenue).toBe(5000);
    expect(entry19.cogs).toBe(1500);
    expect(entry19.delivery).toBe(800);
    expect(entry19.returnLosses).toBe(800);
    expect(entry19.expenses).toBe(1500);
    expect(entry19.refunds).toBe(2000);
    expect(entry19.totalExpenses).toBe(6600);
    expect(entry19.netProfit).toBe(-1600);
  });
});
