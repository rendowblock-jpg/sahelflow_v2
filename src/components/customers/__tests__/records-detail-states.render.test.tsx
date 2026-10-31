/**
 * @vitest-environment happy-dom
 */
/** Customer and product pages: page-shaped skeletons, the offline banners and the list strip, in ar and en. */
import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ar from "@/lib/i18n/locales/ar.json";
import en from "@/lib/i18n/locales/en.json";
import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";
import { render } from "@/test-utils/render";
import { CustomerDetailSkeleton } from "@/components/customers/customer-detail-skeleton";
import { RecordsListStatusBanner, RecordsOfflineBanner } from "@/components/customers/records-status-banner";
import { ProductDetailSkeleton } from "@/components/products/product-detail-skeleton";

let online = true;
let locale: "ar" | "en" = "en";
vi.mock("@/hooks/use-online-status", () => ({ useOnlineStatus: () => online }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({
    t: (key: string) => {
      const table = (locale === "ar" ? ar : en) as Record<string, string>;
      return table[key] ?? getRuntimeTranslation(locale, key) ?? key;
    },
    locale,
    dir: locale === "ar" ? "rtl" : "ltr",
  }),
}));
beforeEach(() => {
  online = true;
  locale = "en";
});

const sections = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("[data-skeleton-section]")).map((el) => el.getAttribute("data-skeleton-section"));

describe("loading skeletons", () => {
  it("customer: header, stats, delivery, notes, orders", () => {
    const { container } = render(<CustomerDetailSkeleton />);
    expect(sections(container)).toEqual(["header", "stats", "delivery", "notes", "orders"]);
    expect(screen.getByTestId("customer-detail-skeleton")).toBeTruthy();
  });
  it("product: header, stats, stock, orders", () => {
    const { container } = render(<ProductDetailSkeleton />);
    expect(sections(container)).toEqual(["header", "stats", "stock", "orders"]);
  });
});

describe("RecordsOfflineBanner", () => {
  it("online: nothing", () => {
    render(<RecordsOfflineBanner kind="customer" />);
    expect(screen.queryByTestId("detail-offline-banner")).toBeNull();
  });
  it("offline customer (en) and product (ar) say what is paused", () => {
    online = false;
    const first = render(<RecordsOfflineBanner kind="customer" />);
    expect(screen.getByTestId("detail-offline-banner").textContent).toContain("Blocking and unblocking the customer");
    first.unmount();
    locale = "ar";
    render(<RecordsOfflineBanner kind="product" />);
    expect(screen.getByTestId("detail-offline-banner").textContent).toContain("تعديل المنتج");
  });
});

describe("RecordsListStatusBanner", () => {
  const rows = [{ id: "c1" }];
  it("offline: the list sentence, whatever the rows", () => {
    online = false;
    render(<RecordsListStatusBanner error={null} rows={rows} onRefresh={() => undefined} />);
    expect(screen.getByTestId("list-offline-banner").textContent).toContain("Adding, editing and deleting are paused");
  });
  it("online, refresh failed with rows on screen: partial strip with a working retry", () => {
    const onRefresh = vi.fn();
    render(<RecordsListStatusBanner error={new Error("boom")} rows={rows} onRefresh={onRefresh} />);
    fireEvent.click(within(screen.getByTestId("list-partial-banner")).getByRole("button"));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
  it("online, failed with no rows, or fine: nothing (the table owns those states)", () => {
    const a = render(<RecordsListStatusBanner error={new Error("boom")} rows={undefined} onRefresh={() => undefined} />);
    expect(a.container.textContent).toBe("");
    a.unmount();
    const b = render(<RecordsListStatusBanner error={null} rows={rows} onRefresh={() => undefined} />);
    expect(b.container.textContent).toBe("");
  });
});
