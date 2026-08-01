import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/identity/trusted-actor", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/identity/trusted-actor")
  >();
  return { ...actual, isTrustedActorContext: vi.fn(() => true) };
});

import { projectOrderForTrustedActor } from "../order-projection";
import type { TrustedActorContext } from "../trusted-actor";
import type { Order } from "@/types/domain";

const SHOP = Object.freeze({
  workspaceId: "1".repeat(32),
  installationId: "2".repeat(32),
  shopId: "shop-a",
  shopIncarnationId: "3".repeat(32),
  registryRevision: 1,
  databaseFileId: "shop-a.db",
  migrationSetSha256: "4".repeat(64),
});

const ORDER: Order = {
  id: "order-1",
  orderNumber: "ORD-1",
  status: "pending",
  version: 1,
  customerId: "customer-1",
  items: [
    {
      id: "item-1",
      orderId: "order-1",
      productId: "product-1",
      productVariantId: null,
      productName: "Product",
      productVariantName: null,
      quantity: 2,
      unitPrice: 1_500,
      total: 3_000,
    },
  ],
  totalPrice: 3_500,
  deliveryCost: 500,
  wilaya: "Alger",
  commune: "Bab Ezzouar",
  address: "Street 1",
  phone: "0555000000",
  source: "manual",
  sourceOrderId: null,
  sourceMetadata: null,
  notes: "Call after 18:00",
  confirmedAt: null,
  packedAt: null,
  shippedAt: null,
  deliveredAt: null,
  fulfillmentState: null,
  deliveryState: null,
  inventoryState: null,
  codState: null,
  createdAt: new Date("2026-08-01T00:00:00.000Z"),
  updatedAt: new Date("2026-08-01T00:00:00.000Z"),
};

function context(
  role: "owner" | "manager" | "operator" | "viewer",
  permissions?: readonly string[],
): TrustedActorContext {
  return {
    version: 1,
    actor: {
      kind: "person",
      personId: "5".repeat(32),
      workspaceMemberId: "6".repeat(32),
      deviceId: "7".repeat(32),
      sessionId: "session-1",
      role,
      policyVersion: 1,
      revocationEpoch: 0,
      ...(permissions ? { permissions: JSON.stringify(permissions) } : {}),
    },
    shop: SHOP,
  } as TrustedActorContext;
}

describe("order field projections", () => {
  it("redacts contact and financial fields for the viewer preset", () => {
    const projected = projectOrderForTrustedActor(context("viewer"), ORDER);

    expect(projected).toMatchObject({
      phone: null,
      address: null,
      notes: null,
      totalPrice: null,
      deliveryCost: null,
      fieldAccess: { contact: false, financials: false },
    });
    expect(projected.items[0]).toMatchObject({
      productName: "Product",
      quantity: 2,
      unitPrice: null,
      total: null,
    });
  });

  it("reveals contact but not money for an exact custom allowlist", () => {
    const projected = projectOrderForTrustedActor(
      context("operator", ["orders.read", "customers.contact.read"]),
      ORDER,
    );

    expect(projected).toMatchObject({
      phone: "0555000000",
      address: "Street 1",
      notes: "Call after 18:00",
      totalPrice: null,
      deliveryCost: null,
      fieldAccess: { contact: true, financials: false },
    });
  });

  it("preserves full order fields for owner authority", () => {
    const projected = projectOrderForTrustedActor(context("owner"), ORDER);

    expect(projected).toMatchObject({
      phone: "0555000000",
      address: "Street 1",
      totalPrice: 3_500,
      deliveryCost: 500,
      fieldAccess: { contact: true, financials: true },
    });
    expect(projected.items[0]).toMatchObject({ unitPrice: 1_500, total: 3_000 });
  });

  it("denies a custom actor without orders.read", () => {
    expect(() =>
      projectOrderForTrustedActor(
        context("operator", ["customers.contact.read"]),
        ORDER,
      ),
    ).toThrow(/orders\.read/);
  });
});
