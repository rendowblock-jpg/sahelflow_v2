/**
 * @vitest-environment happy-dom
 */
/**
 * Dashboard composition, item 1 (5 Nov 2026): ONE thing leads the page.
 * Measured and seen before this change (real dashboard, fr dark and light): four equal stat cards first, then the
 * alerts as four equal rows; the 821 confirmations that wait are as quiet as the 53 low-stock products.
 *
 * The rule pinned here:
 *   - the lead item (late confirmations) is shown large, once, with ONE primary action, when its count is above zero;
 *   - the other counts stay as quiet rows next to it;
 *   - without a lead the old row list is unchanged, and when nothing waits the "all caught up" line stays;
 *   - on the dashboard the attention block comes BEFORE the stat cards (the work ranks above the analytics).
 */
import { cleanup, render, screen } from "@testing-library/react";
import { AlertTriangle, MessageSquare, Package, Truck } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AttentionCenter, type AttentionItem } from "@/components/dashboard/attention-center";
import { DashboardView, type DashboardViewProps } from "@/components/dashboard/dashboard-view";
import { TooltipProvider } from "@/components/ui/tooltip";
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

const items = (stale: number): AttentionItem[] => [
  { id: "confirmation-stale", label: "Confirmations waiting over 2 h", value: stale, href: "/orders/confirmation-queue", icon: AlertTriangle, tone: "danger" },
  { id: "delivery-pending", label: "Deliveries pending", value: 203, href: "/deliveries?status=pending", icon: Truck, tone: "warning" },
  { id: "active-conversations", label: "Active Chats", value: 111, href: "/inbox", icon: MessageSquare, tone: "neutral" },
  { id: "low-stock", label: "Products low on stock", value: 53, href: "/products?stock=low", icon: Package, tone: "warning" },
];

const lead = { leadId: "confirmation-stale", leadActionLabel: "Confirmation Queue", eyebrow: "Needs attention now" };

describe("AttentionCenter: the lead", () => {
  it("shows the late confirmations large, once, with one primary action to the queue", () => {
    const { container } = render(
      <AttentionCenter title="Alerts" items={items(821)} allClearLabel="All caught up!" {...lead} />,
    );
    const hero = container.querySelector("[data-attention-lead]");
    expect(hero, "a lead block").toBeTruthy();
    expect(hero?.textContent).toContain("821");
    expect(hero?.textContent).toContain("Confirmations waiting over 2 h");
    expect(hero?.textContent).toContain("Needs attention now");
    const action = hero?.querySelector("a[href='/orders/confirmation-queue']");
    expect(action, "the one action").toBeTruthy();
    expect(action?.textContent).toContain("Confirmation Queue");
    // The lead is not repeated as a quiet row.
    expect(container.querySelectorAll("a[href='/orders/confirmation-queue']")).toHaveLength(1);
  });

  it("keeps the other three counts as quiet rows, each a link with its count", () => {
    const { container } = render(
      <AttentionCenter title="Alerts" items={items(821)} allClearLabel="All caught up!" {...lead} />,
    );
    const rows = [...container.querySelectorAll("[data-attention-row]")];
    expect(rows.map((row) => row.getAttribute("href"))).toEqual(["/deliveries?status=pending", "/inbox", "/products?stock=low"]);
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("203"),
      expect.stringContaining("111"),
      expect.stringContaining("53"),
    ]);
  });

  it("the lead figure is the biggest text of the block (hierarchy by size, not only by colour)", () => {
    const { container } = render(
      <AttentionCenter title="Alerts" items={items(821)} allClearLabel="All caught up!" {...lead} />,
    );
    const figure = container.querySelector("[data-attention-lead-figure]");
    expect(figure?.textContent).toBe("821");
    expect(figure?.className).toMatch(/\btext-(4xl|5xl)\b/);
    expect(figure?.className).toContain("tabular-nums");
    // The arrow mirrors in right-to-left.
    expect(container.querySelector("[data-attention-lead] a svg")?.getAttribute("class")).toContain("rtl:rotate-180");
  });

  it("a lead with nothing else waiting is one block, no empty column", () => {
    const only = items(5).map((item) => (item.id === "confirmation-stale" ? item : { ...item, value: 0 }));
    const { container } = render(<AttentionCenter title="Alerts" items={only} allClearLabel="All caught up!" {...lead} />);
    expect(container.querySelector("[data-attention-lead]")).toBeTruthy();
    expect(container.querySelectorAll("[data-attention-row]")).toHaveLength(0);
  });
});

