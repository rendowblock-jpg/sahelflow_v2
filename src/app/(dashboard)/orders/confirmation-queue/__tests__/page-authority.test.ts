import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("confirmation queue page authority", () => {
  it("resolves trusted actor before the workbench query", () => {
    const page = readFileSync(
      resolve(
        process.cwd(),
        "src/app/(dashboard)/orders/confirmation-queue/page.tsx",
      ),
      "utf8",
    );
    const pageGuard = page.indexOf('requireTrustedAction("orders.read")');
    const workbench = page.indexOf("getConfirmationWorkbenchPage(actorContext");

    expect(pageGuard).toBeGreaterThanOrEqual(0);
    expect(workbench).toBeGreaterThan(pageGuard);
    expect(page).not.toContain("o.customer.phone");
  });

  it("workbench resolves field access and projects before returning", () => {
    const workbenchSource = readFileSync(
      resolve(process.cwd(), "src/lib/orders/confirmation-workbench.ts"),
      "utf8",
    );
    const fieldAccess = workbenchSource.indexOf(
      "resolveConfirmationQueueFieldAccess(actorContext)",
    );
    const projection = workbenchSource.indexOf(
      "projectConfirmationQueueForTrustedActor(",
    );
    const financialGate = workbenchSource.indexOf("fieldAccess.financials");

    expect(fieldAccess).toBeGreaterThanOrEqual(0);
    expect(projection).toBeGreaterThan(fieldAccess);
    expect(financialGate).toBeGreaterThanOrEqual(0);
  });
});
