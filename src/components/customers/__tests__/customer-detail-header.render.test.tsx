/**
 * @vitest-environment happy-dom
 */
/** customers/[id] header: populated, restricted and offline, in ar and en; the WhatsApp link to the customer stays. */
import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ar from "@/lib/i18n/locales/ar.json";
import en from "@/lib/i18n/locales/en.json";
import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";
import { render } from "@/test-utils/render";
import { CustomerDetailHeader, type CustomerDetailHeaderProps } from "@/components/customers/customer-detail-header";

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

const customer: CustomerDetailHeaderProps = {
  label: "محمد بن عيسى",
  name: "محمد بن عيسى",
  phone: "+213 555 12 34 56",
  phone2: "+213 661 98 76 54",
  placeLabel: "الجزائر · باب الزوار",
  sinceLabel: "عميل منذ 12 يناير 2026",
  askAi: { href: "/ai?q=%D9%85%D8%AD%D9%85%D8%AF", label: "اسأل الذكاء الاصطناعي" },
  risk: { variant: "outline", label: "خطر متوسط", score: 5 },
  blacklist: { customerId: "cus_1", isBlacklisted: false },
};

describe("CustomerDetailHeader", () => {
  it("populated (ar): name, both phones as LTR runs, place, since, risk badge, working links", () => {
    locale = "ar";
    render(<CustomerDetailHeader {...customer} />);
    expect(screen.getByRole("heading", { name: "محمد بن عيسى" })).toBeTruthy();
    expect(screen.getByText("+213 555 12 34 56").getAttribute("dir")).toBe("ltr");
    expect(screen.getByText("+213 661 98 76 54").getAttribute("dir")).toBe("ltr");
    expect(screen.getByText("الجزائر · باب الزوار")).toBeTruthy();
    expect(screen.getByText("عميل منذ 12 يناير 2026")).toBeTruthy();
    expect(screen.getByText(/خطر متوسط · 5/)).toBeTruthy();
    expect(screen.getByTestId("customer-header-ask-ai").getAttribute("href")).toBe(customer.askAi?.href);
    expect(screen.getByTestId("customer-header-whatsapp").getAttribute("href")).toContain("213555123456");
  });

  it("online (en): the block button is on", () => {
    render(<CustomerDetailHeader {...customer} />);
    const block = screen.getByRole("button", { name: en["risk.blacklist.add"] });
    expect(block).toBeEnabled();
  });

  it("offline (en): blocking is off with the reason; the WhatsApp and Ask AI links keep working", () => {
    online = false;
    const { container } = render(<CustomerDetailHeader {...customer} />);
    const block = screen.getByRole("button", { name: en["risk.blacklist.add"] });
    expect(block).toBeDisabled();
    expect(container.querySelector("fieldset")?.getAttribute("title")).toBe("You are offline");
    expect(screen.getByTestId("customer-header-whatsapp").getAttribute("href")).toContain("213555123456");
    expect(screen.getByTestId("customer-header-ask-ai").getAttribute("href")).toBe(customer.askAi?.href);
  });

  it("offline (ar): the reason is said in Arabic", () => {
    online = false;
    locale = "ar";
    const { container } = render(<CustomerDetailHeader {...customer} />);
    expect(container.querySelector("fieldset")?.getAttribute("title")).toBe("أنت غير متصل بالإنترنت");
  });

  it("blocked customer offline: unblocking is off too", () => {
    online = false;
    render(<CustomerDetailHeader {...customer} blacklist={{ customerId: "cus_1", isBlacklisted: true }} />);
    expect(screen.getByRole("button", { name: en["risk.blacklist.remove"] })).toBeDisabled();
  });

  it("restricted contact: no phone, no WhatsApp, no risk, no block control, no Ask AI", () => {
    render(
      <CustomerDetailHeader
        label="Restricted contact"
        name={null}
        phone={null}
        phone2={null}
        placeLabel={null}
        sinceLabel="Customer since 12 Jan 2026"
        askAi={null}
        risk={null}
        blacklist={null}
      />,
    );
    expect(screen.queryByTestId("customer-header-whatsapp")).toBeNull();
    expect(screen.queryByTestId("customer-header-ask-ai")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Customer since 12 Jan 2026")).toBeTruthy();
  });
});
