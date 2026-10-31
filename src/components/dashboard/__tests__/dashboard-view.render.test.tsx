/**
 * @vitest-environment happy-dom
 */
/**
 * DashboardView mounted with already-loaded data (no database), in the states
 * a seller meets: populated (en + ar), empty (new shop, no orders), partial
 * (financial figures withheld from this member), plus the route's loading and
 * error screens. Fixtures follow the real projection: withheld figures are null.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DashboardView, type DashboardViewProps } from "@/components/dashboard/dashboard-view";
import { TooltipProvider } from "@/components/ui/tooltip";
import DashboardLoading from "@/app/(dashboard)/dashboard/loading";
import DashboardError from "@/app/(dashboard)/dashboard/error";
import { getTranslations, type Locale } from "@/lib/i18n";
import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/dashboard",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/hooks/use-i18n", async () => {
  const { getTranslations: gt } = await import("@/lib/i18n");
  const { getRuntimeTranslation: rt } = await import("@/lib/i18n/runtime-translations");
  return {
    useI18n: () => ({
      locale: "en",
      t: (key: string) => gt("en")[key] ?? rt("en", key) ?? key,
    }),
  };
});

afterEach(cleanup);

function makeT(locale: Locale) {
  const catalog = getTranslations(locale);
  return (key: string, params?: Record<string, string | number>) => {
    let text = catalog[key] ?? getRuntimeTranslation(locale, key) ?? key;
    for (const [name, value] of Object.entries(params ?? {})) text = text.replaceAll(`{{${name}}}`, String(value));
    return text;
  };
}

// Every permission flag / count the view reads answers the same way.
const flags = <T,>(value: T) => new Proxy({}, { get: () => value }) as never;

const orders = [
  { id: "o1", orderNumber: "SF-1042", customerName: "Yacine Benali", status: "confirmed", itemCount: 2, wilaya: "16", totalPrice: 5400, total: 5400, createdAt: "2026-10-31T08:10:00.000Z" },
  { id: "o2", orderNumber: "SF-1041", customerName: "Samira Haddad", status: "delivered", itemCount: 1, wilaya: "31", totalPrice: 3200, total: 3200, createdAt: "2026-10-31T07:40:00.000Z" },
];
const day = (date: string, revenue: number | null, n: number) => ({ date, label: date, revenue, orders: n });
const base = {
  stats: {
    ordersToday: 12, revenueToday: 184000, realizedRevenueToday: 130500, newCustomers: 4,
    pendingDeliveries: 6, activeConversations: 3, lowStockProducts: 2, ordersTrend: 8, revenueTrend: -3,
  },
  recentOrders: orders,
  analytics: {
    revenueSeries: [day("2026-10-29", 52000, 9), day("2026-10-30", 61000, 11), day("2026-10-31", 71000, 12)],
    customerGrowth: [{ date: "2026-10-30", label: "2026-10-30", newCustomers: 2, cumulative: 120 }, { date: "2026-10-31", label: "2026-10-31", newCustomers: 4, cumulative: 124 }],
    deliveryPerformance: { deliveryRate: 71, delivered: 29, inTransit: 6, pending: 4, returned: 2, byProvider: [] },
  },
  fieldAccess: flags(true),
  firstRunCounts: flags(40),
  riskReport: null,
  staleConfirmations: 3,
};

function mount(locale: Locale, over: Record<string, unknown> = {}) {
  const props = { t: makeT(locale), locale, ...base, ...over } as unknown as DashboardViewProps;
  return render(<TooltipProvider><DashboardView {...props} /></TooltipProvider>);
}
const clean = (text: string) => {
  expect(text).not.toMatch(/NaN|undefined|\[object|null/);
};

describe("DashboardView states", () => {
  it("populated (en): the sub-line says Delivered today, money is DZD, orders are listed", () => {
    const { container } = mount("en");
    const text = container.textContent ?? "";
    // The shop catalog (JSON) wins over the runtime file, so compare with what the catalog resolves.
    const label = makeT("en")("dashboard.deliveredToday");
    expect(label).toMatch(/^delivered today$/i);
    expect(text).toContain(`${label}: `);
    expect(text).toMatch(/184[\s\u00a0\u202f,.]?000/);
    expect(text).toContain("SF-1042");
    expect(text).toContain("Yacine Benali");
    clean(text);
  });

  it("populated (ar): Arabic labels, the same figures, orders listed", () => {
    const { container } = mount("ar");
    const text = container.textContent ?? "";
    const label = makeT("ar")("dashboard.deliveredToday");
    expect(label).not.toBe("dashboard.deliveredToday");
    expect(text).toContain(label);
    expect(text).toContain("SF-1042");
    expect(text).not.toMatch(/delivered today/i);
    clean(text);
  });

  it("empty (new shop): no order rows, no broken numbers", () => {
    const { container } = mount("en", {
      recentOrders: [],
      stats: { ...base.stats, ordersToday: 0, revenueToday: 0, realizedRevenueToday: 0, newCustomers: 0, pendingDeliveries: 0, ordersTrend: 0, revenueTrend: 0 },
      analytics: { revenueSeries: [], customerGrowth: [], deliveryPerformance: { deliveryRate: 0, delivered: 0, inTransit: 0, pending: 0, returned: 0, byProvider: [] } },
    });
    expect(container.querySelectorAll("[data-order-number]")).toHaveLength(0);
    clean(container.textContent ?? "");
  });

  it("partial (money withheld from this member): no revenue figure leaks, no NaN", () => {
    const { container } = mount("en", {
      fieldAccess: flags(false),
      recentOrders: [],
      stats: { ...base.stats, revenueToday: null, realizedRevenueToday: null, revenueTrend: null, ordersToday: null, ordersTrend: null, newCustomers: null, pendingDeliveries: null, activeConversations: null, lowStockProducts: null },
      analytics: { revenueSeries: [day("2026-10-31", null, 0)], customerGrowth: [], deliveryPerformance: { deliveryRate: 0, delivered: 0, inTransit: 0, pending: 0, returned: 0, byProvider: [] } },
    });
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/184[\s\u00a0\u202f,.]?000/);
    expect(text).not.toContain("130");
    clean(text);
  });
});

describe("dashboard route screens", () => {
  it("loading: one busy region and no figures", () => {
    const { container } = render(<DashboardLoading />);
    expect(container.querySelector("[aria-busy='true']")).toBeTruthy();
    expect(container.textContent ?? "").toBe("");
  });

  it("error: offers Try again and calls reset", () => {
    const reset = vi.fn();
    render(<DashboardError error={new Error("boom: Prisma Socket timeout")} reset={reset} />);
    expect(document.body.textContent ?? "").not.toContain("Prisma");
    fireEvent.click(screen.getAllByRole("button")[0]!);
    expect(reset).toHaveBeenCalledTimes(1);
  });
});

describe("money names: the headline card is Orders value, never plain Revenue", () => {
  const NAME = { en: "Orders value today", fr: "Valeur des commandes aujourd'hui", ar: "قيمة طلبات اليوم" } as const;
  const OLD = { en: /Revenue today/, fr: /Revenu du jour/, ar: /إيرادات اليوم/ } as const;
  for (const locale of ["en", "fr", "ar"] as const) {
    it(`${locale}: the card carries the orders-value name and not the old revenue word`, () => {
      const text = mount(locale).container.textContent ?? "";
      expect(text).toContain(NAME[locale]);
      expect(text).not.toMatch(OLD[locale]);
    });
  }
  it("en: the tooltip names both figures and does not call the booked one Revenue", () => {
    const tip = makeT("en")("dashboard.revenueDefinition");
    expect(tip).toContain("Orders value");
    expect(tip).toContain("Delivered today");
    expect(tip).not.toMatch(/Revenue today/);
  });
});
