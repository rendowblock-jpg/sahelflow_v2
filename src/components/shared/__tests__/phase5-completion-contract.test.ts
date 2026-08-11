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
    const hooks = [
      read("src/hooks/swr/use-customers.ts"),
      read("src/hooks/swr/use-products.ts"),
      read("src/hooks/swr/use-deliveries.ts"),
      read("src/hooks/swr/use-returns.ts"),
    ];

    expect(customers).toContain("name: access.contact");
    expect(customers).toContain("riskScore: access.risk");
    expect(products).toContain("cost: access.cost");
    expect(deliveries).toContain("cost: access.financials");
    expect(deliveries).toContain("customer: access.contact");
    expect(returns).toContain("customer: access.contact");
    for (const hook of hooks) {
      expect(hook).toContain("fallback.page === currentPage");
      expect(hook).toContain("knownTotal !== undefined && currentPage > lastPage");
    }
  });

  it("keeps list navigation truthful when detail routes need stronger authority", () => {
    const orderColumns = read("src/components/orders/orders-columns.tsx");
    const orderTable = read("src/components/orders/orders-data-table.tsx");
    const confirmation = read("src/components/orders/confirmation-queue-table.tsx");
    const deliveries = read("src/components/deliveries/deliveries-data-table.tsx");
    const returns = read("src/components/returns/returns-data-table.tsx");

    for (const source of [orderColumns, orderTable, confirmation]) {
      expect(source).toContain("canOpenDetail");
      expect(source).toContain("contact &&");
      expect(source).toContain("financials");
    }
    for (const source of [deliveries, returns]) {
      expect(source).toContain("canViewDetail");
      expect(source).toContain("access.contact && access.financials");
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
    const orderImport = read("src/app/api/import/orders/route.ts");
    const customerImport = read("src/app/api/import/customers/route.ts");
    const productImport = read("src/app/api/import/products/route.ts");
    expect(controls).toContain("/imports#import-");
    expect(controls).not.toContain('formData.append("commit", "true")');
    expect(imports).toContain('entity="orders"');
    expect(imports).toContain('id="import-orders"');
    expect(orderImport).toContain("createCanonicalSourceOrder");
    expect(orderImport).toContain("if (!commit)");
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

  it("separates read and manage surfaces for automation, COD, fulfillment and settings", () => {
    const automations = read("src/app/(dashboard)/automations/page.tsx");
    const cod = read("src/app/(dashboard)/accounting/cod-reconciliation/page.tsx");
    const deliveryStatus = read("src/components/deliveries/delivery-status-badge.tsx");
    const returnStatus = read("src/components/returns/return-status-badge.tsx");
    const settings = read("src/app/(dashboard)/settings/page.tsx");
    const profile = read("src/app/(dashboard)/profile/page.tsx");
    expect(automations).toContain('"automations.manage"');
    expect(automations).toContain("canManage");
    expect(cod).toContain("CanonicalCodReadOnly");
    expect(deliveryStatus).toContain("disabled || isPending");
    expect(returnStatus).toContain("disabled || isPending");
    expect(settings).toContain("SettingsWorkspaceAccess");
    expect(profile).toContain("canManage");
  });

  it("gives every governed chart non-visual context", () => {
    const charts = read("src/components/charts/chart-primitives.tsx");
    expect(charts).toContain("const accessibleSummary = summary ?? description ?? title");
    expect(charts).toContain("aria-describedby={summaryId}");
  });

  it("keeps provider recovery, AI and extraction entry server-authoritative", () => {
    const inbox = read("src/app/(dashboard)/inbox/page.tsx");
    const recovery = read("src/components/inbox/whatsapp-ingress-recovery-panel.tsx");
    const agents = read("src/app/(dashboard)/agents/page.tsx");
    const extraction = read("src/app/(dashboard)/analytics/extraction/page.tsx");
    expect(inbox).toContain('requireTrustedAction("conversations.read")');
    expect(recovery).toContain("canRetry");
    expect(agents).toContain('requireTrustedAction("ai.use")');
    expect(extraction).toContain('requireTrustedAction("analytics.read")');
  });

  it("closes the root loading-boundary gaps", () => {
    expect(read("src/app/loading.tsx")).toContain("RootLoading");
    expect(read("src/app/join/loading.tsx")).toContain("JoinLoading");
  });
});
