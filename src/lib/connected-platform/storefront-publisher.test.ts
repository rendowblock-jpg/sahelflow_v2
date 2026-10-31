import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createDefaultStorefrontTheme } from "@/lib/storefront/theme-default";
import { createStorefrontReleaseInput } from "@/lib/storefront/release-artifact";
import { markLegalReviewed } from "@/lib/storefront/studio-legal";
import type { ServiceContext } from "@/lib/data/service-base";

import type { ConnectedPlatformClient } from "./client";
import { publishHostedStorefront } from "./storefront-publisher";
import type { StorefrontReceiptKeys } from "./runtime";
import type { PreparedStorefrontPublish } from "./storefront-delegation";

const WORKSPACE = "0123456789abcdef0123456789abcdef";
const SHOP = "fedcba9876543210fedcba9876543210";
const STOREFRONT = "storefront_12345678";
const RELEASE = "release_bbbbbbbb";
const PARENT = "release_aaaaaaaa";
const ITEM = "product_12345678:base";

function prepared(stock: number): PreparedStorefrontPublish {
  const theme = createDefaultStorefrontTheme("sahara");
  theme.builder.shippingRules = [{ wilayaCode: "16", deliveryMode: "home", feeDzd: 500 }];
  return {
    storefrontId: STOREFRONT,
    releaseId: RELEASE,
    draftUpdatedAt: "2026-10-19T10:00:00.000Z",
    locale: "ar",
    draft: {
      name: "Sahel store", slug: "sahel-store", description: "", theme,
      selectedProductIds: ["product_12345678"], isActive: true,
      // An active store only goes live with legal texts the seller has read.
      legal: markLegalReviewed({ sellerName: "Sahel store", registerNumber: "", returnsDays: 7, returnShipping: "seller", extraReturns: "", extraTerms: "" }),
    },
    products: [{
      id: "product_12345678", name: "Product", sku: "SKU-1", images: null,
      price: 2500, stock, productVariants: [],
    }],
  };
}

type Scenario = {
  stock: number;
  /** provisional reservation this operation holds, by item */
  provisional?: number;
  /** the release the cloud currently has active (null: never published) */
  activeRelease?: string | null;
  /** what that release still has unsold */
  parentRemaining?: number;
  /** the cloud already has THIS release (a crash after the cloud committed) */
  alreadyCommitted?: boolean;
};

async function run(scenario: Scenario) {
  const sent: Array<Record<string, unknown>> = [];
  const releases = [
    ...(scenario.activeRelease
      ? [{ releaseId: scenario.activeRelease, parentReleaseId: null, templateId: "sahara", locale: "ar", artifactDigest: "d".repeat(64), createdAt: "x", isActive: true }]
      : []),
    ...(scenario.alreadyCommitted
      ? [{ releaseId: RELEASE, parentReleaseId: scenario.activeRelease ?? null, templateId: "sahara", locale: "ar", artifactDigest: "d".repeat(64), createdAt: "x", isActive: false }]
      : []),
  ];
  const client = {
    createStorefront: vi.fn(async () => ({ storefrontId: STOREFRONT, status: "active" })),
    listStorefrontReleases: vi.fn(async () => ({
      storefrontId: STOREFRONT,
      releases,
      activeAllocations: scenario.parentRemaining && scenario.parentRemaining > 0
        ? [{ itemKey: ITEM, remainingQuantity: scenario.parentRemaining }]
        : [],
    })),
    publishStorefrontRelease: vi.fn(async (_id: string, body: unknown) => {
      sent.push(body as Record<string, unknown>);
      return { storefrontId: STOREFRONT, releaseId: RELEASE, artifactDigest: "d".repeat(64), allocations: [], retiredAllocations: [], status: "published" as const, replay: false };
    }),
  };
  const context = {
    prisma: {
      $queryRaw: vi.fn(async () => scenario.provisional
        ? [{ reservationKey: `storefront-provisional:${RELEASE}:${ITEM}`, quantity: scenario.provisional }]
        : []),
    },
    shop: { workspaceId: WORKSPACE, shopId: SHOP },
  } as unknown as ServiceContext;
  await publishHostedStorefront({
    client: client as unknown as ConnectedPlatformClient,
    receiptKeys: { publicKeyJwk: "k", privateKeyPkcs8: "p" } as StorefrontReceiptKeys,
    context,
    prepared: prepared(scenario.stock),
  });
  expect(sent).toHaveLength(1);
  return (sent[0]!.allocations as Array<Record<string, unknown>>);
}

