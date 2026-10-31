/**
 * @vitest-environment happy-dom
 */
/**
 * customers/[id] and products/[id]: the error state is the kit's PageError with a working Retry and never shows raw
 * server text; masked or missing values never print "undefined" / "null"; a phone number is announced once.
 */
import { fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CustomerError from "@/app/(dashboard)/customers/[id]/error";
import ProductError from "@/app/(dashboard)/products/[id]/error";
import { CustomerDetailHeader, type CustomerDetailHeaderProps } from "@/components/customers/customer-detail-header";
import { ProductDetailHeader } from "@/components/products/product-detail-header";
import { ProductOrderMovementCards } from "@/components/products/product-order-movement-cards";
import en from "@/lib/i18n/locales/en.json";
import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";
import { render } from "@/test-utils/render";

vi.mock("@/hooks/use-online-status", () => ({ useOnlineStatus: () => true }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({
    t: (key: string) => (en as Record<string, string>)[key] ?? getRuntimeTranslation("en", key) ?? key,
    locale: "en",
    dir: "ltr",
  }),
}));

beforeEach(() => {
  // PageError reports to diagnostics on mount; keep the test output clean and offline.
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("{}"))));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const RAW_DEVELOPER_TEXT = [
  "Invalid `prisma.customer.findUnique()` invocation in /srv/app/customers.ts:44",
  "connect ECONNREFUSED 10.0.0.5:5432",
];

describe.each([
  ["customers/[id]", CustomerError],
  ["products/[id]", ProductError],
])("%s error page", (_name, ErrorPage) => {
  it.each(RAW_DEVELOPER_TEXT)("shows the kit error with a Retry that asks again, never the raw text (%s)", (raw) => {
    const reset = vi.fn();
    render(<ErrorPage error={Object.assign(new Error(raw), { digest: "d1" })} reset={reset} />);
    expect(screen.getByTestId("page-error")).toBeTruthy();
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/prisma|ECONNREFUSED|10\.0\.0\.5|customers\.ts|findUnique/i);
    const retry = screen.getAllByRole("button").find((b) => b.textContent !== en["error.reload"]);
    expect(retry).toBeTruthy();
    fireEvent.click(retry as HTMLElement);
    expect(reset).toHaveBeenCalledTimes(1);
  });
});

const populated: CustomerDetailHeaderProps = {
  label: "Karim Bensalem",
  name: "Karim Bensalem",
  phone: "+213 555 12 34 56",
  phone2: null,
  placeLabel: "Alger · Bab Ezzouar",
  sinceLabel: "Customer since 12 Jan 2026",
  askAi: { href: "/ai?q=x", label: "Ask AI" },
  risk: null,
  blacklist: { customerId: "cus_1", isBlacklisted: false },
};

describe("masked and missing values", () => {
  it("a customer with no phone, place or risk prints no undefined / null / NaN", () => {
    const { container } = render(
      <CustomerDetailHeader
        {...populated}
        phone={null}
        phone2={null}
        placeLabel={null}
        risk={null}
        blacklist={null}
        askAi={null}
        name={null}
        label="Restricted contact"
      />,
    );
    expect(container.textContent).not.toMatch(/undefined|null|NaN/);
    expect(container.textContent).toContain("Restricted contact");
  });

  it("a movement whose order number is missing shows a dash, not the word null", () => {
    const { container } = render(
      <ProductOrderMovementCards
        rows={[{ id: "m1", date: "12 Jan", kindLabel: "Sale", quantity: -2, orderId: "ord_1", orderNumber: null }]}
        labels={{ list: "Order movements", quantity: "Qty", order: "Order" }}
      />,
    );
    expect(container.textContent).not.toMatch(/undefined|null|NaN/);
    expect(container.textContent).toContain("—");
    expect(container.querySelector("a")).toBeNull();
  });

  it("a product header with fine stock and no edit rights has no empty action area", () => {
    const { container } = render(
      <ProductDetailHeader name="Robe" description="SKU R-1" lowStockLabel={null} actions={null} />,
    );
    expect(container.textContent).not.toMatch(/undefined|null|NaN/);
    expect(container.querySelector("fieldset")).toBeNull();
  });
});

describe("phone number announced once", () => {
  it("the number is in the page once; no aria-label or title repeats it", () => {
    const { container } = render(<CustomerDetailHeader {...populated} />);
    expect(screen.getAllByText("+213 555 12 34 56")).toHaveLength(1);
    for (const el of Array.from(container.querySelectorAll("[aria-label],[title]"))) {
      const said = `${el.getAttribute("aria-label") ?? ""} ${el.getAttribute("title") ?? ""}`;
      expect(said).not.toMatch(/555|213\s?5/);
    }
    // The only place the digits live outside the visible run is the wa.me link target (a URL, not announced text).
    expect(screen.getByTestId("customer-header-whatsapp").getAttribute("href")).toContain("213555123456");
  });
});
