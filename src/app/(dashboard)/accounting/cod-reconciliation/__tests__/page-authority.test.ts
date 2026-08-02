import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("COD reconciliation page authority", () => {
  it("authorizes accounting and financial reads before querying COD data", () => {
    const page = readFileSync(
      resolve(
        process.cwd(),
        "src/app/(dashboard)/accounting/cod-reconciliation/page.tsx",
      ),
      "utf8",
    );
    const accountingGuard = page.indexOf(
      'requireTrustedAction("accounting.read")',
    );
    const financialGuard = page.indexOf(
      'assertTrustedAction(actorContext, "orders.financials.read")',
    );
    const query = page.indexOf("getCanonicalCodWorkspaceSummary({");

    expect(accountingGuard).toBeGreaterThanOrEqual(0);
    expect(financialGuard).toBeGreaterThan(accountingGuard);
    expect(query).toBeGreaterThan(financialGuard);
  });
});
