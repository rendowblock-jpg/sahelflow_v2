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
    expect(page).not.toContain("take: 200");
    expect(page).toContain("page,");
    expect(page).toContain("sort: sortRaw");
    expect(route).toContain("getOrdersWorkbenchPage");
  });

  it("keeps later Orders pages permission, risk and fallback aware", () => {
    const workbench = read("src/lib/orders/order-list-workbench.ts");
    const hook = read("src/hooks/swr/use-orders.ts");
    const client = read("src/components/orders/orders-data-table.tsx");
    expect(workbench).toContain("fieldAccess: access");
    expect(workbench).toContain("batchAssessOrders");
    expect(workbench).toContain('allowed(actorContext, "orders.delete")');
    expect(hook).toContain("opts.fallback.page === currentPage");
    expect(hook).toContain("opts.fallback.sort === normalizedSort");
    expect(client).toContain("fieldAccess = data?.fieldAccess ?? fallback.fieldAccess");
    expect(client).toContain("riskData: data?.riskData");
  });

  it("uses deterministic total ordering for every offset-paginated queue", () => {
    const orders = read("src/lib/orders/order-list-workbench.ts");
    const confirmation = read("src/lib/orders/confirmation-workbench.ts");
    expect(orders).toContain("{ id: direction }");
    expect(confirmation).toContain('[{ createdAt: "asc" }, { id: "asc" }]');
  });

  it("makes confirmation a truthful paginated workbench", () => {
    const page = read(
      "src/app/(dashboard)/orders/confirmation-queue/page.tsx",
    );
    const helper = read("src/lib/orders/confirmation-workbench.ts");
    const hook = read("src/hooks/swr/use-confirmation-queue.ts");
    expect(page).toContain("ConfirmationQueueTable");
    expect(page).not.toContain("<table");
    expect(page).toContain("page,");
    expect(helper).toContain("staleCount");
    expect(helper).toContain("hasNextPage");
    expect(helper).not.toContain("take: 100");
    expect(hook).toContain("fallback.page === currentPage");
    expect(hook).not.toContain("data: data ?? fallback");
  });

  it("keeps server sorting truthful without focusable custom table rows", () => {
    const table = read("src/components/data-table/data-table.tsx");
    expect(table).toContain("serverSort?: boolean");
    expect(table).toContain("sort?: string");
    expect(table).toContain("pagination.sort ?? sortUrl.sort");
    expect(table).toContain("enableSortingRemoval: !pagination?.serverSort");
    expect(table).toContain("manualSorting: Boolean(pagination?.serverSort)");
    expect(table).toContain('type="button"');
    expect(table).not.toContain("tabIndex={onRowClick");
    expect(table).not.toContain('event.key === "Enter"');
  });

  it("uses real order links and exact row action authority", () => {
    const orders = read("src/components/orders/orders-columns.tsx");
    const confirmation = read("src/components/orders/confirmation-queue-table.tsx");
    expect(orders).toContain("fieldAccess.update ? [selectColumn<OrderListItem>()] : []");
    expect(orders).toContain("fieldAccess.delete &&");
    expect(orders).toContain('href={`/orders/${row.original.id}`}');
    expect(confirmation).toContain('href={`/orders/${row.original.id}`}');
  });

  it("keeps bulk business status authoritative instead of optimistic", () => {
    const client = read("src/components/orders/orders-data-table.tsx");
    expect(client).not.toContain("optimisticData");
    expect(client).not.toContain("revalidate: false");
    expect(client).toContain("bulkMutation.isSubmitting");
    expect(client).toContain('"/api/orders/bulk"');
  });

  it("uses immediate neutral operational metrics without fake sentinel percentages", () => {
    const metric = read("src/components/shared/stat-card.tsx");
    expect(metric).toContain('data-slot="operational-metric"');
    expect(metric).not.toContain("requestAnimationFrame");
    expect(metric).not.toContain("bg-gradient-to-br");
    expect(metric).not.toContain("hover:-translate-y");
    expect(metric).toContain("Math.abs(trend) === 1");
    expect(metric).toContain("!directionOnly");
  });

  it("makes Home attention-first and permission-before-read", () => {
    const dashboard = read("src/app/(dashboard)/dashboard/page.tsx");
    const stats = read("src/lib/data/stats-service.ts");
    const deliveryPage = read("src/app/(dashboard)/deliveries/page.tsx");
    const deliveryApi = read("src/app/api/delivery/route.ts");
    expect(dashboard).toContain("AttentionCenter");
    expect(dashboard).toContain("getStaleOrderCount");
    expect(dashboard).toContain("getDashboardStats(fieldAccess)");
    expect(dashboard).toContain("getDashboardAnalytics(fieldAccess)");
    expect(dashboard).toContain('href: "/deliveries?status=pending"');
    expect(stats).toContain('status: { in: ["pending", "created"] }');
    expect(deliveryPage).toContain('status === "pending"');
    expect(deliveryPage).toContain("PENDING_STATUSES");
    expect(deliveryApi).toContain("PENDING_DELIVERY_STATUSES");
    expect(dashboard).not.toContain("dashboard.openInbox");
    expect(dashboard).not.toContain("dashboard.manageOrders");
  });
});
