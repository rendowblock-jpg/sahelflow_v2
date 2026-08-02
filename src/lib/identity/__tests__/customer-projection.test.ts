import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/identity/trusted-actor", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/identity/trusted-actor")
  >();
  return { ...actual, isTrustedActorContext: vi.fn(() => true) };
});

import { projectCustomerForTrustedActor } from "../customer-projection";
import type { Phase2Action } from "../permissions";
import type { TrustedActorContext } from "../trusted-actor";
import type { Customer } from "@/types/domain";

const CUSTOMER = {
  id: "customer-1",
  name: "Amina",
  phone: "0555000000",
  phone2: "0666000000",
  wilaya: "Alger",
  commune: "Bab Ezzouar",
  address: "Street 1",
  orderCount: 4,
  totalSpent: 18_000,
  riskScore: 8,
  isBlacklisted: false,
  blacklistReason: null,
  blacklistedAt: null,
  notes: "Call after 18:00",
  createdAt: new Date("2026-08-01T00:00:00.000Z"),
  updatedAt: new Date("2026-08-01T00:00:00.000Z"),
  phoneEnc: "encrypted-phone",
  nameBlindIndex: "blind-name",
  deletedAt: null,
} as Customer & {
  phoneEnc: string;
  nameBlindIndex: string;
  deletedAt: null;
};

function context(permissions: readonly Phase2Action[]): TrustedActorContext {
  return {
    version: 1,
    actor: {
      kind: "person",
      personId: "1".repeat(32),
      workspaceMemberId: "2".repeat(32),
      deviceId: "3".repeat(32),
      sessionId: "session-1",
      role: "viewer",
      permissions,
      policyVersion: 1,
      revocationEpoch: 0,
    },
    shop: { shopId: "shop-a" },
  } as TrustedActorContext;
}

describe("customer field projection", () => {
  it("redacts all protected contact fields and storage indexes", () => {
    const projected = projectCustomerForTrustedActor(
      context(["customers.read"]),
      CUSTOMER,
    );

    expect(projected).toMatchObject({
      id: "customer-1",
      name: null,
      phone: null,
      phone2: null,
      wilaya: null,
      commune: null,
      address: null,
      notes: null,
      totalSpent: null,
      orderCount: 4,
      fieldAccess: { contact: false, financials: false },
    });
    expect(projected).not.toHaveProperty("phoneEnc");
    expect(projected).not.toHaveProperty("nameBlindIndex");
    expect(projected).not.toHaveProperty("deletedAt");
  });

  it("reveals contact fields only with the exact read grant", () => {
    const projected = projectCustomerForTrustedActor(
      context(["customers.read", "customers.contact.read"]),
      CUSTOMER,
    );

    expect(projected).toMatchObject({
      name: "Amina",
      phone: "0555000000",
      phone2: "0666000000",
      wilaya: "Alger",
      commune: "Bab Ezzouar",
      address: "Street 1",
      notes: "Call after 18:00",
      totalSpent: null,
      fieldAccess: { contact: true, financials: false },
    });
  });

  it("reveals lifetime spend only with financial read authority", () => {
    expect(
      projectCustomerForTrustedActor(
        context(["customers.read", "orders.financials.read"]),
        CUSTOMER,
      ),
    ).toMatchObject({
      totalSpent: 18_000,
      fieldAccess: { contact: false, financials: true },
    });
  });

  it("denies projection without customers.read", () => {
    expect(() =>
      projectCustomerForTrustedActor(
        context(["customers.contact.read"]),
        CUSTOMER,
      ),
    ).toThrow(/customers\.read/);
  });
});
