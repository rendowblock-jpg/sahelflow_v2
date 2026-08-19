import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function source(relativeUrl: string): string {
  return readFileSync(new URL(relativeUrl, import.meta.url), "utf8");
}

describe("Risk Engine seller workspace contract", () => {
  it("keeps the overview calm and decision-first", () => {
    const page = source("../../../app/(dashboard)/risk/page.tsx");

    expect(page).toContain('data-risk-seller-workspace="v3"');
    expect(page).toContain('data-risk-overview-kpis="true"');
    expect(page.match(/<StatCard/g) ?? []).toHaveLength(4);
    expect(page.match(/tone="neutral"/g) ?? []).toHaveLength(4);
    expect(page).not.toContain("avgRiskTone");
    expect(page).not.toContain("highRiskTone");
    expect(page).not.toContain("confirmationTone");
    expect(page).not.toContain("returnTone");
    expect(page).not.toContain("blacklistTone");
    expect(page).not.toContain("savingsTone");
  });

  it("gives the primary trend the full overview width and removes decorative risk bands", () => {
    const page = source("../../../app/(dashboard)/risk/page.tsx");

    expect(page).toContain('data-risk-primary-trend="true"');
    expect(page).toContain('height="clamp(20rem, 30vw, 25rem)"');
    expect(page).toContain("referenceLines={riskReferenceLines}");
    expect(page).not.toContain("riskReferenceBands");
    expect(page).not.toContain("referenceBands={");
  });

  it("separates seller signals from deeper analytical tables", () => {
    const page = source("../../../app/(dashboard)/risk/page.tsx");

    expect(page).toContain('data-risk-seller-signals="true"');
    expect(page).toContain('data-risk-confirmation-table="true"');
    expect(page).toContain('TabsContent value="analysis"');
    expect(page).toContain('TabsContent value="blacklist"');
    expect(page).toContain('TabsContent value="control"');
    expect(page).toContain('TabsContent value="rules"');
  });
});
