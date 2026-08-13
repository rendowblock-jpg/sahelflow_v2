import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function source(relativeUrl: string): string {
  return readFileSync(new URL(relativeUrl, import.meta.url), "utf8");
}

describe("Wave 2 product row hierarchy", () => {
  it("keeps the primary image on the existing product workbench projection", () => {
    const workbench = source("../../../lib/products/product-workbench.ts");

    expect(workbench).toContain("images: true");
    expect(workbench).toContain("images: parseImages(row.images)");
  });

  it("renders the projected primary image inside one compact identity cell", () => {
    const table = source("../products-data-table.tsx");

    expect(table).toContain("ProductThumbnail");
    expect(table).toContain("src={product.images?.[0]}");
    expect(table).toContain('data-product-identity="true"');
    expect(table).toContain("product.sku");
    expect(table).toContain("categoryNames.get(product.categoryId)");
    expect(table).not.toContain('accessorKey: "sku"');
    expect(table).not.toContain('accessorKey: "categoryId"');
  });

  it("has bounded lazy loading plus explicit missing and broken-image states", () => {
    const thumbnail = source("../product-thumbnail.tsx");

    expect(thumbnail).toContain('width={44}');
    expect(thumbnail).toContain('height={44}');
    expect(thumbnail).toContain('loading="lazy"');
    expect(thumbnail).toContain('decoding="async"');
    expect(thumbnail).toContain("onLoad={() => setState(\"ready\")}");
    expect(thumbnail).toContain("onError={() => setState(\"error\")}");
    expect(thumbnail).toContain("ImageOff");
    expect(thumbnail).toContain("Package");
    expect(thumbnail).toContain("key={src}");
  });
});
