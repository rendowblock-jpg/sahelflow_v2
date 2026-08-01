import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("product dashboard page authority", () => {
  it("guards and projects the direct product list read", () => {
    const page = source("src/app/(dashboard)/products/page.tsx");

    expect(page).toContain('requireTrustedAction("products.read")');
    expect(page).toContain("projectProductsForTrustedActor");
    expect(page).toContain('"products.manage"');
    expect(page).toContain('"products.cost.read"');
    expect(page).toContain("canManage ? (");
    expect(page).toContain('"data.export"');
    expect(page).toContain('"data.import"');
  });

  it("projects product cost and gates embedded order history", () => {
    const page = source("src/app/(dashboard)/products/[id]/page.tsx");

    expect(page).toContain('requireTrustedAction("products.read")');
    expect(page).toContain("projectProductForTrustedActor");
    expect(page).toContain('"orders.read"');
    expect(page).toContain('"orders.financials.read"');
    expect(page).toContain("canReadOrders && (");
    expect(page).toContain("canReadOrderFinancials");
  });
});
