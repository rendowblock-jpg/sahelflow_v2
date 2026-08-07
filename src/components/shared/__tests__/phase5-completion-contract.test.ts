import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Phase 5 whole-product completion contract", () => {
  it("keeps operational workbenches permission-before-read and page-truthful", () => {
    const customers = read("src/lib/customers/customer-workbench.ts");
    const products = read("src/lib/products/product-workbench.ts");
    const deliveries = read("src/lib/deliveries/delivery-workbench.ts");
    const returns = read("src/lib/returns/return-workbench.ts");
    const customerHook = read("src/hooks/swr/use-customers.ts");
    const productHook = read("src/hooks/swr/use-products.ts");
    const deliveryHook = read("src/hooks/swr/use-deliveries.ts");
    const returnHook = read("src/hooks/swr/use-returns.ts");

    expect(customers).toContain("name: access.contact");
    expect(customers).toContain("riskScore: access.risk");
    expect(products).toContain("cost: access.cost");
    expect(deliveries).toContain("cost: access.financials");
    expect(deliveries).toContain("customer: access.contact");
    expect(returns).toContain("customer: access.contact");
    for (const hook of [customerHook, productHook, deliveryHook, returnHook]) {
      expect(hook).toContain("fallback.page === currentPage");
      expect(hook).toContain("knownTotal !== undefined && currentPage > lastPage");
    }
  });

  it("keeps list navigation truthful when detail routes need stronger authority", () => {
    const orders = read("src/components/orders/orders-columns.tsx");
    const orderTable = read("src/components/orders/orders-data-table.tsx");
    const confirmation = read("src/components/orders/confirmation-queue-table.tsx");
    const deliveries = read("src/components/deliveries/deliveries-data-table.tsx");
    const returns = read("src/components/returns/returns-data-table.tsx");
    for (const source of [orders, orderTable, confirmation, deliveries, returns]) {
      expect(source).toContain("canOpenDetail");
    }
  });

  it("keeps business status authoritative instead of painting optimistic commits", () => {
    const delivery = read("src/components/deliveries/delivery-status-badge.tsx");
    const returns = read("src/components/returns/return-status-badge.tsx");
    expect(delivery).not.toContain("optimisticStatus");
    expect(returns).not.toContain("optimisticStatus");
    expect(delivery).toContain("router.refresh()");
    expect(returns).toContain("router.refresh()");
  });

  it("routes imports through visible preview and canonical writes", () => {
    const controls = read("src/components/shared/import-export-buttons.tsx");
    const imports = read("src/app/(dashboard)/imports/page.tsx");
    const customerImport = read("src/app/api/import/customers/route.ts");
    const productImport = read("src/app/api/import/products/route.ts");
    expect(controls).toContain("/imports#import-");
    expect(controls).not.toContain('formData.append("commit", "true")');
    expect(imports).toContain("ImportPanel");
    expect(customerImport).toContain("customerService.create");
    expect(productImport).toContain("productService.create");
    expect(customerImport).toContain("if (!commit)");
    expect(productImport).toContain("if (!commit)");
  });

  it("uses bounded risk analytics instead of per-order database fan-out", () => {
    const analytics = read("src/lib/risk-engine/analytics.ts");
    const riskPage = read("src/app/(dashboard)/risk/page.tsx");
    expect(analytics).not.toContain("buildAssessmentInputFromOrder");
    expect(analytics).toContain("historyRows");
    expect(analytics).toContain("wilayaProfiles");
    expect(riskPage).toContain("canAssess");
    expect(riskPage).toContain("canManage");
  });

  it("separates read and manage surfaces for automation, COD and settings", () => {
    const automations = read("src/app/(dashboard)/automations/page.tsx");
    const cod = read("src/app/(dashboard)/accounting/cod-reconciliation/page.tsx");
    const settings = read("src/app/(dashboard)/settings/page.tsx");
    const profile = read("src/app/(dashboard)/profile/page.tsx");
    expect(automations).toContain('trustedActionAllowed(\n    actorContext,\n    "automations.manage"');
    expect(cod).toContain("CanonicalCodReadOnly");
    expect(settings).toContain("SettingsTabAccess");
    expect(profile).toContain("canManage");
  });

  it("gives every governed chart non-visual context", () => {
    const charts = read("src/components/charts/chart-primitives.tsx");
    expect(charts).toContain("const accessibleSummary = summary ?? description ?? title");
    expect(charts).toContain("aria-describedby={summaryId}");
  });

  it("keeps provider recovery and AI entry server-authoritative", () => {
    const inbox = read("src/app/(dashboard)/inbox/page.tsx");
    const recovery = read("src/components/inbox/whatsapp-ingress-recovery-panel.tsx");
    const agents = read("src/app/(dashboard)/agents/page.tsx");
    expect(inbox).toContain('requireTrustedAction("conversations.read")');
    expect(recovery).toContain("canRetry");
    expect(agents).toContain('requireTrustedAction("ai.use")');
  });

  it("closes the root loading-boundary gaps", () => {
    expect(read("src/app/loading.tsx")).toContain("RootLoading");
    expect(read("src/app/join/loading.tsx")).toContain("JoinLoading");
  });
});
