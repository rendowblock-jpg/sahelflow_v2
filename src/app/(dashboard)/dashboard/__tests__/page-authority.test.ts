import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("dashboard page authority", () => {
  it("resolves trusted field access before direct dashboard queries", () => {
    const page = readFileSync(
      resolve(process.cwd(), "src/app/(dashboard)/dashboard/page.tsx"),
      "utf8",
    );
    const pageGuard = page.indexOf('requireTrustedAction("shops.read")');
    const fieldAccess = page.indexOf("resolveDashboardFieldAccess(actorContext)");
    const query = page.indexOf("getDashboardStats()");
    const projection = page.indexOf("projectDashboardForTrustedActor(");

    expect(pageGuard).toBeGreaterThanOrEqual(0);
    expect(fieldAccess).toBeGreaterThan(pageGuard);
    expect(query).toBeGreaterThan(fieldAccess);
    expect(projection).toBeGreaterThan(query);
    expect(page).not.toContain("order.customer.name");
    expect(page).not.toContain("formatDZD(order.totalPrice)");
  });
});
