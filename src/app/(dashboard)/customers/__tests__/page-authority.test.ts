import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("customer dashboard page authority", () => {
  it("guards and delegates the direct customer list read to the permission-aware workbench", () => {
    const page = source("src/app/(dashboard)/customers/page.tsx");
    const workbench = source("src/lib/customers/customer-workbench.ts");

    expect(page).toContain('requireTrustedAction("customers.read")');
    expect(page).toContain("getCustomersWorkbenchPage");
    expect(page).toContain("getCustomerWorkbenchSummary");
    expect(page).toContain("resolveCustomerWorkbenchAccess");
    expect(workbench).toContain('assertTrustedAction(actorContext, "customers.read"');
    expect(workbench).toContain('allowed(actorContext, "customers.contact.read")');
    expect(workbench).toContain('allowed(actorContext, "orders.financials.read")');
    expect(workbench).toContain('allowed(actorContext, "customers.manage")');
    expect(workbench).toContain('allowed(actorContext, "customers.contact.update")');
    expect(workbench).toContain('allowed(actorContext, "data.export")');
    expect(workbench).toContain('allowed(actorContext, "data.import")');
    expect(workbench).toContain("name: access.contact");
  });

  it("keeps detail contact, order financials and risk reads behind their exact authorities", () => {
    const page = source("src/app/(dashboard)/customers/[id]/page.tsx");
    const detail = source("src/lib/customers/customer-detail-workbench.ts");
    const workbench = source("src/lib/customers/customer-workbench.ts");

    expect(page).toContain('requireTrustedAction("customers.read")');
    expect(page).toContain("getCustomerDetailWorkbench");
    expect(page).toContain('trustedActionAllowed(actorContext, "risk.manage"');
    expect(detail).toContain('allowed(actorContext, "orders.read")');
    expect(detail).toContain('allowed(actorContext, "orders.financials.read")');
    expect(detail).toContain("totalPrice: canReadOrderFinancials");
    expect(workbench).toContain('allowed(actorContext, "risk.read")');
    expect(workbench).toContain("riskScore: access.risk");
    expect(workbench).toContain("name: access.contact");
  });
});
