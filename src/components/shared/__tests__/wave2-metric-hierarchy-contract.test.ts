import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Wave 2 metric hierarchy contract", () => {
  it("keeps passive metrics non-interactive while exposing explicit action and selected states", () => {
    const card = read("src/components/shared/stat-card.tsx");

    expect(card).toContain(
      'export type StatCardEmphasis = "standard" | "primary" | "supporting"',
    );
    expect(card).toContain("action?: React.ReactNode");
    expect(card).toContain("selected?: boolean");
    expect(card).toContain(
      'data-stat-interaction={actionable ? "actionable" : "passive"}',
    );
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

  it("orders the Risk overview as KPIs, dominant trend, then supporting seller signals", () => {
    const risk = read("src/app/(dashboard)/risk/page.tsx");
    const kpisMarker = 'data-risk-overview-kpis="true"';
    const trendMarker = 'data-risk-primary-trend="true"';
    const signalsMarker = 'data-risk-seller-signals="true"';
    const kpisIndex = risk.indexOf(kpisMarker);
    const trendIndex = risk.indexOf(trendMarker);
    const signalsIndex = risk.indexOf(signalsMarker);

    expect(kpisIndex).toBeGreaterThan(-1);
    expect(trendIndex).toBeGreaterThan(kpisIndex);
    expect(signalsIndex).toBeGreaterThan(trendIndex);
    expect(risk.match(/<StatCard/g)?.length ?? 0).toBe(4);
    expect(risk.match(/emphasis="standard"/g)?.length ?? 0).toBe(4);
    expect(risk.match(/tone="neutral"/g)?.length ?? 0).toBe(4);
    expect(risk).not.toContain('data-risk-kpi-primary="true"');
    expect(risk).not.toContain('data-risk-kpi-supporting="true"');

    const trendSection = risk.slice(trendIndex, signalsIndex);
    expect(trendSection).toContain('className="w-full"');
    expect(trendSection).toContain('height="clamp(20rem, 30vw, 25rem)"');
    expect(trendSection).not.toContain("lg:grid-cols-2");
  });

  it("keeps blacklist navigation explicit without turning a KPI into tab state", () => {
    const risk = read("src/app/(dashboard)/risk/page.tsx");

    expect(risk).toContain('<TabsTrigger value="blacklist" asChild>');
    expect(risk).toContain('href={`/risk?days=${days}&tab=blacklist`}');
    expect(risk).toContain('data-risk-seller-signals="true"');
    expect(risk).not.toContain('selected={activeTab === "blacklist"}');
  });
});
