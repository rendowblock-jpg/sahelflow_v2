import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  trustedActorAuditIdentity: vi.fn(),
  logAudit: vi.fn(),
  findCustomer: vi.fn(),
  listBlacklistedCustomers: vi.fn(),
  blacklistCustomer: vi.fn(),
  assessOrderRiskPreCreate: vi.fn(),
  assessOrderRisk: vi.fn(),
  checkPhoneReputation: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({
  requireAuth: harness.requireAuth,
}));

vi.mock("@/lib/risk-engine", () => ({
  listBlacklistedCustomers: harness.listBlacklistedCustomers,
  blacklistCustomer: harness.blacklistCustomer,
  assessOrderRiskPreCreate: harness.assessOrderRiskPreCreate,
  assessOrderRisk: harness.assessOrderRisk,
}));

vi.mock("@/lib/data/phone-reputation", () => ({
  checkPhoneReputation: harness.checkPhoneReputation,
}));

vi.mock("@/lib/identity/authorization", () => ({
  trustedActorAuditIdentity: harness.trustedActorAuditIdentity,
}));

vi.mock("@/lib/audit", () => ({
  logAudit: harness.logAudit,
}));

vi.mock("@/lib/db", () => ({
  db: { customer: { findUnique: harness.findCustomer } },
  shopContext: { shopId: "shop-a" },
}));

vi.mock("@/lib/api/with-error-handler", () => ({
  withErrorHandler:
    (handler: (...args: never[]) => Promise<Response>) =>
    async (...args: never[]): Promise<Response> => handler(...args),
}));

import {
  GET as GETBlacklist,
  POST as POSTBlacklist,
} from "@/app/api/risk/blacklist/route";
import { POST as POSTPreCreate } from "@/app/api/risk/assess-pre-create/route";
import {
  GET as GETOrderAssessment,
  POST as POSTOrderAssessment,
} from "@/app/api/risk/assess/[orderId]/route";
import { GET as GETPhoneReputation } from "@/app/api/phone-reputation/check/route";

const BLACKLIST_READ_ACTIONS = [
  "risk.read",
  "customers.read",
  "customers.contact.read",
] as const;

const BLACKLIST_WRITE_ACTIONS = [
  "risk.manage",
  "customers.manage",
] as const;

const PHONE_REPUTATION_READ_ACTIONS = [
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
    harness.requireAuth.mockReset().mockResolvedValue({
      actor: { kind: "person", personId: "person-1" },
      shop: { shopId: "shop-a" },
    });
    harness.trustedActorAuditIdentity
      .mockReset()
      .mockReturnValue("person:person-1");
    harness.logAudit.mockReset().mockResolvedValue(undefined);
    harness.findCustomer.mockReset().mockResolvedValue(null);
    harness.listBlacklistedCustomers.mockReset().mockResolvedValue([]);
    harness.blacklistCustomer.mockReset().mockResolvedValue(undefined);
    harness.assessOrderRiskPreCreate.mockReset().mockResolvedValue(assessment);
    harness.assessOrderRisk.mockReset().mockResolvedValue(assessment);
    harness.checkPhoneReputation.mockReset().mockResolvedValue({ isBad: false });
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

  it("denies blacklist mutation before parsing, customer read or write", async () => {
    harness.requireAuth.mockRejectedValue(new Error("customer manage forbidden"));
    const request = new NextRequest("http://localhost/api/risk/blacklist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId: "customer-1" }),
    });

    await expect(POSTBlacklist(request)).rejects.toThrow(
      "customer manage forbidden",
    );
    expect(harness.requireAuth).toHaveBeenCalledWith(BLACKLIST_WRITE_ACTIONS);
    expect(harness.findCustomer).not.toHaveBeenCalled();
    expect(harness.blacklistCustomer).not.toHaveBeenCalled();
    expect(harness.logAudit).not.toHaveBeenCalled();
  });

  it("attributes an authorized blacklist mutation to the trusted actor", async () => {
    const before = {
      id: "customer-1",
      isBlacklisted: false,
      blacklistReason: null,
      blacklistedAt: null,
    };
    harness.findCustomer.mockResolvedValue(before);
    const request = new NextRequest("http://localhost/api/risk/blacklist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerId: "customer-1",
        reason: "Repeated refusals",
      }),
    });

    const response = await POSTBlacklist(request);

    expect(response.status).toBe(201);
    expect(harness.requireAuth).toHaveBeenCalledWith(BLACKLIST_WRITE_ACTIONS);
    expect(harness.blacklistCustomer).toHaveBeenCalledWith(
      expect.any(Object),
      "customer-1",
      "Repeated refusals",
    );
    expect(harness.trustedActorAuditIdentity).toHaveBeenCalledWith({
      kind: "person",
      personId: "person-1",
    });
    expect(harness.logAudit).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        action: "customer.blacklisted",
        entityId: "customer-1",
        actor: "person:person-1",
        before,
        after: {
          isBlacklisted: true,
          blacklistReason: "Repeated refusals",
        },
      }),
    );
  });

  it("denies an arbitrary-phone reputation probe before the lookup", async () => {
    harness.requireAuth.mockRejectedValue(new Error("contact forbidden"));
    const request = new NextRequest(
      "http://localhost/api/phone-reputation/check?phone=0555000000",
    );

    await expect(GETPhoneReputation(request)).rejects.toThrow(
      "contact forbidden",
    );
    expect(harness.requireAuth).toHaveBeenCalledWith(
      PHONE_REPUTATION_READ_ACTIONS,
    );
    expect(harness.checkPhoneReputation).not.toHaveBeenCalled();
  });

  it("checks phone reputation after the complete protected read grant", async () => {
    harness.checkPhoneReputation.mockResolvedValue({
      isBad: true,
      reason: "Repeated refusals",
      reportedAt: "2026-08-01T00:00:00.000Z",
    });
    const request = new NextRequest(
      "http://localhost/api/phone-reputation/check?phone=0555000000",
    );

    const response = await GETPhoneReputation(request);

    expect(response.status).toBe(200);
    expect(harness.requireAuth).toHaveBeenCalledWith(
      PHONE_REPUTATION_READ_ACTIONS,
    );
    expect(harness.checkPhoneReputation).toHaveBeenCalledWith(
      expect.any(Object),
      "0555000000",
    );
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
