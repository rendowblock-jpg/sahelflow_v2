import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function source(relativeUrl: string): string {
  return readFileSync(new URL(relativeUrl, import.meta.url), "utf8");
}

describe("universal command search contract", () => {
  it("searches every primary operational record family through protected APIs", () => {
    const palette = source("../../command-palette.tsx");

    for (const endpoint of [
      "/api/orders/search",
      "/api/customers/search",
      "/api/products/search",
      "/api/conversations/search",
      "/api/delivery",
      "/api/returns",
    ]) {
      expect(palette).toContain(endpoint);
    }
    expect(palette).toContain("Promise.allSettled");
    expect(palette).toContain("conversation:");
    expect(palette).toContain("delivery:");
    expect(palette).toContain("return:");
  });

  it("keeps delivery and return universal-search predicates on non-PII fields", () => {
    const delivery = source("../../../lib/deliveries/delivery-workbench.ts");
    const returns = source("../../../lib/returns/return-workbench.ts");

    expect(delivery).toContain("deliverySearchWhere");
    expect(delivery).toContain("trackingNumber");
    expect(delivery).toContain("orderNumber");
    expect(delivery).not.toContain("customer: { name: { contains: value }");
    expect(delivery).not.toContain("phone: { contains: value }");

    expect(returns).toContain("returnSearchWhere");
    expect(returns).toContain("orderNumber");
    expect(returns).not.toContain("reason: { contains: value }");
    expect(returns).not.toContain("notes: { contains: value }");
  });
});