describe("AttentionCenter: without a lead", () => {
  it("lead count 0: no lead block, the other counts are the old list", () => {
    const { container } = render(
      <AttentionCenter title="Alerts" items={items(0)} allClearLabel="All caught up!" {...lead} />,
    );
    expect(container.querySelector("[data-attention-lead]")).toBeNull();
    expect(container.textContent).toContain("203");
    expect(container.textContent).toContain("111");
    expect(container.textContent).not.toContain("Confirmations waiting over 2 h");
  });

  it("no leadId given: the previous layout, nothing else changes", () => {
    const { container } = render(<AttentionCenter title="Alerts" items={items(821)} allClearLabel="All caught up!" />);
    expect(container.querySelector("[data-attention-lead]")).toBeNull();
    expect(container.textContent).toContain("821");
    expect(screen.getByText("Alerts")).toBeTruthy();
  });

  it("everything at zero: the all-caught-up line", () => {
    const zero = items(0).map((item) => ({ ...item, value: 0 }));
    const { container } = render(<AttentionCenter title="Alerts" items={zero} allClearLabel="All caught up!" {...lead} />);
    expect(container.textContent).toContain("All caught up!");
    expect(container.querySelector("[data-attention-lead]")).toBeNull();
  });
});

// A permission-free fixture, the same shape the dashboard render test uses.
const flags = <T,>(value: T) => new Proxy({}, { get: () => value }) as never;
function makeT(locale: Locale) {
  const catalog = getTranslations(locale);
  return (key: string, params?: Record<string, string | number>) => {
    let text = catalog[key] ?? getRuntimeTranslation(locale, key) ?? key;
    for (const [name, value] of Object.entries(params ?? {})) text = text.replaceAll(`{{${name}}}`, String(value));
    return text;
  };
}
const day = (date: string, revenue: number | null, n: number) => ({ date, label: date, revenue, orders: n });
const base = {
  stats: {
    ordersToday: 12, revenueToday: 184000, realizedRevenueToday: 130500, newCustomers: 4,
    pendingDeliveries: 6, activeConversations: 3, lowStockProducts: 2, ordersTrend: 8, revenueTrend: -3,
  },
  recentOrders: [],
  analytics: {
    revenueSeries: [day("2026-10-30", 61000, 11), day("2026-10-31", 71000, 12)],
    customerGrowth: [{ date: "2026-10-30", label: "2026-10-30", newCustomers: 2, cumulative: 120 }, { date: "2026-10-31", label: "2026-10-31", newCustomers: 4, cumulative: 124 }],
    deliveryPerformance: { deliveryRate: 71, delivered: 29, inTransit: 6, pending: 4, returned: 2, byProvider: [] },
  },
  fieldAccess: flags(true),
  firstRunCounts: flags(40),
  riskReport: null,
  staleConfirmations: 821,
};
function mount(locale: Locale, over: Record<string, unknown> = {}) {
  const props = { t: makeT(locale), locale, ...base, ...over } as unknown as DashboardViewProps;
  return render(<TooltipProvider><DashboardView {...props} /></TooltipProvider>);
}

describe("DashboardView: the work ranks above the analytics", () => {
  it("the attention block comes before the stat cards, and the lead is the late confirmations", () => {
    const { container } = mount("en");
    const attention = container.querySelector("[data-attention-center]");
    const cards = container.querySelector(".card-grid-4");
    expect(attention, "attention block").toBeTruthy();
    expect(cards, "stat cards").toBeTruthy();
    expect(attention!.compareDocumentPosition(cards!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.querySelector("[data-attention-lead-figure]")?.textContent).toBe("821");
  });

  it("French and Arabic: the eyebrow is translated, never a raw key", () => {
    for (const locale of ["fr", "ar"] as const) {
      const { container, unmount } = mount(locale);
      const text = container.querySelector("[data-attention-lead]")?.textContent ?? "";
      expect(text, locale).not.toContain("dashboard.attention.eyebrow");
      expect(text.length, locale).toBeGreaterThan(10);
      unmount();
    }
  });

  it("a member who may not read orders sees no lead (no count leaks)", () => {
    const { container } = mount("en", { fieldAccess: new Proxy({}, { get: (_t, key) => key !== "orders" }) as never });
    expect(container.querySelector("[data-attention-lead]")).toBeNull();
  });
});
