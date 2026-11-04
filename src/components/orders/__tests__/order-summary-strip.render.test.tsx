/**
 * @vitest-environment happy-dom
 */
/**
 * s42 orderpage: the summary strip answers who / how much / where / what next on the first screen.
 * ONE card, four cells (total, customer, payment, delivery), only data the page already loads.
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { Locale } from "@/lib/i18n";
import { formatDZD } from "@/lib/utils";
import { displayWilaya } from "@/lib/wilaya-display";
import { OrderSummaryStrip, type OrderSummaryStripProps } from "../order-summary-strip";
import { PAGE_LOCALES, RAW_KEY, makeT } from "./order-page-test-i18n";

afterEach(cleanup);

function props(locale: Locale, over: Partial<OrderSummaryStripProps> = {}): OrderSummaryStripProps {
  return {
    t: makeT(locale),
    locale,
    status: "shipped",
    totalPrice: 14500,
    deliveryCost: 600,
    itemCount: 3,
    customerName: "Amina Benali",
    phone: "0555123456",
    wilaya: "16",
    commune: "Bab Ezzouar",
    address: "12 rue des Oliviers, cité 5 Juillet",
    codState: "receivable",
    deliveryState: "in_transit",
    delivery: { provider: "yalidine", trackingNumber: "YAL-884213", status: "in_transit" },
    whatsapp: <button type="button">WA-SLOT</button>,
    ...over,
  };
}

describe.each(PAGE_LOCALES)("OrderSummaryStrip (%s)", (locale) => {
  it("shows the total big, the customer name in a bdi, the phone as a ltr tel link, and no raw key", () => {
    const { container } = render(<OrderSummaryStrip {...props(locale)} />);
    const text = container.textContent ?? "";
    expect(text).toContain(formatDZD(14500, locale));
    const bdi = container.querySelector("bdi[dir='auto']");
    expect(bdi?.textContent).toBe("Amina Benali");
    const tel = container.querySelector("a[href='tel:0555123456']");
    expect(tel).not.toBeNull();
    expect(tel!.getAttribute("dir")).toBe("ltr");
    expect(text).not.toMatch(RAW_KEY);
    expect(text).not.toContain("{{");
    const total = [...container.querySelectorAll("p,span,div")].find(
      (el) => el.children.length === 0 && el.textContent === formatDZD(14500, locale),
    );
    expect(total?.className).toContain("text-2xl");
    expect(total?.className).toContain("tabular-nums");
  });

  it("is one card with four cells and a 2 x 2 phone grid", () => {
    const { container } = render(<OrderSummaryStrip {...props(locale)} />);
    expect(container.querySelectorAll("[data-slot='card']").length).toBe(1);
    for (const cell of ["total", "customer", "payment", "delivery"]) {
      expect(container.querySelectorAll(`[data-testid='order-summary-${cell}']`).length).toBe(1);
    }
    const grid = container.querySelector("[data-testid='order-summary-grid']")!;
    expect(grid.className).toContain("grid-cols-2");
    expect(grid.className).toContain("xl:grid-cols-4");
  });

  it("gives items and shipping under the total, the place under the phone, and the WhatsApp slot beside it", () => {
    const t = makeT(locale);
    const { container } = render(<OrderSummaryStrip {...props(locale)} />);
    const totalCell = container.querySelector("[data-testid='order-summary-total']")!;
    expect(totalCell.textContent).toContain(t("orders.detail.itemsCount", { count: 3 }));
    expect(totalCell.textContent).toContain(formatDZD(600, locale));
    const customerCell = container.querySelector("[data-testid='order-summary-customer']")!;
    expect(customerCell.textContent).toContain("Bab Ezzouar");
    expect(customerCell.textContent).toContain(displayWilaya("16", locale));
    expect(customerCell.textContent).toContain("WA-SLOT");
  });

  it("payment: the COD state as a plain label and the amount to collect", () => {
    const t = makeT(locale);
    const { container } = render(<OrderSummaryStrip {...props(locale)} />);
    const cell = container.querySelector("[data-testid='order-summary-payment']")!;
    expect(cell.textContent).toContain(t("orders.workspace.fulfillment.state.receivable"));
    expect(cell.textContent).toContain(formatDZD(14500, locale));
    expect(cell.textContent).toContain(t("orders.detail.summary.toCollect"));
  });

  it("payment: nothing left to collect once the cash is collected, and never for a cancelled order", () => {
    const t = makeT(locale);
    const collected = render(<OrderSummaryStrip {...props(locale, { codState: "collected" })} />);
    const cell = collected.container.querySelector("[data-testid='order-summary-payment']")!;
    expect(cell.textContent).toContain(t("orders.workspace.fulfillment.state.collected"));
    expect(cell.textContent).not.toContain(t("orders.detail.summary.toCollect"));
    cleanup();
    const cancelled = render(<OrderSummaryStrip {...props(locale, { status: "cancelled", codState: null })} />);
    expect(cancelled.container.querySelector("[data-testid='order-summary-payment']")!.textContent).not.toContain(
      t("orders.detail.summary.toCollect"),
    );
  });

  it("delivery: courier, tracking number (ltr), state and a one-line address", () => {
    const t = makeT(locale);
    const { container } = render(<OrderSummaryStrip {...props(locale)} />);
    const cell = container.querySelector("[data-testid='order-summary-delivery']")!;
    expect(cell.textContent?.toLowerCase()).toContain("yalidine");
    const tracking = [...cell.querySelectorAll("[dir='ltr']")].find((el) => el.textContent === "YAL-884213");
    expect(tracking).toBeTruthy();
    expect(cell.textContent).toContain(t("orders.workspace.fulfillment.state.in_transit"));
    expect(cell.textContent).toContain("12 rue des Oliviers");
  });

  it("delivery: says so when there is no shipment yet", () => {
    const t = makeT(locale);
    const { container } = render(
      <OrderSummaryStrip {...props(locale, { delivery: null, deliveryState: null, status: "confirmed", codState: null })} />,
    );
    expect(container.querySelector("[data-testid='order-summary-delivery']")!.textContent).toContain(
      t("orders.detail.summary.noShipment"),
    );
  });

  it("never uses uppercase or letter-spacing (Arabic safe) and only logical classes", () => {
    const { container } = render(<OrderSummaryStrip {...props(locale)} />);
    expect(container.innerHTML).not.toMatch(/\buppercase\b|tracking-(?!tight)/);
    expect(container.innerHTML).not.toMatch(/\b(?:ml|mr|pl|pr)-\d|text-left|text-right|\bleft-|\bright-/);
  });
});

describe("OrderSummaryStrip without a customer record", () => {
  it("falls back to the phone and the not-found sentence, not an empty cell", () => {
    const t = makeT("en");
    const { container } = render(<OrderSummaryStrip {...props("en", { customerName: null })} />);
    expect(container.textContent).toContain(t("orders.detail.customerNotFound"));
    expect(container.querySelector("a[href='tel:0555123456']")).not.toBeNull();
  });
});
