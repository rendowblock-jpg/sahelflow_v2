import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Orders operational workspace contract", () => {
  it("keeps list risk reads permission-gated and uses the bounded Orders projector", () => {
    const workbench = read("src/lib/orders/order-list-workbench.ts");
    expect(workbench).toContain("if (access.risk && rows.length > 0)");
    expect(workbench).toContain("batchAssessOrdersForWorkbench");
    expect(workbench).not.toContain("batchAssessOrders(");
  });

  it("batches order, customer-history, blacklist and wilaya inputs before pure scoring", () => {
    const risk = read("src/lib/orders/order-risk-workbench.ts");
    expect(risk).toContain('where: { id: { in: uniqueOrderIds }, deletedAt: null }');
    expect(risk).toContain('customerId: { in: customerIds }');
    expect(risk).toContain('where: { id: { in: customerIds }, deletedAt: null }');
    expect(risk).toContain('where: { wilaya: { in: wilayas } }');
    expect(risk).toContain("getRiskConfig(context)");
    expect(risk).toContain("getRiskRules(context)");
    expect(risk).toContain("assessRisk(input, config, rules)");
    expect(risk).not.toContain("buildAssessmentInputFromOrder");
  });

  it("does not re-fetch an exact server workbench fallback immediately on hydration", () => {
    const hook = read("src/hooks/swr/use-orders.ts");
    expect(hook).toContain("revalidateOnMount: fallbackData ? false : undefined");
    expect(hook).toContain("fallbackData &&");
    expect(hook).toContain("opts.fallback.page === currentPage");
    expect(hook).toContain("opts.fallback.sort === normalizedSort");
  });
});
