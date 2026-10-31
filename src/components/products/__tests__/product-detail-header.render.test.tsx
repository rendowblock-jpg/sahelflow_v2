/**
 * @vitest-environment happy-dom
 */
/** products/[id] header: populated, low stock, no permission and offline, in ar and en. */
import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ar from "@/lib/i18n/locales/ar.json";
import en from "@/lib/i18n/locales/en.json";
import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";
import { render } from "@/test-utils/render";
import { ProductDetailHeader } from "@/components/products/product-detail-header";

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

const description = "SKU: TS-0042 · ملابس · 12 يناير 2026";
const edit = <button type="button">Edit product</button>;

describe("ProductDetailHeader", () => {
  it("populated (ar): name, SKU line, edit on", () => {
    locale = "ar";
    render(<ProductDetailHeader name="قميص قطني أبيض" description={description} lowStockLabel={null} actions={edit} />);
    expect(screen.getByRole("heading", { name: "قميص قطني أبيض" })).toBeTruthy();
    expect(screen.getByText(description)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Edit product" })).toBeEnabled();
  });

  it("low stock keeps its badge", () => {
    render(<ProductDetailHeader name="Cotton shirt" description={description} lowStockLabel="Low stock" actions={edit} />);
    expect(screen.getByText("Low stock")).toBeTruthy();
  });

  it("offline (en): edit is off with the reason; the low-stock reading stays", () => {
    online = false;
    const { container } = render(
      <ProductDetailHeader name="Cotton shirt" description={description} lowStockLabel="Low stock" actions={edit} />,
    );
    expect(screen.getByRole("button", { name: "Edit product" })).toBeDisabled();
    expect(container.querySelector("fieldset")?.getAttribute("title")).toBe("You are offline");
    expect(screen.getByText("Low stock")).toBeTruthy();
  });

  it("offline (ar): the reason is Arabic", () => {
    online = false;
    locale = "ar";
    const { container } = render(<ProductDetailHeader name="قميص" description={description} lowStockLabel={null} actions={edit} />);
    expect(container.querySelector("fieldset")?.getAttribute("title")).toBe("أنت غير متصل بالإنترنت");
  });

  it("no permission and stock fine: no action area at all", () => {
    const { container } = render(<ProductDetailHeader name="Cotton shirt" description={description} lowStockLabel={null} actions={null} />);
    expect(container.querySelector("fieldset")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
