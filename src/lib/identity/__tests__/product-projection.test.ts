import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/identity/trusted-actor", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/identity/trusted-actor")
  >();
  return { ...actual, isTrustedActorContext: vi.fn(() => true) };
});

import { projectProductForTrustedActor } from "../product-projection";
import type { Phase2Action } from "../permissions";
import type { TrustedActorContext } from "../trusted-actor";
import type { Product } from "@/types/domain";

const PRODUCT = {
  id: "product-1",
  name: "Widget",
  sku: "SKU-1",
  price: 2_000,
  cost: 900,
  stock: 10,
  lowStockThreshold: 2,
  categoryId: null,
  variants: null,
  images: null,
  isActive: true,
  createdAt: new Date("2026-08-01T00:00:00.000Z"),
  updatedAt: new Date("2026-08-01T00:00:00.000Z"),
  deletedAt: null,
} as Product & { deletedAt: null };

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

describe("product cost projection", () => {
  it("redacts unit cost and storage-only fields without cost authority", () => {
    const projected = projectProductForTrustedActor(
      context(["products.read"]),
      PRODUCT,
    );

    expect(projected).toMatchObject({
      id: "product-1",
      price: 2_000,
      cost: null,
      fieldAccess: { cost: false },
    });
    expect(projected).not.toHaveProperty("deletedAt");
  });

  it("reveals cost only with products.cost.read", () => {
    expect(
      projectProductForTrustedActor(
        context(["products.read", "products.cost.read"]),
        PRODUCT,
      ),
    ).toMatchObject({ cost: 900, fieldAccess: { cost: true } });
  });

  it("denies projection without products.read", () => {
    expect(() =>
      projectProductForTrustedActor(
        context(["products.cost.read"]),
        PRODUCT,
      ),
    ).toThrow(/products\.read/);
  });
});
