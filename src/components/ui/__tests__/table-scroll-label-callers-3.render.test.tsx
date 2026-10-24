/**
 * @vitest-environment happy-dom
 */
/**
 * Customer profile order history (PB-A11Y-TABLE-SCROLL-LABELS). The other callers of the shared
 * Table are in table-scroll-label-callers.render.test.tsx and table-scroll-label-callers-2.render.test.tsx.
 * The table must pass the heading it already shows as `scrollLabel`, so the horizontal scroller is a
 * named region and a tab stop (axe scrollable-region-focusable).
 */
import { cleanup, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import CustomerDetailPage from "@/app/(dashboard)/customers/[id]/page";
import { render } from "@/test-utils/render";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  notFound: vi.fn(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
    locale: "en",
    dir: "ltr",
    setLocale: vi.fn(),
    isLocalePending: false,
  }),
}));

vi.mock("@/lib/i18n-server", () => ({
  getI18n: async () => ({ t: (key: string) => key, locale: "en" }),
}));

vi.mock("@/lib/identity/authorization", () => ({
  requireTrustedAction: async () => ({ shop: { shopId: "shop-1" } }),
  // No risk, no AI, no management rights: the order history card still renders.
  trustedActionAllowed: () => false,
}));

vi.mock("@/lib/db", () => ({ db: {}, shopContext: { shopId: "shop-1" } }));

vi.mock("@/lib/customers/customer-detail-workbench", () => ({
  getCustomerDetailWorkbench: async () => ({
    customer: {
      id: "c1",
      name: "Amina",
      phone: "0555123456",
      phone2: null,
      wilaya: "Alger",
      commune: "Bab Ezzouar",
      address: null,
      notes: null,
      createdAt: new Date("2026-09-01T00:00:00Z"),
      isBlacklisted: false,
      blacklistReason: null,
      riskScore: null,
      fieldAccess: { risk: false, contact: true },
    },
    stats: {
      totalSpent: 1000,
      totalOrders: 1,
      deliveryRate: 100,
      avgOrderValue: 1000,
      deliveredCount: 1,
      returnedCount: 0,
      firstOrderDate: new Date("2026-10-01T00:00:00Z"),
    },
    orders: [
      {
        id: "o1",
        orderNumber: "A1",
        status: "delivered",
        totalPrice: 1000,
        createdAt: new Date("2026-10-01T00:00:00Z"),
      },
    ],
    canReadOrders: true,
    canReadOrderFinancials: true,
  }),
}));

// Pieces that fetch, journal or draw on their own are not under test.
vi.mock("@/components/shared/recent-record-tracker", () => ({ RecentRecordTracker: () => null }));
vi.mock("@/components/customers/blacklist-toggle", () => ({ BlacklistToggle: () => null }));
vi.mock("@/components/customers/customer-risk-card", () => ({ CustomerRiskCard: () => null }));
vi.mock("@/components/orders/order-whatsapp-button", () => ({ OrderWhatsAppButton: () => null }));

afterEach(() => cleanup());

describe("customer profile names its order history scroll region", () => {
  it("passes the card heading as the accessible name of the table scroller", async () => {
    const ui = (await CustomerDetailPage({ params: Promise.resolve({ id: "c1" }) })) as ReactElement;
    render(ui);
    expect(screen.getAllByText("customers.orderHistory").length).toBeGreaterThan(0);
    const scrollers = Array.from(
      document.querySelectorAll<HTMLElement>('[data-slot="table-container"]'),
    );
    expect(scrollers).toHaveLength(1);
    const scroller = scrollers[0];
    expect(scroller?.getAttribute("role")).toBe("region");
    expect(scroller?.getAttribute("tabindex")).toBe("0");
    expect(scroller?.getAttribute("aria-label")).toBe("customers.orderHistory");
  });
});
