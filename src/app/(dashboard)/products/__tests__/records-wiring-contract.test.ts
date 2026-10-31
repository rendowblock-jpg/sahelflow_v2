/** The customer and product pages are server components, so a render test cannot see their wiring: pin it here. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(resolve(__dirname, "../../../../..", rel), "utf8");
const CUSTOMER = "src/app/(dashboard)/customers/[id]";
const PRODUCT = "src/app/(dashboard)/products/[id]";

describe("customers/[id] wiring", () => {
  const page = read(`${CUSTOMER}/page.tsx`);
  it("shows the offline strip and builds the header from CustomerDetailHeader", () => {
    expect(page).toContain('<RecordsOfflineBanner kind="customer" />');
    expect(page).toContain("<CustomerDetailHeader");
  });
  it("loads with the page-shaped skeleton, not a generic one", () => {
    expect(read(`${CUSTOMER}/loading.tsx`)).toContain("<CustomerDetailSkeleton />");
  });
  it("fails with the kit PageError and passes reset through", () => {
    expect(read(`${CUSTOMER}/error.tsx`)).toContain("<PageError error={error} reset={reset} />");
  });
  it("formats money through the shared formatter only", () => {
    expect(page).toContain("formatDZD(stats.totalSpent, locale)");
    expect(page).not.toMatch(/toFixed|\.toLocaleString\(/);
  });
});

describe("products/[id] wiring", () => {
  const page = read(`${PRODUCT}/page.tsx`);
  it("shows the offline strip and builds the header from ProductDetailHeader", () => {
    expect(page).toContain('<RecordsOfflineBanner kind="product" />');
    expect(page).toContain("<ProductDetailHeader");
  });
  it("shows order movements as cards below md and keeps the table for md and up", () => {
    expect(page).toContain("<ProductOrderMovementCards");
    expect(page).toContain("data-product-stock-history");
    expect(page).toMatch(/hidden[^"]*md:block|md:block[^"]*hidden/);
  });
  it("loads with the page-shaped skeleton and fails with the kit PageError", () => {
    expect(read(`${PRODUCT}/loading.tsx`)).toContain("<ProductDetailSkeleton />");
    expect(read(`${PRODUCT}/error.tsx`)).toContain("<PageError error={error} reset={reset} />");
  });
  it("formats money through the shared formatter only", () => {
    expect(page).toContain("formatDZD(product.price, locale)");
    expect(page).not.toMatch(/toFixed|\.toLocaleString\(/);
  });
});

describe("the two list pages", () => {
  it("customers: the create dialog sits behind the offline gate and the strip is mounted", () => {
    const page = read("src/app/(dashboard)/customers/page.tsx");
    expect(page).toMatch(/<OfflineWriteGate>\s*<CreateParamDialog kind="customer" \/>\s*<\/OfflineWriteGate>/);
    expect(read("src/components/customers/customers-data-table.tsx")).toContain("<RecordsListStatusBanner");
  });
  it("products: create and every row's actions sit behind the offline gate and the strip is mounted", () => {
    const page = read("src/app/(dashboard)/products/page.tsx");
    expect(page).toMatch(/<OfflineWriteGate>\s*<CreateParamDialog kind="product"/);
    const table = read("src/components/products/products-data-table.tsx");
    expect(table).toMatch(/<OfflineWriteGate>\s*<ProductRowActions/);
    expect(table).toContain("<RecordsListStatusBanner");
  });
});
