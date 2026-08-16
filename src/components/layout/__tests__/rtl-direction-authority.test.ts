import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function source(relativeUrl: string): string {
  return readFileSync(new URL(relativeUrl, import.meta.url), "utf8");
}

describe("application RTL direction authority", () => {
  it("binds Radix primitives to the same reactive locale direction as the shell", () => {
    const rootLayout = source("../../../app/layout.tsx");
    const provider = source("../../i18n/app-direction-provider.tsx");

    expect(rootLayout).toContain("<ServerLocaleProvider locale={locale}>");
    expect(rootLayout).toContain("<AppDirectionProvider>");
    expect(provider).toContain('import { Direction } from "radix-ui"');
    expect(provider).toContain("const { dir } = useI18n()");
    expect(provider).toContain("<Direction.Provider dir={dir}>");
  });

  it("keeps shell geometry reactive instead of pinning Arabic to a server-only direction", () => {
    const shell = source("../dashboard-layout.tsx");

    expect(shell).toContain("const { t, locale, dir } = useI18n()");
    expect(shell).toContain("data-locale-dir={dir}");
    expect(shell).toContain("<Sidebar serverLocale={locale} serverDir={dir} />");
    expect(shell).toContain("serverDir={dir}");
  });

  it("keeps toast placement and toast reading order in the same reactive direction", () => {
    const toaster = source("../../ui/sonner.tsx");

    expect(toaster).toContain("const direction = mounted ? getDirection(locale) : initialDirection");
    expect(toaster).toContain('position ?? (direction === "rtl" ? "bottom-left" : "bottom-right")');
    expect(toaster).toContain("dir={direction}");
  });

  it("keeps shared navigation and popup internals logical so the provider can mirror them", () => {
    const sidebar = source("../sidebar.tsx");
    const topbar = source("../topbar.tsx");
    const dropdown = source("../../ui/dropdown-menu.tsx");

    expect(sidebar).toContain("border-e border-sidebar-border");
    expect(sidebar).toContain("absolute inset-y-2 start-0");
    expect(sidebar).toContain("ms-4 border-s border-sidebar-border ps-2");
    expect(topbar).toContain('<DropdownMenuContent align="end" className="w-80 shadow-dropdown">');
    expect(dropdown).toContain("data-[inset]:ps-8");
    expect(dropdown).toContain("absolute start-2");
    expect(dropdown).toContain("ms-auto");
  });

  it("declares mobile navigation as inline-start and leaves physical placement to Sheet", () => {
    const topbar = source("../topbar.tsx");
    const sheet = source("../../ui/sheet.tsx");

    expect(topbar).toContain('side="start"');
    expect(topbar).not.toContain('side={isRtl ? "right" : "left"}');
    expect(topbar).not.toContain('const isRtl = serverDir === "rtl"');
    expect(topbar).toContain("<Sidebar serverLocale={serverLocale} serverDir={serverDir} />");
    expect(sheet).toContain("resolvePanelSide(side, dir)");
    expect(sheet).toContain("data-sheet-physical-side={resolvedSide}");
  });
});
