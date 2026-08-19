import { describe, expect, it } from "vitest";

import {
  flattenNavigationItems,
  navigationDomainForPathname,
  navigationDomains,
  navigationItemForPathname,
  sellerSidebarNavigationItems,
  utilityNavigationItems,
} from "../navigation";

describe("Phase 5 navigation authority", () => {
  it("preserves the eight semantic business domains including Storefront Builder", () => {
    expect(navigationDomains.map((domain) => domain.id)).toEqual([
      "home",
      "sell",
      "customers",
      "fulfill",
      "money",
      "inbox",
      "storefront",
      "grow",
    ]);
  });

  it("keeps every destination unique under one canonical registry", () => {
    const items = flattenNavigationItems();
    const hrefs = items.map((item) => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(hrefs).toContain("/orders/confirmation-queue");
    expect(hrefs).toContain("/accounting/cod-reconciliation");
    expect(hrefs).toContain("/storefronts");
    expect(hrefs).toContain("/settings");
  });

  it("maps nested route families to their durable business domain", () => {
    expect(navigationDomainForPathname("/orders/abc")?.id).toBe("sell");
    expect(navigationDomainForPathname("/products/abc")?.id).toBe("sell");
    expect(navigationDomainForPathname("/returns/abc")?.id).toBe("fulfill");
    expect(
      navigationDomainForPathname("/accounting/cod-reconciliation")?.id,
    ).toBe("money");
    expect(navigationDomainForPathname("/automations")?.id).toBe("grow");
    expect(navigationDomainForPathname("/storefronts/new")?.id).toBe(
      "storefront",
    );
  });

  it("resolves the most specific contextual destination", () => {
    expect(
      navigationItemForPathname("/orders/confirmation-queue")?.href,
    ).toBe("/orders/confirmation-queue");
    expect(navigationItemForPathname("/products/product-1")?.href).toBe(
      "/products",
    );
    expect(
      navigationItemForPathname("/accounting/cod-reconciliation")?.href,
    ).toBe("/accounting/cod-reconciliation");
    expect(navigationItemForPathname("/storefronts/new")?.href).toBe(
      "/storefronts",
    );
  });

  it("keeps Profile inside Settings rather than as a fixed utility destination", () => {
    expect(utilityNavigationItems.map((item) => item.href)).toEqual(["/settings"]);
    expect(navigationItemForPathname("/profile")).toBeNull();
    expect(navigationDomainForPathname("/settings")).toBeNull();
    expect(navigationDomainForPathname("/profile")).toBeNull();
  });

  it("ships one stable seller-priority sidebar sequence", () => {
    expect(sellerSidebarNavigationItems.map((item) => item.href)).toEqual([
      "/dashboard",
      "/orders",
      "/orders/confirmation-queue",
      "/inbox",
      "/products",
      "/customers",
      "/deliveries",
      "/returns",
      "/analytics",
      "/accounting",
      "/accounting/cod-reconciliation",
      "/risk",
      "/storefronts",
      "/automations",
      "/agents",
      "/imports",
    ]);
    expect(new Set(sellerSidebarNavigationItems.map((item) => item.href)).size).toBe(
      sellerSidebarNavigationItems.length,
    );
    expect(
      sellerSidebarNavigationItems.find(
        (item) => item.href === "/orders/confirmation-queue",
      )?.sidebarNested,
    ).toBe(true);
    expect(
      sellerSidebarNavigationItems.find(
        (item) => item.href === "/accounting/cod-reconciliation",
      )?.sidebarNested,
    ).toBe(true);
  });
});
