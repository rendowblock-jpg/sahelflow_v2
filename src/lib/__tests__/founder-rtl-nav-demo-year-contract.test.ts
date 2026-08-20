import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("Founder RTL, navigation and annual demo contracts", () => {
  it("keeps compact Arabic chart money under the canonical DZD formatter", () => {
    const chart = read("src/components/charts/dual-bar-chart.tsx");
    const utils = read("src/lib/utils.ts");

    expect(chart).toContain("formatDZDShort");
    expect(chart).toContain("isolateNaturalText(formatDZDShort(value, locale))");
    expect(chart).toContain("formatter: (value: number) => compactMoneyValue(value)");
    expect(chart).toContain("isolateNaturalText(formatDZD(value, locale))");
    expect(chart).not.toContain("formatCompactNumber");
    expect(chart).not.toContain("isolateLtr(");
    expect(utils).toContain("export function formatDZDShort(");
  });

  it("lets empty natural-language controls inherit live locale direction", () => {
    const input = read("src/components/ui/input.tsx");
    const textarea = read("src/components/ui/textarea.tsx");
    const select = read("src/components/ui/select.tsx");
    const rawBackstop = read("src/app/rtl-form-controls.css");
    const dashboardLayout = read("src/app/(dashboard)/layout.tsx");

    expect(input).toContain('? "ltr" : undefined');
    expect(input).not.toContain('? "ltr" : "auto"');
    expect(input).toContain("text-start text-base");
    expect(textarea).toContain("dir={dir}");
    expect(textarea).not.toContain('dir={dir ?? "auto"}');
    expect(textarea).toContain("text-start text-base");
    expect(select).toContain('className={cn("min-w-0 flex-1 text-start", className)}');
    expect(select).toContain("data-[placeholder]:text-muted-foreground");
    expect(rawBackstop).toContain('input[type="text"]');
    expect(rawBackstop).toContain('input[type="search"]');
    expect(rawBackstop).toContain('textarea,');
    expect(rawBackstop).toContain('direction: inherit;');
    expect(rawBackstop).toContain('text-align: start;');
    expect(dashboardLayout).toContain('import "@/app/rtl-form-controls.css"');
  });

  it("uses one fixed seller-priority sidebar and retires custom reordering", () => {
    const navigation = read("src/components/layout/navigation.ts");
    const sidebar = read("src/components/layout/sidebar.tsx");
    const appearance = read("src/components/settings/appearance-panel.tsx");
    const uiStore = read("src/stores/ui-store.ts");

    expect(navigation).toContain("sellerSidebarNavigationItems");
    expect(sidebar).toContain('data-seller-navigation="fixed-priority"');
    expect(sidebar).toContain("sellerSidebarNavigationItems.map");
    expect(sidebar).toContain("const selected = activeHref === item.href");
    expect(appearance).not.toContain("data-navigation-preferences");
    expect(appearance).not.toContain("navigationMoveUp");
    expect(uiStore).not.toContain("navigationDomainOrder:");
    expect(uiStore).not.toContain("setNavigationDomainOrder:");
  });

  it("makes Settings the canonical Profile implementation without adding sidebar logout", () => {
    const navigation = read("src/components/layout/navigation.ts");
    const settings = read("src/components/settings/settings-workspace.tsx");
    const profile = read("src/app/(dashboard)/profile/page.tsx");
    const topbar = read("src/components/layout/topbar.tsx");

    expect(navigation).not.toContain('item("profile", "nav.profile", "/profile"');
    expect(navigation).toContain('href === "/settings" && pathname === "/profile"');
    expect(settings).toContain('<ProfileEditor canManage={access.profileManage} />');
    expect(settings).toContain('id="settings-profile"');
    expect(profile).toContain('import SettingsPage from "@/app/(dashboard)/settings/page"');
    expect(profile).toContain('group: "workspace"');
    expect(profile).not.toContain("<ProfileEditor");
    expect(topbar).toContain("logoutAndRedirect");
    expect(sidebarLogoutCount(navigation)).toBe(0);
  });

  it("builds a deterministic rolling 365-day Algerian business history", () => {
    const clock = read("src/lib/demo/algerian-demo-clock.ts");
    const annual = read("src/lib/demo/algerian-demo-year.ts");
    const lifecycle = read("src/lib/demo/algerian-demo-lifecycle.ts");
    const story = read("src/lib/demo/algerian-demo-story.ts");

    expect(clock).toContain("ALGERIAN_DEMO_HISTORY_DAYS = 365");
    expect(clock).toContain("SF_DEMO_REFERENCE_NOW");
    expect(annual).toContain("ensureAlgerianDemoAnnualHistory");
    expect(annual).toContain("demo-order-year-");
    expect(annual).toContain("reconcileCustomerHistory");
    expect(annual).toContain("expensePlan(reference)");
    expect(lifecycle).toContain("ALGERIAN_DEMO_WORKSPACE_VERSION");
    expect(lifecycle).toContain("isAlgerianDemoAnnualHistoryComplete");
    expect(story).toContain("ensureAlgerianDemoAnnualHistory(client, reference)");
  });
});

function sidebarLogoutCount(navigationSource: string): number {
  return (navigationSource.match(/logout/gi) ?? []).length;
}
