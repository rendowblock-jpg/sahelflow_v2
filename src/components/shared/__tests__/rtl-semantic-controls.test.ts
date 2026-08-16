import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("shared RTL semantic controls", () => {
  it("keeps breadcrumb progression logical and decorative separators hidden", () => {
    const breadcrumbs = read("src/components/shared/breadcrumbs.tsx");

    expect(breadcrumbs).toContain("rtl:rotate-180");
    expect(breadcrumbs).toContain('aria-hidden="true"');
    expect(breadcrumbs).not.toContain("icon-rtl-flip");
  });

  it("keeps operational pagination arrows logical in RTL", () => {
    const dataTable = read("src/components/data-table/data-table.tsx");
    const logicalArrowGuards = dataTable.match(/rtl:rotate-180/g) ?? [];

    expect(logicalArrowGuards.length).toBeGreaterThanOrEqual(4);
  });

  it("isolates order numbers without changing the surrounding RTL table domain", () => {
    const queue = read("src/components/orders/confirmation-queue-table.tsx");

    expect(queue).toContain('import { TechnicalValue } from "@/components/i18n/technical-value"');
    expect(queue).toContain("<TechnicalValue data-order-number>");
    expect(queue).toContain('<TechnicalValue className="text-sm font-medium" data-order-number>');
    expect(queue).not.toContain('<DataTable\n      dir="ltr"');
  });

  it("isolates customer phones in both the table and inspector header", () => {
    const customers = read("src/components/customers/customers-data-table.tsx");

    expect(customers).toContain('<TechnicalValue className="text-sm">');
    expect(customers).toContain("<TechnicalValue>{customer.phone}</TechnicalValue>");
  });

  it("lets Sheet resolve semantic sides while retaining explicit physical-side metadata", () => {
    const sheet = read("src/components/ui/sheet.tsx");

    expect(sheet).toContain("resolvePanelSide(side, dir)");
    expect(sheet).toContain("data-sheet-side={side}");
    expect(sheet).toContain("data-sheet-physical-side={resolvedSide}");
  });

  it("moves shared entity inspectors to semantic end instead of caller-owned RTL branching", () => {
    const entities = read("src/components/entities/entity-context.tsx");

    expect(entities).toContain('side="end"');
    expect(entities).not.toContain('side={dir === "rtl" ? "left" : "right"}');
  });
});
