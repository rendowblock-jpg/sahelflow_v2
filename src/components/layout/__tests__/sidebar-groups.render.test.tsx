/**
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Sidebar } from "@/components/layout/sidebar";
import { sidebarNavigationGroups, visibleSidebarNavigationGroups } from "@/components/layout/navigation";
import { NAV_GROUPS_STORAGE_KEY } from "@/components/layout/sidebar-group-state";
import type { Phase2Action } from "@/lib/identity/permissions";
import { render } from "@/test-utils/render";

const state = vi.hoisted(() => ({ pathname: "/orders", permissions: null as readonly string[] | null }));

vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children?: React.ReactNode } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/hooks/use-i18n", () => ({ useI18n: () => ({ t: (key: string) => key, locale: "en", dir: "ltr" }) }));
vi.mock("@/hooks/use-inbox-unread", () => ({ useInboxUnread: () => ({ conversations: 0 }) }));
vi.mock("@/hooks/use-new-message-alerts", () => ({ useNewMessageAlerts: () => undefined }));
vi.mock("@/components/layout/actor-access", () => ({ useActorPermissions: () => state.permissions }));
vi.mock("@/components/brand/sahelflow-mark", () => ({ SahelFlowMark: () => null }));

function mount(dir: "ltr" | "rtl" = "ltr") {
  return render(<Sidebar serverLocale={dir === "rtl" ? "ar" : "en"} serverDir={dir} />);
}

function groupIds(root: ParentNode): string[] {
  return [...root.querySelectorAll("[data-nav-group]")].map((node) => node.getAttribute("data-nav-group") ?? "");
}

beforeEach(() => {
  state.pathname = "/orders";
  state.permissions = null;
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("sidebar: grouped destinations", () => {
  it("renders the five headed groups and the unheaded footer, links in the visible order", () => {
    const { container } = mount();
    expect(groupIds(container)).toEqual(["today", "sales", "delivery", "money", "automation", "footer"]);
    const headers = [...container.querySelectorAll("[data-nav-group-header]")].map((node) => node.textContent?.trim());
    expect(headers).toEqual(["nav.groupToday", "nav.groupSales", "nav.groupDelivery", "nav.groupMoney", "nav.groupAutomation"]);
    expect(container.querySelector('[data-nav-group="footer"] [data-nav-group-header]')).toBeNull();
    const hrefs = [...container.querySelectorAll("a[href]")].map((node) => node.getAttribute("href"));
    expect(hrefs).toEqual(sidebarNavigationGroups.flatMap((group) => group.items.map((entry) => entry.href)));
  });

  it("keeps Today a plain label and makes the other headers buttons that start open", () => {
    const { container } = mount();
    const today = container.querySelector('[data-nav-group-header="today"]');
    expect(today?.tagName).not.toBe("BUTTON");
    expect(today?.getAttribute("aria-expanded")).toBeNull();
    fireEvent.click(today as Element);
    expect(container.querySelectorAll('[data-nav-group="today"] a[href]')).toHaveLength(3);
    for (const id of ["sales", "delivery", "money", "automation"]) {
      const header = container.querySelector(`[data-nav-group-header="${id}"]`);
      expect(header?.tagName).toBe("BUTTON");
      expect(header?.getAttribute("aria-expanded")).toBe("true");
    }
  });

  it("marks the active item with a 5px start bar, weight 600 and aria-current (not colour alone)", () => {
    const { container } = mount();
    const active = container.querySelector('a[href="/orders"]');
    expect(active?.getAttribute("aria-current")).toBe("page");
    expect(active?.className).toContain("font-semibold");
    const bar = active?.querySelector('[data-active-bar="true"]');
    expect(bar?.className).toContain("w-[5px]");
    expect(bar?.className).toContain("start-0");
    expect(bar?.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-active-bar="true"]')).toHaveLength(1);
  });

  it("collapses a group, remembers it per browser and restores it on the next mount", () => {
    const first = mount();
    const money = sidebarNavigationGroups.find((group) => group.id === "money")?.items ?? [];
    expect(money.length).toBeGreaterThan(0);
    fireEvent.click(first.container.querySelector('[data-nav-group-header="money"]') as Element);
    expect(first.container.querySelector('[data-nav-group-header="money"]')?.getAttribute("aria-expanded")).toBe("false");
    for (const entry of money) expect(first.container.querySelector(`a[href="${entry.href}"]`)).toBeNull();
    expect(window.localStorage.getItem(NAV_GROUPS_STORAGE_KEY)).toBe('{"collapsed":["money"]}');
    cleanup();
    const second = mount();
    expect(second.container.querySelector('[data-nav-group-header="money"]')?.getAttribute("aria-expanded")).toBe("false");
    expect(second.container.querySelector('[data-nav-group-header="sales"]')?.getAttribute("aria-expanded")).toBe("true");
  });

  it("keeps the current page visible inside a collapsed group", () => {
    const { container } = mount();
    fireEvent.click(container.querySelector('[data-nav-group-header="sales"]') as Element);
    expect(container.querySelector('a[href="/orders"]')?.getAttribute("aria-current")).toBe("page");
    expect(container.querySelector('a[href="/products"]')).toBeNull();
  });

  it("starts open on corrupt stored JSON", () => {
    window.localStorage.setItem(NAV_GROUPS_STORAGE_KEY, "{{{not json");
    const { container } = mount();
    expect(container.querySelectorAll('[aria-expanded="false"]')).toHaveLength(0);
  });

  it("still works when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { container } = mount();
    fireEvent.click(container.querySelector('[data-nav-group-header="delivery"]') as Element);
    expect(container.querySelector('[data-nav-group-header="delivery"]')?.getAttribute("aria-expanded")).toBe("false");
  });

  it("shows no header for a group the member cannot open anything in", () => {
    state.permissions = [] as readonly Phase2Action[];
    const { container } = mount();
    const expected = visibleSidebarNavigationGroups([] as readonly Phase2Action[]).map((group) => group.id);
    expect(container.querySelectorAll("a[href]").length).toBeLessThan(17);
    expect(groupIds(container)).toEqual(expected);
    for (const id of groupIds(container)) {
      expect(container.querySelectorAll(`[data-nav-group="${id}"] a[href]`).length, id).toBeGreaterThan(0);
    }
  });

  it("uses only start/end utilities, in the markup and in the source (RTL safe)", () => {
    const physical = /^(?:-?(?:ml|mr|pl|pr)-|(?:left|right)-|text-(?:left|right)$|border-[lr](?:-|$)|rounded-[lr](?:-|$)|space-x-)/;
    for (const dir of ["ltr", "rtl"] as const) {
      const { container, unmount } = mount(dir);
      expect(container.querySelector("aside")?.getAttribute("dir")).toBe(dir);
      const offenders = [...container.querySelectorAll("*")]
        .flatMap((node) => (node.getAttribute("class") ?? "").split(/\s+/))
        .filter((token) => physical.test(token));
      expect(offenders, dir).toEqual([]);
      unmount();
    }
    const source = readFileSync(resolve(__dirname, "../sidebar.tsx"), "utf8");
    expect(source.match(/["'\s`]-?(?:ml|mr|pl|pr)-\d|\btext-(?:left|right)\b|\bborder-[lr]\b/g) ?? []).toEqual([]);
  });
});
