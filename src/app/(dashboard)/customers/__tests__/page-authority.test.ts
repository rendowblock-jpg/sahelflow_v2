import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("customer dashboard page authority", () => {
  it("uses a permission-before-read customer workbench for the list", () => {
    const page = source("src/app/(dashboard)/customers/page.tsx");
    const workbench = source("src/lib/customers/customer-workbench.ts");

    expect(page).toContain('requireTrustedAction("customers.read")');
    expect(page).toContain("getCustomersWorkbenchPage");
    expect(page).toContain("getCustomerWorkbenchSummary");
    expect(page).toContain("access.export");
    expect(page).toContain("access.import");
    expect(page).toContain("access.manage && access.contactUpdate");
    expect(workbench).toContain("name: access.contact");
    expect(workbench).toContain("phone: access.contact");
    expect(workbench).toContain("totalSpent: access.financials");
    expect(workbench).toContain("riskScore: access.risk");
    expect(workbench).toContain("db.order.groupBy");
  });

  it("gates customer detail side reads before querying them", () => {
    const page = source("src/app/(dashboard)/customers/[id]/page.tsx");
    const workbench = source("src/lib/customers/customer-workbench.ts");

    expect(page).toContain('requireTrustedAction("customers.read")');
    expect(page).toContain("getCustomerWorkbenchDetail");
    expect(page).toContain("fieldAccess.orderFinancials");
    expect(page).toContain("fieldAccess.riskManage");
    expect(workbench).toContain('allowed(actorContext, "orders.read")');
    expect(workbench).toContain("const orderFinancials = orders && access.financials");
    expect(workbench).toContain('allowed(actorContext, "risk.manage")');
    expect(workbench).toContain("totalPrice: orderFinancials");
  });
});
