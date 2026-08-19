import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("Founder operational polish contracts", () => {
  it("keeps delivery timeline props serializable across the RSC boundary", () => {
    const detail = read("src/app/(dashboard)/deliveries/[id]/page.tsx");
    const entityContext = read("src/components/entities/entity-context.tsx");

    expect(entityContext).toContain(
      'export type EntityTimelineIcon = "clock" | "package" | "truck"',
    );
    expect(entityContext).toContain("icon?: EntityTimelineIcon");
    expect(entityContext).not.toContain("icon?: ComponentType");
    expect(detail).toContain('("truck" as const)');
    expect(detail).toContain('("package" as const)');
    expect(detail).not.toContain("icon: index === currentIdx ? Truck : Package");
  });

  it("renders confirmation age from locale-aware elapsed minutes", () => {
    const table = read("src/components/orders/confirmation-queue-table.tsx");

    expect(table).toContain("formatOperationalAge(row.original.ageMinutes, locale)");
    expect(table).not.toContain("{row.original.ageLabel}");
  });

  it("keeps product stock values centered under one restrained stock-state contract", () => {
    const table = read("src/components/products/products-data-table.tsx");

    expect(table).toContain('meta: { align: "center", width: "w-28" }');
    expect(table).toContain("min-w-16 items-center justify-center");
    expect(table).toContain('<span className="sr-only">{t("products.low")}</span>');
    expect(table).not.toContain('<Badge variant="destructive" className="gap-0.5 py-0">');
  });

  it("loads Risk Watch only behind the full risk-data authority boundary", () => {
    const page = read("src/app/(dashboard)/dashboard/page.tsx");
    const projection = read("src/lib/identity/dashboard-projection.ts");

    expect(page).toContain('data-dashboard-risk-watch="true"');
    expect(page).toContain("fieldAccess.risk");
    expect(page).toContain("getRiskAnalyticsReport({ prisma: db, shop: shopContext }, 30)");
    expect(projection).toContain('allowed(actorContext, "risk.read")');
    expect(projection).toContain("customerContact &&");
    expect(projection).toContain("orderFinancials");
  });
});
