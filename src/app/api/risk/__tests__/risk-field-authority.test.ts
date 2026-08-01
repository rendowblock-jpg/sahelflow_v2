import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  listBlacklistedCustomers: vi.fn(),
  assessOrderRiskPreCreate: vi.fn(),
  assessOrderRisk: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({
  requireAuth: harness.requireAuth,
}));

vi.mock("@/lib/risk-engine", () => ({
  listBlacklistedCustomers: harness.listBlacklistedCustomers,
  assessOrderRiskPreCreate: harness.assessOrderRiskPreCreate,
  assessOrderRisk: harness.assessOrderRisk,
}));

vi.mock("@/lib/db", () => ({
  db: {},
  shopContext: { shopId: "shop-a" },
}));

vi.mock("@/lib/api/with-error-handler", () => ({
  withErrorHandler:
    (handler: (...args: never[]) => Promise<Response>) =>
    async (...args: never[]): Promise<Response> => handler(...args),
}));

import { GET as GETBlacklist } from "@/app/api/risk/blacklist/route";
import { POST as POSTPreCreate } from "@/app/api/risk/assess-pre-create/route";
import {
  GET as GETOrderAssessment,
  POST as POSTOrderAssessment,
} from "@/app/api/risk/assess/[orderId]/route";

const BLACKLIST_READ_ACTIONS = [
  "risk.read",
  "customers.read",
  "customers.contact.read",
] as const;

const PRE_CREATE_RISK_ACTIONS = [
  "risk.read",
  "orders.create",
  "customers.read",
  "customers.contact.read",
  "orders.financials.read",
] as const;

const ORDER_RISK_READ_ACTIONS = [
  "risk.read",
  "orders.read",
  "customers.read",
  "customers.contact.read",
  "orders.financials.read",
] as const;

const assessment = {
  score: 42,
  level: "medium",
  action: "call_first",
  confidence: 0.6,
  factors: [],
  ruleOverride: false,
  triggeredRules: [],
  assessedAt: "2026-08-01T00:00:00.000Z",
};

describe("risk field authority", () => {
  beforeEach(() => {
    harness.requireAuth.mockReset().mockResolvedValue(undefined);
    harness.listBlacklistedCustomers.mockReset().mockResolvedValue([]);
    harness.assessOrderRiskPreCreate.mockReset().mockResolvedValue(assessment);
    harness.assessOrderRisk.mockReset().mockResolvedValue(assessment);
  });

  it("denies blacklist contact data before reading customers", async () => {
    harness.requireAuth.mockRejectedValue(new Error("contact forbidden"));

    await expect(GETBlacklist()).rejects.toThrow("contact forbidden");
    expect(harness.requireAuth).toHaveBeenCalledWith(BLACKLIST_READ_ACTIONS);
    expect(harness.listBlacklistedCustomers).not.toHaveBeenCalled();
  });

  it("returns blacklist contact data after the complete read grant", async () => {
    harness.listBlacklistedCustomers.mockResolvedValue([
      {
        id: "customer-1",
        name: "Amina",
        phone: "0555000000",
        notes: "Call after 18:00",
        orderCount: 3,
        blacklistReason: "Repeated refusals",
        blacklistedAt: new Date("2026-08-01T00:00:00.000Z"),
      },
    ]);

    const response = await GETBlacklist();

    expect(response.status).toBe(200);
    expect(harness.requireAuth).toHaveBeenCalledWith(BLACKLIST_READ_ACTIONS);
    await expect(response.json()).resolves.toMatchObject({
      customers: [{ id: "customer-1", phone: "0555000000" }],
    });
  });

  it("blocks arbitrary-phone pre-create probes before parsing or history lookup", async () => {
    harness.requireAuth.mockRejectedValue(new Error("contact forbidden"));
    const request = new NextRequest(
      "http://localhost/api/risk/assess-pre-create",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: "0555000000" }),
      },
    );

    await expect(POSTPreCreate(request)).rejects.toThrow("contact forbidden");
    expect(harness.requireAuth).toHaveBeenCalledWith(PRE_CREATE_RISK_ACTIONS);
    expect(harness.assessOrderRiskPreCreate).not.toHaveBeenCalled();
  });

  it("reads pre-create history only after create, contact, customer and financial grants", async () => {
    const request = new NextRequest(
      "http://localhost/api/risk/assess-pre-create",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: "0555000000",
          wilaya: "Alger",
          totalPrice: 5_000,
        }),
      },
    );

    const response = await POSTPreCreate(request);

    expect(response.status).toBe(200);
    expect(harness.requireAuth).toHaveBeenCalledWith(PRE_CREATE_RISK_ACTIONS);
    expect(harness.assessOrderRiskPreCreate).toHaveBeenCalledOnce();
  });

  it.each([
    ["GET", GETOrderAssessment],
    ["POST", POSTOrderAssessment],
  ] as const)(
    "denies %s order assessment before reading protected order history",
    async (method, handler) => {
      harness.requireAuth.mockRejectedValue(new Error("financials forbidden"));
      const request = new NextRequest(
        "http://localhost/api/risk/assess/order-1",
        { method },
      );

      await expect(
        handler(request, {
          params: Promise.resolve({ orderId: "order-1" }),
        }),
      ).rejects.toThrow("financials forbidden");
      expect(harness.requireAuth).toHaveBeenCalledWith(
        ORDER_RISK_READ_ACTIONS,
      );
      expect(harness.assessOrderRisk).not.toHaveBeenCalled();
    },
  );

  it("returns an order assessment after the complete protected read grant", async () => {
    const response = await GETOrderAssessment(
      new NextRequest("http://localhost/api/risk/assess/order-1"),
      { params: Promise.resolve({ orderId: "order-1" }) },
    );

    expect(response.status).toBe(200);
    expect(harness.requireAuth).toHaveBeenCalledWith(ORDER_RISK_READ_ACTIONS);
    await expect(response.json()).resolves.toMatchObject({
      assessment: { score: 42, level: "medium" },
    });
  });
});
