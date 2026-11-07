/**
 * @vitest-environment happy-dom
 */
/**
 * Item 2 money (M2a, task 6): the order-level discount of a hosted bundle is shown where the lines and the total are shown
 * together. The delivery slip prints it between the subtotal and the shipping row, only when there is one and only for an actor
 * who may read money. The wire builder gives `null` to anyone else, whatever the server sent.
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DeliverySlip, fetchDeliverySlipData, type DeliverySlipData } from "@/components/orders/delivery-slip";
import { formatDZD } from "@/lib/utils";
import { PAGE_LOCALES, RAW_KEY, makeT } from "./order-page-test-i18n";

const state = vi.hoisted(() => ({ locale: "en" as "en" | "fr" | "ar" }));
vi.mock("@/hooks/use-i18n", async () => {
  const { makeT: translator } = await import("./order-page-test-i18n");
  return {
    useI18n: () => ({ t: translator(state.locale), locale: state.locale, dir: state.locale === "ar" ? "rtl" : "ltr" }),
  };
});

const WORD = { en: "Discount", fr: "Remise", ar: "الخصم" } as const;
/** Collapse every kind of space (the French and Arabic amounts use a narrow no-break space) so text and expectation compare alike. */
const norm = (value: string) => value.replace(/\s+/g, " ");

function slip(over: Partial<DeliverySlipData> = {}): DeliverySlipData {
  return {
    orderNumber: "ORD-2026-0042",
    createdAt: "2026-11-07T09:00:00.000Z",
    customerName: "Amina Benali",
    phone: "0555123456",
    wilaya: "Alger",
    commune: "Bab Ezzouar",
    address: "12 rue des Oliviers",
    items: [{ name: "Robe", variant: null, quantity: 3, unitPrice: 3000, total: 9000 }],
    itemsTotal: 9000,
    deliveryCost: 500,
    total: 8000,
    provider: null,
    trackingNumber: null,
    ...over,
  };
}

afterEach(cleanup);
beforeEach(() => {
  state.locale = "en";
});

describe.each(PAGE_LOCALES)("the delivery slip with an order discount (%s)", (locale) => {
  beforeEach(() => {
    state.locale = locale;
  });
  const text = (data: DeliverySlipData) => {
    const { container } = render(<DeliverySlip data={data} shopName="Boutique" />);
    return norm(container.textContent ?? "");
  };

  it("prints the discount in the language of the page, as a minus amount between the subtotal and the shipping", () => {
    const printed = text(slip({ discountDzd: 1500 }));
    const t = makeT(locale);

    expect(printed).toContain(WORD[locale]);
    expect(printed).toContain(norm(`−${formatDZD(1500, locale)}`));
    expect(printed).not.toMatch(RAW_KEY);
    const shippingLabel = t("orders.detail.shipping");
    const subtotal = printed.indexOf(t("orders.detail.subtotal"));
    const discount = printed.indexOf(WORD[locale]);
    // The word for shipping also sits in the address heading higher up the slip ("عنوان التوصيل"), so look for the row AFTER the discount.
    const shipping = printed.indexOf(shippingLabel, discount);
    expect(subtotal).toBeGreaterThan(-1);
    expect(subtotal).toBeLessThan(discount);
    expect(shipping).toBeGreaterThan(discount);
    expect(printed.slice(subtotal, discount)).not.toContain(shippingLabel);
  });

  it.each([[0], [null], [undefined]])("prints no discount row when the discount is %s", (discountDzd) => {
    const printed = text(slip({ discountDzd }));
    expect(printed).not.toContain(WORD[locale]);
    expect(printed).toContain(norm(formatDZD(8000, locale)));
  });

  it("prints no price row at all, discount included, when the actor may not read money", () => {
    const printed = text(slip({ itemsTotal: null, deliveryCost: null, total: null, discountDzd: null }));
    expect(printed).not.toContain(WORD[locale]);
    expect(printed).not.toContain(norm(formatDZD(8000, locale)));

    // Even if a discount reached the slip by mistake, a slip with no total prints no price row.
    const leaked = text(slip({ itemsTotal: null, deliveryCost: null, total: null, discountDzd: 1500 }));
    expect(leaked).not.toContain(WORD[locale]);
    expect(leaked).not.toContain(norm(formatDZD(1500, locale)));
  });
});

describe("fetchDeliverySlipData and the order discount", () => {
  const wire = (over: Record<string, unknown> = {}) => ({
    order: {
      orderNumber: "ORD-2026-0042",
      createdAt: "2026-11-07T09:00:00.000Z",
      phone: "0555123456",
      address: "12 rue des Oliviers",
      wilaya: "Alger",
      commune: "Bab Ezzouar",
      notes: null,
      totalPrice: 8000,
      deliveryCost: 500,
      discountDzd: 1500,
      items: [{ productName: "Robe", productVariantName: null, quantity: 3, unitPrice: 3000, total: 9000 }],
      fieldAccess: { contact: true, financials: true },
      ...over,
    },
  });
  const serve = (body: unknown) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.endsWith("/courier")
          ? new Response("{}", { status: 404 })
          : new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }),
      ),
    );
  afterEach(() => vi.unstubAllGlobals());

  it("carries the stored discount for an actor who may read money", async () => {
    serve(wire());
    expect(await fetchDeliverySlipData("order-1")).toMatchObject({ itemsTotal: 9000, total: 8000, discountDzd: 1500 });
  });

  it("gives null to an actor who may not, even when the server sent a value", async () => {
    serve(wire({ totalPrice: null, deliveryCost: null, discountDzd: 1500, fieldAccess: { contact: true, financials: false } }));
    const data = await fetchDeliverySlipData("order-1");
    expect(data).toMatchObject({ itemsTotal: null, total: null, discountDzd: null });
  });

  it("gives null when the server sent no discount at all (an older server)", async () => {
    const { discountDzd: _unused, ...withoutDiscount } = wire().order;
    serve({ order: withoutDiscount });
    expect(await fetchDeliverySlipData("order-1")).toMatchObject({ total: 8000, discountDzd: null });
  });
});
