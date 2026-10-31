/**
 * @vitest-environment happy-dom
 */
/**
 * 31 Oct 2026, NEW-PHONE-ORDERS-SEARCH-PLACEHOLDER-CLIPPED: on a phone the orders search box shows the
 * short hint (orders.searchHintPhone); everywhere else the long one. The phone/desktop choice comes from
 * the media-query hook (mocked both ways), never from a width read while rendering.
 */
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { render } from "@/test-utils/render";

const state = vi.hoisted(() => ({ phone: false }));
vi.mock("@/hooks/use-mobile", () => ({ useMobile: () => state.phone }));
vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({ t: (key: string) => key, locale: "en" }),
}));
vi.mock("@/hooks/use-orders-filter-params", () => ({
  useOrdersFilterParams: () => ({
    q: null,
    wilaya: null,
    from: null,
    to: null,
    hasActiveFilters: false,
    setParams: vi.fn(),
    clearFilters: vi.fn(),
  }),
}));
vi.mock("@/components/shared/list-search-input", () => ({
  ListSearchInput: (props: { placeholder?: string }) => (
    <input data-testid="orders-search" placeholder={props.placeholder} />
  ),
}));

import { OrdersFilterBar } from "../orders-filter-bar";

afterEach(cleanup);

describe("orders filter bar search hint", () => {
  it("uses the short phone hint when the phone hook says phone", () => {
    state.phone = true;
    render(<OrdersFilterBar />);
    expect(screen.getByTestId("orders-search")).toHaveAttribute("placeholder", "orders.searchHintPhone");
  });

  it("uses the long hint when the phone hook says not a phone", () => {
    state.phone = false;
    render(<OrdersFilterBar />);
    expect(screen.getByTestId("orders-search")).toHaveAttribute("placeholder", "orders.filters.searchPlaceholder");
  });
});
