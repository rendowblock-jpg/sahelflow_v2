import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("product dashboard page authority", () => {
  it("uses one permission-aware product workbench for every role", () => {
    const page = source("src/app/(dashboard)/products/page.tsx");
    const workbench = source("src/lib/products/product-workbench.ts");

    expect(page).toContain('requireTrustedAction("products.read")');
    expect(page).toContain("getProductsWorkbenchPage");
    expect(page).toContain("getProductWorkbenchSummary");
    expect(page).toContain("<ProductsDataTable");
    expect(page).not.toContain("<Table>");
    expect(page).toContain("access.export");
    expect(page).toContain("access.import");
    expect(workbench).toContain("cost: access.cost");
    expect(workbench).toContain("orderByFor(sort)");
  });

  it("gates product cost and embedded order history before querying them", () => {
    const page = source("src/app/(dashboard)/products/[id]/page.tsx");
    const workbench = source("src/lib/products/product-workbench.ts");

    expect(page).toContain('requireTrustedAction("products.read")');
    expect(page).toContain("getProductWorkbenchDetail");
    expect(page).toContain("fieldAccess.orderFinancials");
    expect(page).toContain("fieldAccess.manage");
    expect(workbench).toContain('allowed(actorContext, "orders.read")');
    expect(workbench).toContain('allowed(actorContext, "orders.financials.read")');
    expect(workbench).toContain("unitPrice: orderFinancials");
    expect(workbench).toContain("total: orderFinancials");
  });
});
