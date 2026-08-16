import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const OPERATIONAL_SURFACES = [
  "src/components/orders/orders-columns.tsx",
  "src/components/orders/confirmation-queue-table.tsx",
  "src/components/deliveries/deliveries-data-table.tsx",
  "src/components/returns/returns-data-table.tsx",
  "src/components/customers/customers-data-table.tsx",
  "src/components/products/products-data-table.tsx",
] as const;

describe("technical value bidi authority", () => {
  it("isolates only the technical run with a semantic bdi boundary", () => {
    const primitive = read("src/components/i18n/technical-value.tsx");

    expect(primitive).toContain('<bdi\n      dir="ltr"');
    expect(primitive).toContain('data-technical-value="true"');
    expect(primitive).toContain('className={cn("technical-value font-mono", className)}');
  });

  it("uses the shared boundary across operational identifiers", () => {
    for (const path of OPERATIONAL_SURFACES) {
      expect(read(path), path).toContain("TechnicalValue");
    }

    const orders = read("src/components/orders/orders-columns.tsx");
    const deliveries = read("src/components/deliveries/deliveries-data-table.tsx");
    const returns = read("src/components/returns/returns-data-table.tsx");
    const products = read("src/components/products/products-data-table.tsx");

    expect(orders).toContain("data-order-number");
    expect(deliveries).toContain("data-tracking-number");
    expect(deliveries).toContain("data-order-number");
    expect(returns).toContain("data-order-number");
    expect(products).toContain("<TechnicalValue>{product.sku}</TechnicalValue>");
  });

  it("does not flip whole operational surfaces to LTR", () => {
    for (const path of OPERATIONAL_SURFACES) {
      const source = read(path);
      expect(source, path).not.toContain('<DataTable\n      dir="ltr"');
    }

    const queue = read("src/components/orders/confirmation-queue-table.tsx");
    expect(queue).not.toContain('href={`tel:${row.original.phone}`}\n                  dir="ltr"');

    const products = read("src/components/products/products-data-table.tsx");
    expect(products).not.toContain('<span className="max-w-40 truncate font-mono" dir="auto">');
  });
});
