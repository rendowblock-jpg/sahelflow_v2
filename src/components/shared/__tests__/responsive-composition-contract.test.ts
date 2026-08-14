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
    expect(source).not.toContain("auto-fit");
    expect(source).toContain(
      ':is(.card-grid-2, .card-grid-3, .card-grid-4)',
    );
    expect(source).toContain("@media (min-width: 640px)");
    expect(source).toContain("@media (min-width: 1024px)");
    expect(source).toContain("@media (min-width: 1280px)");
    expect(source).toContain(
      ".card-grid-3 {\n    grid-template-columns: repeat(3, minmax(0, 1fr));",
    );
    expect(source).toContain(
      ".card-grid-4 {\n    grid-template-columns: repeat(4, minmax(0, 1fr));",
    );
  });

  it("keeps Accounting on the governed four-card primitive", () => {
    const accounting = read("src/app/(dashboard)/accounting/page.tsx");
    expect(accounting).toContain('className="card-grid-4"');
  });
});
