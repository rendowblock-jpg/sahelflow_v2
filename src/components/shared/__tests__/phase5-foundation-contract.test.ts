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

  it("keeps locale, document direction and shell geometry on one reactive authority", () => {
    const routeLayout = read("src/app/(dashboard)/layout.tsx");
    const dashboardLayout = read("src/components/layout/dashboard-layout.tsx");
    const store = read("src/stores/ui-store.ts");

    expect(routeLayout).not.toContain("serverDir");
    expect(dashboardLayout).toContain("const { t, locale, dir } = useI18n()");
    expect(dashboardLayout).toContain("serverDir={dir}");
    expect(store).toContain("applyDocumentLocale(locale)");
  });

  it("keeps theme mode and coordinated presets under the custom appearance authority", () => {
    const appearance = read("src/components/settings/appearance-panel.tsx");
    const provider = read("src/components/theme-provider.tsx");
    const rootLayout = read("src/app/layout.tsx");

    expect(appearance).toContain('from "@/components/theme-provider"');
    expect(appearance).not.toContain('from "next-themes"');
    expect(provider).toContain('type ThemePreset = "sahel" | "atlas" | "oasis" | "dune"');
    expect(provider).toContain("sahelflow-theme-preset");
    expect(rootLayout).toContain("data-theme-preset");
  });

  it("derives command navigation from the canonical navigation registry", () => {
    const source = read("src/components/command-palette.tsx");
    expect(source).toContain("flattenNavigationItems");
    expect(source).not.toContain('id: "nav-dashboard"');
    expect(source).not.toContain('id: "action-new-order"');
  });

  it("keeps seller destinations directly reachable and nests only explicit subflows", () => {
    const sidebar = read("src/components/layout/sidebar.tsx");
    const navigation = read("src/components/layout/navigation.ts");

    expect(sidebar).toContain("domain.children?.map((child) => (");
    expect(sidebar).toContain("nested={child.sidebarNested}");
    expect(sidebar).not.toContain("domainSelected && domain.children?.length");
    expect(sidebar).not.toContain("data-navigation-children={domain.id}");
    expect(navigation).toContain("sidebarNested?: boolean");
    expect(navigation).toContain('"confirmation-queue"');
    expect(navigation).toContain('"cod-reconciliation"');
  });

  it("uses one shared persistent state surface for empty and page-error states", () => {
    expect(read("src/components/shared/empty-state.tsx")).toContain(
      "StateSurface",
    );
    expect(read("src/components/shared/page-error.tsx")).toContain(
      "StateSurface",
    );
  });

  it("keeps inline operational notices compact and contextual", () => {
    const source = read("src/components/shared/state-surface.tsx");
    expect(source).toContain('inline: "min-h-0 px-3 py-2.5"');
    expect(source).toContain('data-state-size={size}');
    expect(source).toContain('inline ? "items-start justify-start"');
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
