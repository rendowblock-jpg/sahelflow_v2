import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Phase 5 Golden COD workbench source contract", () => {
  it("uses one exact paginated Orders contract instead of sampled page truth", () => {
    const page = read("src/app/(dashboard)/orders/page.tsx");
    const route = read("src/app/api/orders/route.ts");
    expect(page).toContain("getOrdersWorkbenchPage");
    expect(page).toContain("db.order.aggregate");
    expect(page).not.toContain("take: 200");
    expect(route).toContain("getOrdersWorkbenchPage");
  });

  it("keeps later Orders pages permission and risk aware", () => {
    const workbench = read("src/lib/orders/order-list-workbench.ts");
    const client = read("src/components/orders/orders-data-table.tsx");
    expect(workbench).toContain("fieldAccess: access");
    expect(workbench).toContain("batchAssessOrders");
    expect(client).toContain("fieldAccess: response.fieldAccess");
    expect(client).toContain("riskData: response.riskData");
  });

  it("makes confirmation a real paginated workbench rather than a raw sampled table", () => {
    const page = read(
      "src/app/(dashboard)/orders/confirmation-queue/page.tsx",
    );
    const helper = read("src/lib/orders/confirmation-workbench.ts");
    expect(page).toContain("ConfirmationQueueTable");
    expect(page).not.toContain("<table");
    expect(helper).toContain("staleCount");
    expect(helper).toContain("hasNextPage");
    expect(helper).not.toContain("take: 100");
  });

  it("keeps paginated tables truthful about sorting and keyboard row activation", () => {
    const table = read("src/components/data-table/data-table.tsx");
    expect(table).toContain("serverSort?: boolean");
    expect(table).toContain("enableSorting: sortingEnabled");
    expect(table).toContain("manualSorting: Boolean(pagination?.serverSort)");
    expect(table).toContain('type="button"');
    expect(table).toContain('event.key === "Enter"');
    expect(table).not.toContain('role={canSort ? "button"');
  });

  it("uses immediate neutral operational metrics instead of animated KPI cards", () => {
    const metric = read("src/components/shared/stat-card.tsx");
    expect(metric).toContain('data-slot="operational-metric"');
    expect(metric).not.toContain("requestAnimationFrame");
    expect(metric).not.toContain("bg-gradient-to-br");
    expect(metric).not.toContain("hover:-translate-y");
  });

  it("makes Home attention-first instead of a quick-action launcher", () => {
    const dashboard = read("src/app/(dashboard)/dashboard/page.tsx");
    expect(dashboard).toContain("AttentionCenter");
    expect(dashboard).toContain("getStaleOrderCount");
    expect(dashboard).not.toContain("dashboard.openInbox");
    expect(dashboard).not.toContain("dashboard.manageOrders");
  });
});
