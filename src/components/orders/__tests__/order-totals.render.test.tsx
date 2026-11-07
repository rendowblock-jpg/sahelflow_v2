/**
 * @vitest-environment happy-dom
 */
/**
 * Item 2 money (M2a, task 6): the totals block of the order page. It was inline in page.tsx; it is a component now so the
 * discount row can be tested. The block is the same three rows as before (subtotal, shipping, total); a discount adds ONE row
 * between the subtotal and the shipping, only when it is above 0.
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { OrderTotals } from "@/components/orders/order-totals";
import { formatDZD } from "@/lib/utils";
import { PAGE_LOCALES, RAW_KEY, makeT } from "./order-page-test-i18n";

afterEach(cleanup);

const WORD = { en: "Discount", fr: "Remise", ar: "الخصم" } as const;
/** Collapse every kind of space (the French and Arabic amounts use a narrow no-break space) so text and expectation compare alike. */
const norm = (value: string) => value.replace(/\s+/g, " ");

describe.each(PAGE_LOCALES)("OrderTotals (%s)", (locale) => {
  const t = makeT(locale);
  const view = (discountDzd?: number | null) =>
    render(
      <OrderTotals t={t} locale={locale} itemsTotal={9000} deliveryCost={500} totalPrice={8000} discountDzd={discountDzd} />,
    ).container;
  /** The label of each row of the block, in order (the separator has no label). */
  const labels = (container: HTMLElement) =>
    [...(container.firstElementChild?.children ?? [])]
      .map((row) => row.firstElementChild?.textContent?.trim())
      .filter(Boolean);

  it("shows the discount as a minus amount in its own row between the subtotal and the shipping", () => {
    const container = view(1500);
    const text = norm(container.textContent ?? "");

    expect(text).toContain(WORD[locale]);
    expect(text).toContain(norm(`−${formatDZD(1500, locale)}`));
    expect(text).not.toMatch(RAW_KEY);
    const subtotal = text.indexOf(t("orders.detail.subtotal"));
    const discount = text.indexOf(WORD[locale]);
    const shipping = text.indexOf(t("orders.detail.shipping"));
    expect(subtotal).toBeLessThan(discount);
    expect(discount).toBeLessThan(shipping);
    // The amount is one bidi-isolated run, so the minus stays attached to the number in Arabic and French alike.
    const amount = [...container.querySelectorAll("bdi")].find((el) => el.textContent === `−${formatDZD(1500, locale)}`);
    expect(amount).toBeDefined();
    // The total is what the order stores; the block shows it, it does not recompute it.
    expect(text).toContain(norm(formatDZD(8000, locale)));
  });

  it.each([[0], [null], [undefined]])("shows no discount row when the discount is %s, and the same three rows as before", (discountDzd) => {
    const container = view(discountDzd);
    const text = norm(container.textContent ?? "");

    expect(text).not.toContain(WORD[locale]);
    expect(text).not.toContain("−");
    expect(labels(container)).toEqual([t("orders.detail.subtotal"), t("orders.detail.shipping"), t("orders.total")]);
    expect(text).toContain(norm(formatDZD(9000, locale)));
    expect(text).toContain(norm(formatDZD(500, locale)));
    expect(text).toContain(norm(formatDZD(8000, locale)));
  });

  it("keeps the em dash for a free delivery", () => {
    const { container } = render(
      <OrderTotals t={t} locale={locale} itemsTotal={9000} deliveryCost={0} totalPrice={9000} discountDzd={0} />,
    );
    expect(container.textContent).toContain("—");
  });
});
