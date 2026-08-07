import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Phase 5 whole-product closure contract", () => {
  it("uses permission-before-read workbenches for Customers and Products", () => {
    const customers = read("src/lib/customers/customer-workbench.ts");
    const customerPage = read("src/app/(dashboard)/customers/page.tsx");
    const products = read("src/lib/products/product-workbench.ts");
    const productPage = read("src/app/(dashboard)/products/page.tsx");
    expect(customers).toContain("name: access.contact");
    expect(customers).toContain("totalSpent: access.financials");
    expect(customers).toContain("riskScore: access.risk");
    expect(customers).toContain("db.order.groupBy");
    expect(customerPage).toContain("getCustomersWorkbenchPage");
    expect(customerPage).not.toContain("customerService.list");
    expect(products).toContain("cost: access.cost");
    expect(products).toContain("orderByFor(sort)");
    expect(productPage).toContain("ProductsDataTable");
    expect(productPage).not.toContain("<Table>");
  });

  it("keeps import/export commands matched to endpoint authority and canonical services", () => {
    const imports = read("src/app/(dashboard)/imports/page.tsx");
    const customers = read("src/app/api/import/customers/route.ts");
    const products = read("src/app/api/import/products/route.ts");
    const customerExport = read("src/app/api/export/customers/route.ts");
    expect(imports).toContain('can("customers.contact.update")');
    expect(imports).toContain('can("products.cost.update")');
    expect(imports).toContain('can("orders.financials.read")');
    expect(customers).toContain("customerService.create");
    expect(customers).not.toContain("prisma.customer.create");
    expect(products).toContain("productService.create");
    expect(products).not.toContain("prisma.product.create");
    expect(customerExport).toContain('"orders.financials.read"');
  });

  it("separates read and mutation authority across risk, automation and recovery surfaces", () => {
    const risk = read("src/app/(dashboard)/risk/page.tsx");
    const automations = read("src/app/(dashboard)/automations/page.tsx");
    const recovery = read("src/components/automations/automation-run-recovery-panel.tsx");
    const inboxRecovery = read("src/components/inbox/whatsapp-ingress-recovery-panel.tsx");
    expect(risk).toContain('trustedActionAllowed(actorContext, "risk.manage"');
    expect(risk).toContain('assertTrustedAction(actorContext, "orders.financials.read"');
    expect(risk).not.toContain("PremiumTable");
    expect(automations).toContain('trustedActionAllowed(actorContext, "automations.manage"');
    expect(automations).toContain("canManage ? <AutomationActions");
    expect(recovery).toContain("canRecover");
    expect(inboxRecovery).toContain("canRecover");
    expect(inboxRecovery).toContain("loadError");
  });

  it("converges Money and growth on truthful workbench and mutation behavior", () => {
    const accounting = read("src/app/(dashboard)/accounting/page.tsx");
    const expenses = read("src/lib/accounting/expense-workbench.ts");
    const storefronts = read("src/components/storefront/storefronts-list-client.tsx");
    expect(accounting).toContain("ExpensesDataTable");
    expect(accounting).toContain("ChartCard");
    expect(accounting).not.toContain("PremiumTable");
    expect(expenses).toContain("hasNextPage");
    expect(expenses).toContain('{ id: "desc" }');
    const request = storefronts.indexOf("await fetch");
    const committedUpdate = storefronts.indexOf("setConfigs((current) => current.map");
    expect(request).toBeGreaterThan(-1);
    expect(committedUpdate).toBeGreaterThan(request);
  });

  it("makes administration shareable, permission-aware and keyboard-governed", () => {
    const page = read("src/app/(dashboard)/settings/page.tsx");
    const tabs = read("src/components/settings/settings-tabs.tsx");
    expect(page).not.toContain('assertTrustedAction(actorContext, "integrations.read"');
    expect(page).toContain('can("sessions.revoke")');
    expect(page).toContain('can("shops.delete")');
    expect(tabs).toContain('useQueryState("tab"');
    expect(tabs).toContain('role="tablist"');
    expect(tabs).toContain('role="tabpanel"');
    expect(tabs).toContain('event.key === "Home"');
    expect(tabs).toContain('event.key === "ArrowRight"');
    expect(tabs).not.toContain("DEMO_LABELS");
    expect(tabs).not.toContain("SECURITY_LABELS");
  });

  it("closes silent error and root loading gaps", () => {
    const profile = read("src/app/(dashboard)/profile/page.tsx");
    const extraction = read("src/components/analytics/extraction-analytics.tsx");
    const join = read("src/app/join/page.tsx");
    expect(profile).toContain("loadError");
    expect(profile).toContain("StateSurface");
    expect(extraction).toContain("StateSurface");
    expect(extraction).not.toContain("console.error");
    expect(join).toContain("getJoinCopy");
    expect(read("src/app/loading.tsx")).toContain("RootLoading");
    expect(read("src/app/join/loading.tsx")).toContain("JoinLoading");
  });

  it("keeps real contextual entity navigation inside semantic workbenches", () => {
    const entity = read("src/components/shared/entity-link.tsx");
    const customers = read("src/components/customers/customers-data-table.tsx");
    const products = read("src/components/products/products-data-table.tsx");
    expect(entity).toContain("data-entity-link");
    expect(customers).toContain("EntityLink");
    expect(products).toContain("EntityLink");
  });
});
