/**
 * @vitest-environment happy-dom
 */
/**
 * The storefront list on a phone: the live/offline filter is a 44 px control that may wrap, and a search that matches
 * nothing says so and offers the one way out (clear the filters) instead of a dead-end sentence.
 */
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StorefrontsListClient } from "@/components/storefront/storefronts-list-client";
import type { StorefrontConfig } from "@/lib/storefront/service";
import { render } from "@/test-utils/render";

vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({ t: (key: string) => key, locale: "ar", dir: "rtl" }),
}));
vi.mock("@/lib/toast", () => {
  const toast = { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn(), message: vi.fn(), dismiss: vi.fn() };
  return { toast, showToast: toast };
});
vi.mock("@/components/storefront/storefront-card", () => ({
  StorefrontCard: ({ config }: { config: { name: string } }) => <article data-testid="store-card">{config.name}</article>,
}));

const store = (id: string, name: string, isActive: boolean) =>
  ({ id, slug: id, name, isActive, productIds: [] }) as unknown as StorefrontConfig;
const configs = [store("dar-el-moda", "دار الموضة", true), store("sahara-shoes", "أحذية الصحراء", true), store("old-shop", "متجر قديم", false)];

function mount() {
  return render(
    <StorefrontsListClient configs={configs} products={[]} performance={{}} canManage canPublish canDelete={false} />,
  );
}

describe("storefront list on a phone", () => {
  it("ready: one card per store, and the Live/Offline filter counts and filters them", () => {
    mount();
    expect(screen.getAllByTestId("store-card")).toHaveLength(3);
    const live = screen.getByRole("button", { name: /storefront\.list\.filterLive/ });
    expect(live.textContent).toContain("2");
    fireEvent.click(live);
    expect(screen.getAllByTestId("store-card").map((card) => card.textContent)).toEqual(["دار الموضة", "أحذية الصحراء"]);
  });

  it("the filter buttons are 44 px tall on a phone and the group may wrap instead of overflowing", () => {
    mount();
    const group = screen.getByRole("group");
    expect(group.className).toContain("flex-wrap");
    for (const button of within(group).getAllByRole("button")) expect(button.className).toContain("min-h-11");
  });

  it("no match: says so and offers Clear filters, which restores the list and empties the search", () => {
    mount();
    const search = screen.getByRole("searchbox") as HTMLInputElement;
    fireEvent.change(search, { target: { value: "zzz" } });
    expect(screen.queryAllByTestId("store-card")).toHaveLength(0);
    expect(screen.getByText("storefront.list.noMatch")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "storefront.list.clearFilters" }));
    expect(screen.getAllByTestId("store-card")).toHaveLength(3);
    expect(search.value).toBe("");
  });
});
