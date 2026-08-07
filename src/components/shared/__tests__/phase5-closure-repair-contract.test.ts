import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Phase 5 closure repair contract", () => {
  it("keeps the Accounting period identical on server and later SWR pages", () => {
    const page = read("src/app/(dashboard)/accounting/page.tsx");
    const table = read("src/components/accounting/expenses-data-table.tsx");
    const hook = read("src/hooks/swr/use-expenses.ts");
    const route = read("src/app/api/expenses/route.ts");
    expect(page).toContain("from={rangeFrom}");
    expect(page).toContain("to={rangeTo}");
    expect(table).toContain("useExpenses({ fallback, from, to })");
    expect(hook).toContain('rangeParams.set("from", opts.from)');
    expect(hook).toContain('rangeParams.set("to", opts.to)');
    expect(route).toContain('parseDateParam(params.get("from"))');
    expect(route).toContain('parseDateParam(params.get("to"))');
  });

  it("preserves the legacy Product picker shape without protected cost reads", () => {
    const workbench = read("src/lib/products/product-workbench.ts");
    const route = read("src/app/api/products/route.ts");
    expect(route).toContain("getLegacyProductsList");
    expect(workbench).toContain("cost: access.cost");
    expect(workbench).toContain("variants: row.productVariants");
    expect(workbench).toContain("images: parseImages(row.images)");
    expect(workbench).toContain("fieldAccess: Object.freeze({ cost: access.cost })");
  });

  it("loads client state asynchronously rather than synchronously setting state in effects", () => {
    const profile = read("src/app/(dashboard)/profile/page.tsx");
    const extraction = read("src/components/analytics/extraction-analytics.tsx");
    const ingress = read("src/components/inbox/whatsapp-ingress-recovery-panel.tsx");
    expect(profile).not.toContain("useEffect(() => { void load(); }");
    expect(extraction).not.toContain("useEffect(() => { void load(); }");
    expect(ingress).not.toContain("let active = true; setLoadError(false)");
  });
});
