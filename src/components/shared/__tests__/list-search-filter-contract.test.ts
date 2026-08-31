import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

/**
 * Source contract for the scoped search/filter muscle (R2-a): URL-as-state
 * filters, debounced search, RTL-safe logical utilities, and the
 * filtered-empty vs first-use empty distinction on the three list surfaces.
 */
describe("Scoped list search and filter contract", () => {
  it("keeps the shared search input debounced, clearable and URL-driven", () => {
    const input = read("src/components/shared/list-search-input.tsx");
    const scope = read("src/hooks/use-list-search-scope.ts");
    expect(input).toContain("useDebouncedValue");
    expect(input).toContain("useListSearchScope");
    expect(scope).toContain("shallow: true");
    expect(scope).toContain("page: 1");
    expect(input).toContain('aria-label={t("common.clearSearch")}');
    // Logical utilities only — no physical left/right offsets.
    expect(input).not.toMatch(/\b(left|right)-\d/);
    expect(input).not.toMatch(/(?:pl|pr|ml|mr)-\d/);
  });

  it("drives the orders filter bar from the shared wilaya source with URL params", () => {
    const bar = read("src/components/orders/orders-filter-bar.tsx");
    expect(bar).toContain('from "../../../data/wilayas.json"');
    expect(bar).toContain("useOrdersFilterParams");
    expect(bar).toContain("presetRange");
    expect(bar).toContain("orders.filters.clearAll");
    expect(bar).not.toMatch(/\b(left|right)-\d/);
    expect(bar).not.toMatch(/(?:pl|pr|ml|mr)-\d/);
  });

  it("keeps the orders filter URL contract stable (q / wilaya / from / to)", () => {
    const hook = read("src/hooks/use-orders-filter-params.ts");
    expect(hook).toContain("q: nullableString");
    expect(hook).toContain("wilaya: nullableString");
    expect(hook).toContain("from: nullableString");
    expect(hook).toContain("to: nullableString");
    expect(hook).toContain("page: pageParser");
  });

  it("wires the filter bar and honest empty states into the orders table", () => {
    const table = read("src/components/orders/orders-data-table.tsx");
    expect(table).toContain("<OrdersFilterBar />");
    expect(table).toContain("hasActiveFilters");
    expect(table).toContain("onClearFilters={clearFilters}");
    expect(table).toContain("<OrderFormDialog");
  });

  it("serves the same scoped search to products and customers tables", () => {
    const products = read("src/components/products/products-data-table.tsx");
    const customers = read("src/components/customers/customers-data-table.tsx");
    expect(products).toContain("<ListSearchInput");
    expect(products).toContain("filtered onClearFilters={clearFilters}");
    expect(customers).toContain("<ListSearchInput");
    expect(customers).toContain("filtered onClearFilters={clearFilters}");
  });

  it("distinguishes filtered-empty from first-use empty states", () => {
    const catalog = read("src/components/shared/empty-states.tsx");
    expect(catalog).toContain("filtered");
    expect(catalog).toContain("onClearFilters");
    expect(catalog).toContain('"orders.filteredEmpty.title"');
    expect(catalog).toContain('"products.filteredEmpty.title"');
    expect(catalog).toContain('"customers.filteredEmpty.title"');
  });

  it("forwards the active list scope to the filtered export", () => {
    const buttons = read("src/components/shared/import-export-buttons.tsx");
    const page = read("src/app/(dashboard)/orders/page.tsx");
    expect(buttons).toContain("filterParams?: string[]");
    expect(buttons).toContain("window.location.search");
    expect(page).toContain(
      'filterParams={["q", "wilaya", "from", "to", "status", "sort"]}',
    );
  });

  it("bounds the filtered export and reuses the workbench where contract", () => {
    const route = read("src/app/api/export/orders/route.ts");
    expect(route).toContain("MAX_FILTERED_EXPORT_ROWS = 5_000");
    expect(route).toContain("buildOrdersWorkbenchWhere");
    expect(route).toContain("ordersWorkbenchOrderBy");
    expect(route).toContain("deliveryProvider");
  });
});
