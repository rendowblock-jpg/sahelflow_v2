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

  it("commits locale, server copy, document direction and shell geometry as one refreshed tree", () => {
    const routeLayout = read("src/app/(dashboard)/layout.tsx");
    const dashboardLayout = read("src/components/layout/dashboard-layout.tsx");
    const topbar = read("src/components/layout/topbar.tsx");
    const store = read("src/stores/ui-store.ts");
    const hook = read("src/hooks/use-i18n.ts");
    const i18n = read("src/lib/i18n/index.ts");
    const serverLocale = read("src/lib/i18n/server-locale-context.tsx");

    expect(routeLayout).not.toContain("serverDir");
    expect(dashboardLayout).toContain("const { t, locale, dir } = useI18n()");
    expect(dashboardLayout).toContain("serverDir={dir}");
    expect(store).toContain("requestLocale(locale: Locale)");
    expect(store).toContain("applyDocumentLocale(locale)");
    expect(hook).toContain("requestLocale(newLocale)");
    expect(hook).toContain("startLocaleTransition(() => {");
    expect(hook).toContain("router.refresh();");
    expect(topbar).not.toContain("router.refresh()");
    expect(topbar).toContain("isLocalePending");
    expect(serverLocale).toContain("useLayoutEffect");
    expect(serverLocale).toContain("commitLocale(locale)");
    expect(hook).toContain("const translations = getTranslations(locale)");
    expect(hook).not.toContain("use(getTranslationPromise(locale))");
    expect(i18n).toContain("const STATIC_TRANSLATIONS");
    expect(i18n).toContain("getTranslations(locale: Locale)");
  });

  it("keeps theme mode and coordinated presets coherent even when persistence fails", () => {
    const appearance = read("src/components/settings/appearance-panel.tsx");
    const provider = read("src/components/theme-provider.tsx");
    const rootLayout = read("src/app/layout.tsx");

    expect(appearance).toContain('from "@/components/theme-provider"');
    expect(appearance).not.toContain('from "next-themes"');
    expect(provider).toContain('type ThemePreset = "sahel" | "atlas" | "oasis" | "dune"');
    expect(provider).toContain("sahelflow-theme-preset");
    expect(provider).toContain("let runtimeThemeOverride: ThemeMode | null = null");
    expect(provider).toContain("let runtimePresetOverride: ThemePreset | null = null");
    expect(provider).toContain("if (runtimeThemeOverride !== null) return runtimeThemeOverride");
    expect(provider).toContain("if (runtimePresetOverride !== null) return runtimePresetOverride");
    expect(provider).toContain("runtimeThemeOverride = theme");
    expect(provider).toContain("runtimePresetOverride = preset");
    expect(provider).toContain("persistTheme(normalized)");
    expect(provider).toContain("persistPreset(normalized)");
    expect(provider).toContain("notifyAppearanceChanged();");
    expect(rootLayout).toContain("e.dataset.themePreset=p");
  });

  it("hydrates and validates one persisted density authority through a server-safe snapshot", () => {
    const store = read("src/stores/ui-store.ts");
    const densityHook = read("src/hooks/use-ui-density.ts");
    const table = read("src/components/data-table/data-table.tsx");
    const appearance = read("src/components/settings/appearance-panel.tsx");
    const dashboardLayout = read("src/components/layout/dashboard-layout.tsx");

    expect(store).toContain('export const DEFAULT_UI_DENSITY: UiDensity = "comfortable"');
    expect(store).toContain("function isUiDensity(value: unknown): value is UiDensity");
    expect(store).toContain("density: isUiDensity(persisted?.density)");
    expect(store).not.toContain("...persisted,");
    expect(densityHook).toContain("useSyncExternalStore(");
    expect(densityHook).toContain("useUIStore.subscribe");
    expect(densityHook).toContain("() => DEFAULT_UI_DENSITY");
    expect(table).toContain("const { density, setDensity } = useUiDensity()");
    expect(table).not.toContain("sf-density");
    expect(appearance).toContain("const { density, setDensity } = useUiDensity()");
    expect(dashboardLayout).toContain("const { density } = useUiDensity()");
    expect(dashboardLayout).toContain("root.dataset.density = density");
    expect(dashboardLayout).toContain('window.matchMedia("(pointer: coarse)")');
    expect(dashboardLayout).toContain('coarsePointer.matches\n          ? "3rem"');
    expect(dashboardLayout).toContain('density === "compact"\n            ? "2.25rem"');
    expect(dashboardLayout).toContain('coarsePointer.addEventListener("change", applyControlHeight)');
  });

  it("sizes portaled interaction primitives from the shared control-height authority", () => {
    const dropdown = read("src/components/ui/dropdown-menu.tsx");
    const select = read("src/components/ui/select.tsx");
    const dialog = read("src/components/ui/dialog.tsx");
    const sheet = read("src/components/ui/sheet.tsx");

    expect(dropdown.match(/min-h-\(--control-height\)/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
    expect(select.match(/min-h-\(--control-height\)/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
    expect(dialog).toContain("min-h-(--control-height) min-w-(--control-height)");
    expect(sheet).toContain("min-h-(--control-height) min-w-(--control-height)");
  });

  it("keeps user-authored search direction automatic and command chrome flow-relative", () => {
    const input = read("src/components/ui/input.tsx");
    const command = read("src/components/ui/command.tsx");

    expect(input).not.toContain('  "search",');
    expect(input).toContain('? "ltr" : "auto"');
    expect(command).toContain("ms-auto text-xs tracking-widest");
    expect(command).not.toContain("ml-auto text-xs tracking-widest");
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

  it("keeps inline operational notices compact, bounded and contextual", () => {
    const source = read("src/components/shared/state-surface.tsx");
    expect(source).toContain('inline: "min-h-0 px-2.5 py-2"');
    expect(source).toContain("w-fit max-w-[min(100%,48rem)] self-start");
    expect(source).toContain('inline ? "size-7 rounded-md"');
    expect(source).toContain('inline ? "text-[13px] leading-5"');
    expect(source).toContain('data-state-size={size}');
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