describe("publishHostedStorefront: what it asks the cloud to delegate", () => {
  it("a first release asks for all freed stock and declares no fresh part (there is no parent)", async () => {
    const allocations = await run({ stock: 10, provisional: 10, activeRelease: null });
    expect(allocations).toEqual([{ itemKey: ITEM, unitPriceDzd: 2500, quantity: 10 }]);
  });

  it("a resume after a pause asks for the stock the pause gave back and declares all of it fresh", async () => {
    // the paused release has nothing left (parentRemaining 0), the pause freed 4
    const allocations = await run({ stock: 4, provisional: 4, activeRelease: PARENT, parentRemaining: 0 });
    expect(allocations).toEqual([{ itemKey: ITEM, unitPriceDzd: 2500, quantity: 4, freshQuantity: 4 }]);
  });

  it("a republish carries the unsold stock over and declares only the newly freed part as fresh", async () => {
    const allocations = await run({ stock: 12, provisional: 2, activeRelease: PARENT, parentRemaining: 6 });
    expect(allocations).toEqual([{ itemKey: ITEM, unitPriceDzd: 2500, quantity: 8, freshQuantity: 2 }]);
  });

  it("a republish with nothing newly freed declares no fresh part", async () => {
    const allocations = await run({ stock: 6, provisional: 0, activeRelease: PARENT, parentRemaining: 6 });
    expect(allocations).toEqual([{ itemKey: ITEM, unitPriceDzd: 2500, quantity: 6 }]);
  });

  it("replaying a release the cloud already committed keeps the physical quantity and still declares the fresh part", async () => {
    const allocations = await run({ stock: 8, provisional: 2, activeRelease: PARENT, parentRemaining: 0, alreadyCommitted: true });
    expect(allocations).toEqual([{ itemKey: ITEM, unitPriceDzd: 2500, quantity: 8, freshQuantity: 2 }]);
  });

  it("refuses to ask for more than the shop physically has", async () => {
    await expect(run({ stock: 5, provisional: 4, activeRelease: PARENT, parentRemaining: 3 }))
      .rejects.toThrow(/exceeds physical product stock/);
  });
});

describe("createStorefrontReleaseInput: the fresh part of an allocation", () => {
  const draft = () => {
    const theme = createDefaultStorefrontTheme("sahara");
    theme.builder.shippingRules = [{ wilayaCode: "16", deliveryMode: "home", feeDzd: 500 }];
    return {
      name: "Sahel store", slug: "sahel-store", description: "", theme,
      selectedProductIds: ["product_12345678"], isActive: true,
    };
  };
  const build = (stock: number, fresh?: number) => createStorefrontReleaseInput({
    workspaceId: WORKSPACE, releaseId: RELEASE, parentReleaseId: PARENT, locale: "ar", draft: draft(),
    products: [{ id: "product_12345678", name: "P", sku: null, images: null, price: 100, stock, productVariants: [] }],
    ...(fresh === undefined ? {} : { freshByItemKey: new Map([[ITEM, fresh]]) }),
  });

  it("states the fresh part only when it is positive, so an old-style request is unchanged", () => {
    expect((build(5).allocations as unknown[])[0]).toEqual({ itemKey: ITEM, unitPriceDzd: 100, quantity: 5 });
    expect((build(5, 0).allocations as unknown[])[0]).toEqual({ itemKey: ITEM, unitPriceDzd: 100, quantity: 5 });
    expect((build(5, 3).allocations as unknown[])[0]).toEqual({ itemKey: ITEM, unitPriceDzd: 100, quantity: 5, freshQuantity: 3 });
  });

  it("refuses a fresh part larger than the quantity, negative or fractional", () => {
    for (const bad of [6, -1, 1.5, Number.NaN]) {
      expect(() => build(5, bad), String(bad)).toThrow(/fresh allocation is invalid/);
    }
  });
});
