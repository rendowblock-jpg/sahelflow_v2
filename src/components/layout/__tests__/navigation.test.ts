import { describe, expect, it } from "vitest";

import {
  DEFAULT_NAVIGATION_DOMAIN_ORDER,
  flattenNavigationItems,
  navigationDomainForPathname,
  navigationDomains,
  navigationItemForPathname,
  orderedNavigationDomains,
  utilityNavigationItems,
} from "../navigation";

describe("Phase 5 navigation authority", () => {
  it("exposes exactly seven daily business domains", () => {
    expect(navigationDomains.map((domain) => domain.id)).toEqual([
      "home",
      "sell",
      "customers",
      "fulfill",
      "money",
      "inbox",
      "grow",
    ]);
    expect(DEFAULT_NAVIGATION_DOMAIN_ORDER).toEqual(
      navigationDomains.map((domain) => domain.id),
    );
  });

  it("keeps every destination unique under one canonical registry", () => {
    const items = flattenNavigationItems();
    const hrefs = items.map((item) => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(hrefs).toContain("/orders/confirmation-queue");
    expect(hrefs).toContain("/accounting/cod-reconciliation");
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
  });

  it("keeps administration outside daily business domains", () => {
    expect(utilityNavigationItems.map((item) => item.href)).toEqual([
      "/profile",
      "/settings",
    ]);
    expect(navigationDomainForPathname("/settings")).toBeNull();
    expect(navigationDomainForPathname("/profile")).toBeNull();
  });

  it("applies seller domain ordering without changing child ownership", () => {
    const ordered = orderedNavigationDomains([
      "inbox",
      "sell",
      "home",
      "money",
      "customers",
      "fulfill",
      "grow",
    ]);
    expect(ordered.map((domain) => domain.id)).toEqual([
      "inbox",
      "sell",
      "home",
      "money",
      "customers",
      "fulfill",
      "grow",
    ]);
    expect(
      ordered.find((domain) => domain.id === "sell")?.children?.map((child) =>
        child.id,
      ),
    ).toContain("confirmation-queue");
    expect(
      ordered.find((domain) => domain.id === "money")?.children?.map((child) =>
        child.id,
      ),
    ).toContain("cod-reconciliation");
  });

  it("fails open to the canonical registry when a stored preference is stale", () => {
    const ordered = orderedNavigationDomains([
      "inbox",
      "removed-domain",
      "inbox",
      "sell",
    ]);
    expect(ordered.map((domain) => domain.id)).toEqual([
      "inbox",
      "sell",
      "home",
      "customers",
      "fulfill",
      "money",
      "grow",
    ]);
    expect(new Set(ordered.map((domain) => domain.id)).size).toBe(7);
  });
});
