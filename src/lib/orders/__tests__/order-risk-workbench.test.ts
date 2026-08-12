import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  orderFindMany: vi.fn(),
  customerFindMany: vi.fn(),
  wilayaFindMany: vi.fn(),
  getRiskConfig: vi.fn(),
  getRiskRules: vi.fn(),
  assessRisk: vi.fn(),
}));

vi.mock("@/lib/risk-engine", () => ({
  getRiskConfig: mocks.getRiskConfig,
  getRiskRules: mocks.getRiskRules,
  assessRisk: mocks.assessRisk,
}));

import { batchAssessOrdersForWorkbench } from "../order-risk-workbench";
import type { ServiceContext } from "@/lib/data/service-base";

const config = {
  weights: {
    customerHistory: 1,
    geography: 1,
    orderValue: 1,
    contactQuality: 1,
    behavior: 1,
  },
  thresholds: { low: 25, medium: 50, high: 75 },
  autoActions: {
    autoConfirmLow: false,
    autoHoldCritical: true,
    autoFlagBlacklist: true,
  },
  autoBlacklistReturnRate: 0.5,
};

const rules = [
  {
    id: "blacklist_hold",
    labelKey: "risk.rules.blacklistHold",
    enabled: true,
    condition: { type: "customer_is_blacklisted" as const },
    effect: { type: "set_action" as const, action: "blacklisted" as const },
    triggerCount: 0,
  },
];

function context(): ServiceContext {
  return {
    prisma: {
      order: { findMany: mocks.orderFindMany },
      customer: { findMany: mocks.customerFindMany },
      wilayaRiskProfile: { findMany: mocks.wilayaFindMany },
    },
  } as unknown as ServiceContext;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getRiskConfig.mockResolvedValue(config);
  mocks.getRiskRules.mockResolvedValue(rules);
  mocks.assessRisk.mockImplementation((input) => ({
    score: input.customerHistory?.isBlacklisted ? 95 : 18,
    level: input.customerHistory?.isBlacklisted ? "critical" : "low",
    action: input.customerHistory?.isBlacklisted ? "blacklisted" : "standard",
    confidence: 0.8,
    factors: [],
    ruleOverride: false,
    triggeredRules: [],
    assessedAt: "2026-08-12T00:00:00.000Z",
  }));
});

describe("Orders workbench risk projection", () => {
  it("projects a page with bounded batch reads and preserves scoring inputs", async () => {
    mocks.orderFindMany
      .mockResolvedValueOnce([
        {
          id: "order-a",
          totalPrice: 6_000,
          wilaya: "Alger",
          commune: "Bab Ezzouar",
          address: "12 Rue A",
          phone: "0555000001",
          source: "manual",
          createdAt: new Date("2026-08-10T10:00:00.000Z"),
          customerId: "customer-a",
        },
        {
          id: "order-b",
          totalPrice: 3_000,
          wilaya: "Oran",
          commune: "Oran",
          address: "8 Rue B",
          phone: "0666000002",
          source: "storefront",
          createdAt: new Date("2026-08-11T10:00:00.000Z"),
          customerId: "customer-b",
        },
      ])
      .mockResolvedValueOnce([
        {
          customerId: "customer-a",
          status: "delivered",
          totalPrice: 4_000,
          createdAt: new Date("2026-07-01T09:00:00.000Z"),
        },
        {
          customerId: "customer-a",
          status: "returned",
          totalPrice: 2_500,
          createdAt: new Date("2026-07-10T09:00:00.000Z"),
        },
        {
          customerId: "customer-b",
          status: "cancelled",
          totalPrice: 3_000,
          createdAt: new Date("2026-07-20T09:00:00.000Z"),
        },
      ]);
    mocks.customerFindMany.mockResolvedValue([
      { id: "customer-a", isBlacklisted: true },
      { id: "customer-b", isBlacklisted: false },
    ]);
    mocks.wilayaFindMany.mockResolvedValue([
      {
        wilaya: "Alger",
        riskLevel: 2,
        confirmationRate: 0.82,
        returnRate: 0.12,
      },
      {
        wilaya: "Oran",
        riskLevel: 3,
        confirmationRate: null,
        returnRate: null,
      },
    ]);

    const result = await batchAssessOrdersForWorkbench(context(), [
      "order-a",
      "order-b",
      "order-a",
    ]);

    expect(mocks.orderFindMany).toHaveBeenCalledTimes(2);
    expect(mocks.orderFindMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { id: { in: ["order-a", "order-b"] }, deletedAt: null },
      }),
    );
    expect(mocks.orderFindMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          customerId: { in: ["customer-a", "customer-b"] },
          deletedAt: null,
        },
        orderBy: [{ customerId: "asc" }, { createdAt: "asc" }],
      }),
    );
    expect(mocks.customerFindMany).toHaveBeenCalledTimes(1);
    expect(mocks.customerFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["customer-a", "customer-b"] }, deletedAt: null },
      }),
    );
    expect(mocks.wilayaFindMany).toHaveBeenCalledTimes(1);
    expect(mocks.wilayaFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { wilaya: { in: ["Alger", "Oran"] } },
      }),
    );
    expect(mocks.getRiskConfig).toHaveBeenCalledTimes(1);
    expect(mocks.getRiskRules).toHaveBeenCalledTimes(1);
    expect(mocks.assessRisk).toHaveBeenCalledTimes(2);

    expect(mocks.assessRisk).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        order: expect.objectContaining({
          totalPrice: 6_000,
          wilaya: "Alger",
          phone: "0555000001",
        }),
        customerHistory: {
          customerId: "customer-a",
          totalOrders: 2,
          deliveredCount: 1,
          returnedCount: 1,
          refusedCount: 0,
          cancelledCount: 0,
          totalSpent: 6_500,
          firstOrderDate: new Date("2026-07-01T09:00:00.000Z"),
          lastOrderDate: new Date("2026-07-10T09:00:00.000Z"),
          isBlacklisted: true,
        },
        wilayaRisk: {
          riskLevel: 2,
          confirmationRate: 0.82,
          returnRate: 0.12,
        },
      }),
      config,
      rules,
    );
    expect(mocks.assessRisk).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        customerHistory: expect.objectContaining({
          customerId: "customer-b",
          totalOrders: 1,
          cancelledCount: 1,
          totalSpent: 0,
          isBlacklisted: false,
        }),
        wilayaRisk: {
          riskLevel: 3,
          confirmationRate: 0,
          returnRate: 0,
        },
      }),
      config,
      rules,
    );
    expect(result.get("order-a")).toMatchObject({
      score: 95,
      level: "critical",
    });
    expect(result.get("order-b")).toMatchObject({ score: 18, level: "low" });
  });

  it("returns immediately for an empty page without touching risk or protected data", async () => {
    const result = await batchAssessOrdersForWorkbench(context(), []);

    expect(result.size).toBe(0);
    expect(mocks.orderFindMany).not.toHaveBeenCalled();
    expect(mocks.customerFindMany).not.toHaveBeenCalled();
    expect(mocks.wilayaFindMany).not.toHaveBeenCalled();
    expect(mocks.getRiskConfig).not.toHaveBeenCalled();
    expect(mocks.getRiskRules).not.toHaveBeenCalled();
    expect(mocks.assessRisk).not.toHaveBeenCalled();
  });
});
