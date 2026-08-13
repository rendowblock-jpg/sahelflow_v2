import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Wave 2 metric hierarchy contract", () => {
  it("keeps passive metrics non-interactive while exposing explicit action and selected states", () => {
    const card = read("src/components/shared/stat-card.tsx");

    expect(card).toContain('export type StatCardEmphasis = "standard" | "primary" | "supporting"');
    expect(card).toContain("action?: React.ReactNode");
    expect(card).toContain("selected?: boolean");
    expect(card).toContain('data-stat-interaction={actionable ? "actionable" : "passive"}');
    expect(card).toContain('data-selected={selected ? "true" : undefined}');
    expect(card).toContain('data-stat-emphasis={emphasis}');
    expect(card).toContain('data-stat-tone={tone}');
    expect(card).toContain('data-stat-action="true"');
  });

  it("uses semantic tones without changing metric or business authority", () => {
    const card = read("src/components/shared/stat-card.tsx");

    for (const tone of ["neutral", "accent", "success", "warning", "danger"]) {
      expect(card).toContain(`${tone}: {`);
    }
    expect(card).toContain("toneStyle.surface");
    expect(card).toContain("toneStyle.icon");
  });

  it("separates Risk operational signals from supporting context", () => {
    const risk = read("src/app/(dashboard)/risk/page.tsx");

    expect(risk).toContain('data-risk-kpi-hierarchy="true"');
    expect(risk).toContain('data-risk-kpi-primary="true"');
    expect(risk).toContain('data-risk-kpi-supporting="true"');
    expect(risk.match(/emphasis="primary"/g)?.length ?? 0).toBe(2);
    expect(risk.match(/emphasis="supporting"/g)?.length ?? 0).toBe(4);
    expect(risk).not.toContain('<div className="card-grid-3">');
  });

  it("makes blacklist navigation explicit and selected only when that tab is active", () => {
    const risk = read("src/app/(dashboard)/risk/page.tsx");

    expect(risk).toContain('selected={activeTab === "blacklist"}');
    expect(risk).toContain('href={`/risk?days=${days}&tab=blacklist`}');
    expect(risk).toContain('aria-current={activeTab === "blacklist" ? "page" : undefined}');
  });
});
