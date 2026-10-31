import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("deterministic responsive composition contract", () => {
  it("loads one shared responsive authority after the product foundation", () => {
    const layout = read("src/app/layout.tsx");
    expect(layout).toContain('import "./product-system.css";');
    expect(layout).toContain('import "./responsive-system.css";');
    expect(layout.indexOf('import "./responsive-system.css";')).toBeGreaterThan(
      layout.indexOf('import "./product-system.css";'),
    );
  });

  it("keeps shared cardinality grids deterministic instead of allowing 3 + 1 auto-fit composition", () => {
    const source = read("src/app/responsive-system.css");
    expect(source).not.toMatch(/grid-template-columns:[^;]*auto-fit/);
    expect(source).toContain(
      ':is(.card-grid-2, .card-grid-3, .card-grid-4)',
    );
    expect(source).toContain("@media (min-width: 40rem)");
    expect(source).toContain("@media (min-width: 64rem)");
    expect(source).toContain("@media (min-width: 80rem)");
    // rem, not px: the breakpoints follow the browser's font size (see the comment at the top of the file)
    expect(source).not.toMatch(/@media[^{]*\((min|max)-width:\s*[0-9.]+px\)/);
    expect(source).toContain(
      ".card-grid-3 {\n    grid-template-columns: repeat(3, minmax(0, 1fr));",
    );
    expect(source).toContain(
      ".card-grid-4 {\n    grid-template-columns: repeat(4, minmax(0, 1fr));",
    );
  });

  it("keeps Accounting on the governed four-card primitive", () => {
    // The page hands its figures to AccountingView, which owns the card grid.
    const accounting = read("src/components/accounting/accounting-view.tsx");
    expect(accounting).toContain('className="card-grid-4"');
  });
});
