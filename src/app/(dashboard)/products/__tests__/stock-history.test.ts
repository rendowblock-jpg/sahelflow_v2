import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { getEntityDetailRuntimeTranslation } from "@/lib/i18n/entity-detail-runtime";

// URL-based paths percent-encode the bracketed [id] route segment, so resolve
// from the repo root like the page-authority contract tests do.
function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const RUNTIME_KEYS = [
  "productStock.historyTitle",
  "productStock.noHistory",
  "productStock.coverageNote",
  "productStock.change",
  "productStock.newStock",
  "productStock.source",
  "productStock.reason",
  "productStock.by",
  "productStock.source.aiAssistant",
  "productStock.source.aiAction",
  "productStock.source.manual",
  "productStock.source.other",
];

describe("product detail stock-adjustment history (R3-c)", () => {
  it("renders the audit-trail history section on the product page", () => {
    const page = source("src/app/(dashboard)/products/[id]/page.tsx");

    expect(page).toContain('data-product-stock-history="audit-trail"');
    expect(page).toContain('"productStock.historyTitle"');
    expect(page).toContain('"productStock.change"');
    expect(page).toContain('"productStock.newStock"');
    expect(page).toContain('"productStock.source"');
    expect(page).toContain('"productStock.reason"');
    expect(page).toContain('"productStock.by"');
    // Honest coverage note: order-driven movements are not logged yet.
    expect(page).toContain('"productStock.coverageNote"');
  });

  it("loads the history server-side through the existing workbench pattern", () => {
    const page = source("src/app/(dashboard)/products/[id]/page.tsx");
    const workbench = source("src/lib/products/product-detail-workbench.ts");
    const history = source("src/lib/products/product-stock-history.ts");

    expect(page).toContain("getProductDetailWorkbench");
    expect(page).toContain("stockHistory");
    expect(workbench).toContain("getProductStockHistory");
    // Server-side query scoped to the product's audit trail, newest first.
    expect(history).toContain('entity: "product"');
    expect(history).toContain("createdAt: \"desc\"");
  });

  it("keeps the prior authority contract intact (page-authority parity)", () => {
    const page = source("src/app/(dashboard)/products/[id]/page.tsx");
    const detail = source("src/lib/products/product-detail-workbench.ts");

    expect(page).toContain('requireTrustedAction("products.read")');
    expect(page).toContain("canReadOrderFinancials");
    expect(detail).toContain('allowed(actorContext, "orders.read")');
    expect(detail).toContain("unitPrice: canReadOrderFinancials");
  });

  it("adds no Prisma model or migration — a stock ledger needs a schema addition (deferred)", () => {
    const schema = readFileSync(
      resolve(process.cwd(), "prisma/schema.prisma"),
      "utf8",
    );

    expect(schema).not.toMatch(/model\s+(StockEvent|StockMovement|InventoryMovement|StockLedger)\b/);
  });

  it("ships every productStock key in en, fr and ar", () => {
    for (const locale of ["en", "fr", "ar"] as const) {
      for (const key of RUNTIME_KEYS) {
        expect(
          getEntityDetailRuntimeTranslation(locale, key),
          `${locale}:${key}`,
        ).toBeTruthy();
      }
    }
  });
});
