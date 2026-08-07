import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("product dashboard page authority", () => {
  it("guards and delegates the direct product list read to the permission-aware workbench", () => {
    const page = source("src/app/(dashboard)/products/page.tsx");
    const workbench = source("src/lib/products/product-workbench.ts");

    expect(page).toContain('requireTrustedAction("products.read")');
    expect(page).toContain("getProductsWorkbenchPage");
    expect(page).toContain("getProductWorkbenchSummary");
    expect(workbench).toContain('assertTrustedAction(actorContext, "products.read"');
    expect(workbench).toContain('allowed(actorContext, "products.manage")');
    expect(workbench).toContain('allowed(actorContext, "products.cost.read")');
    expect(workbench).toContain('allowed(actorContext, "products.cost.update")');
    expect(workbench).toContain('allowed(actorContext, "data.export")');
    expect(workbench).toContain('allowed(actorContext, "data.import")');
    expect(workbench).toContain("cost: access.cost");
  });

  it("keeps product cost and embedded order financials behind their exact authorities", () => {
    const page = source("src/app/(dashboard)/products/[id]/page.tsx");
    const detail = source("src/lib/products/product-detail-workbench.ts");
    const workbench = source("src/lib/products/product-workbench.ts");

    expect(page).toContain('requireTrustedAction("products.read")');
    expect(page).toContain("getProductDetailWorkbench");
    expect(page).toContain("canReadOrderFinancials");
    expect(detail).toContain('allowed(actorContext, "orders.read")');
    expect(detail).toContain('allowed(actorContext, "orders.financials.read")');
    expect(detail).toContain("unitPrice: canReadOrderFinancials");
    expect(detail).toContain("total: canReadOrderFinancials");
    expect(workbench).toContain("cost: access.cost");
  });
});
