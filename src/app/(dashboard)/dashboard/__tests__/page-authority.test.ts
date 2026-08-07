import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("dashboard page authority", () => {
  it("resolves trusted field access before permission-aware dashboard queries", () => {
    const page = read("src/app/(dashboard)/dashboard/page.tsx");
    const pageGuard = page.indexOf('requireTrustedAction("shops.read")');
    const fieldAccess = page.indexOf("resolveDashboardFieldAccess(actorContext)");
    const statsQuery = page.indexOf("getDashboardStats(fieldAccess)");
    const analyticsQuery = page.indexOf("getDashboardAnalytics(fieldAccess)");
    const projection = page.indexOf("projectDashboardForTrustedActor(");

    expect(pageGuard).toBeGreaterThanOrEqual(0);
    expect(fieldAccess).toBeGreaterThan(pageGuard);
    expect(statsQuery).toBeGreaterThan(fieldAccess);
    expect(analyticsQuery).toBeGreaterThan(fieldAccess);
    expect(projection).toBeGreaterThan(statsQuery);
    expect(projection).toBeGreaterThan(analyticsQuery);
    expect(page).not.toContain("order.customer.name");
    expect(page).toContain("formatDZD(order.totalPrice, locale)");
  });

  it("keeps denied dashboard domains out of the underlying query plan", () => {
    const dashboardData = read("src/lib/data/dashboard.ts");
    const stats = read("src/lib/data/stats-service.ts");
    const analytics = read("src/lib/data/analytics-data.ts");

    expect(dashboardData).toContain("financials: fieldAccess.analyticsFinancials");
    expect(stats).toContain("canReadFinancials");
    expect(stats).toContain("? grossRevenue(ctx.prisma, todayPeriod)");
    expect(stats).toContain("? getProfitabilitySeries(ctx.prisma");
    expect(analytics).toContain("!fieldAccess.analytics");
    expect(analytics).toContain("fieldAccess.analyticsFinancials");
    expect(analytics).toContain("fieldAccess.analytics && fieldAccess.customers");
    expect(analytics).toContain("fieldAccess.deliveries");
  });
});
