/**
 * @vitest-environment happy-dom
 */
/**
 * Orders page, item 1 (5 Nov 2026): the four equal stat cards become ONE quiet strip.
 * Measured and seen on the real page before this change (fr light, main 293a52f2): four cards of the same size and
 * weight took 103 px; the first one was tinted green as "selected" and so drew the eye to the least urgent number
 * (active orders); the pending count (821) was written in a card, in a tab chip and in the header button.
 *
 * Rules pinned here: one card (not four); passive (the tabs below carry the selection, so no tint and no accent);
 * every figure still a link; larger figure than label with tabular digits; dividers mirror in right-to-left;
 * visible keyboard focus; a withheld figure is a dash, never a missing label.
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { OrdersKpiItem, OrdersKpiStrip } from "@/components/orders/orders-kpi-strip";

afterEach(cleanup);

function mount(revenue: string = "184 000 DA") {
  return render(
    <OrdersKpiStrip label="Orders overview">
      <OrdersKpiItem label="Active orders" value={2379} href="/orders" />
      <OrdersKpiItem label="Delivered today" value={0} href="/orders?status=delivered" />
      <OrdersKpiItem label="Revenue delivered today" value={revenue} href="/analytics" />
    </OrdersKpiStrip>,
  );
}

describe("OrdersKpiStrip", () => {
  it("is one labelled region holding three links, each with its label and its figure", () => {
    const { container } = mount();
    const region = container.querySelector("section[data-orders-kpi-strip]");
    expect(region, "the strip").toBeTruthy();
    expect(region?.getAttribute("aria-label")).toBe("Orders overview");
    const items = [...container.querySelectorAll("a[data-orders-kpi-item]")];
    expect(items.map((item) => item.getAttribute("href"))).toEqual(["/orders", "/orders?status=delivered", "/analytics"]);
    expect(items.map((item) => item.textContent)).toEqual([
      "Active orders2379",
      "Delivered today0",
      "Revenue delivered today184 000 DA",
    ]);
  });

  it("is passive: no selected tint and no accent colour (the tabs below carry the selection)", () => {
    const { container } = mount();
    const html = container.innerHTML;
    expect(html).not.toContain("data-selected");
    expect(html).not.toMatch(/(?:bg|border|text|ring)-primary/);
  });

  it("is one card, not three: the items carry no card surface or border of their own", () => {
    const { container } = mount();
    const region = container.querySelector("section[data-orders-kpi-strip]") as HTMLElement;
    expect(region.className).toMatch(/\brounded-surface\b/);
    expect(region.className).toMatch(/\bbg-card\b/);
    for (const item of container.querySelectorAll("a[data-orders-kpi-item]")) {
      expect(item.className).not.toMatch(/\brounded-surface\b|\bbg-card\b|\bborder\b/);
    }
  });

  it("draws thin dividers between the figures and mirrors them in right-to-left", () => {
    const { container } = mount();
    const region = container.querySelector("section[data-orders-kpi-strip]") as HTMLElement;
    expect(region.className).toMatch(/\bgrid-cols-3\b/);
    expect(region.className).toMatch(/\bdivide-x\b/);
    expect(region.className).toMatch(/\brtl:divide-x-reverse\b/);
  });

  it("makes the figure the largest text of its item (tabular digits), the label small and muted", () => {
    const { container } = mount();
    const item = container.querySelector("a[data-orders-kpi-item]") as HTMLElement;
    const figure = item.querySelector("[data-orders-kpi-figure]") as HTMLElement;
    const label = item.querySelector("[data-orders-kpi-label]") as HTMLElement;
    expect(figure.textContent).toBe("2379");
    expect(figure.className).toMatch(/\btabular-nums\b/);
    expect(figure.className).toMatch(/\bmd:text-2xl\b/);
    expect(figure.className).toMatch(/\bfont-semibold\b/);
    expect(label.className).toMatch(/\btext-xs\b/);
    expect(label.className).toMatch(/\btext-muted-foreground\b/);
    // Never below 12 px: text-xs is 12 px; no arbitrary smaller sizes.
    expect(container.innerHTML).not.toMatch(/text-\[(?:[0-9]|1[01])px\]/);
  });

  it("shows a visible keyboard focus ring on each figure", () => {
    const { container } = mount();
    for (const item of container.querySelectorAll("a[data-orders-kpi-item]")) {
      expect(item.className).toMatch(/\bfocus-visible:ring-2\b/);
      expect(item.className).toMatch(/\boutline-none\b/);
    }
  });

  it("a withheld figure is a dash, and its label stays", () => {
    const { container } = mount("—");
    const last = container.querySelectorAll("a[data-orders-kpi-item]")[2] as HTMLElement;
    expect(last.textContent).toBe("Revenue delivered today—");
  });
});
