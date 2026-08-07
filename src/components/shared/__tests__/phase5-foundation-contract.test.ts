import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Phase 5 experience foundation source contract", () => {
  it("keeps the authenticated shell edge-to-edge instead of nesting a floating web panel", () => {
    const source = read("src/components/layout/dashboard-layout.tsx");
    expect(source).toContain('data-sahelflow-shell="desktop"');
    expect(source).not.toContain("lg:rounded-xl");
    expect(source).not.toContain("lg:p-2");
  });

  it("derives command navigation from the canonical navigation registry", () => {
    const source = read("src/components/command-palette.tsx");
    expect(source).toContain("flattenNavigationItems");
    expect(source).not.toContain('id: "nav-dashboard"');
    expect(source).not.toContain('id: "action-new-order"');
  });

  it("uses one shared persistent state surface for empty and page-error states", () => {
    expect(read("src/components/shared/empty-state.tsx")).toContain(
      "StateSurface",
    );
    expect(read("src/components/shared/page-error.tsx")).toContain(
      "StateSurface",
    );
  });

  it("scopes desktop density and motion overrides to the authenticated shell", () => {
    const source = read("src/app/phase5.css");
    expect(source).toContain('[data-sahelflow-shell="desktop"]');
    expect(source).toContain(".stagger-grid > *");
    expect(source).toContain("animation: none !important");
  });

  it("governs chart regions and locale-aware formatter resolution", () => {
    const source = read("src/components/charts/chart-primitives.tsx");
    expect(source).toContain('role="group"');
    expect(source).toContain("summary?: React.ReactNode");
    expect(source).toContain("SupportedLocale");
    expect(source).toContain("formatDZDShort(value, locale)");
  });
});
