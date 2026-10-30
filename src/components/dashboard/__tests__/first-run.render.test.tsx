/**
 * @vitest-environment happy-dom
 */
/**
 * F2 first-run dashboard: a brand-new shop (0 orders, 0 products, 0 customers)
 * sees a three-step "Start here" panel instead of empty charts.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FirstRunPanel } from "@/components/dashboard/first-run-panel";
import {
  FIRST_RUN_HREFS,
  resolveFirstRun,
  trialDaysLeft,
} from "@/components/dashboard/first-run-state";
import arJson from "@/lib/i18n/locales/ar.json";
import enJson from "@/lib/i18n/locales/en.json";
import frJson from "@/lib/i18n/locales/fr.json";
import { useLicenseStore, type LicenseClientProjection } from "@/stores/license-store";
import { render } from "@/test-utils/render";

type TestLocale = "ar" | "fr" | "en";
const harness = vi.hoisted(() => ({ locale: "en" as "ar" | "fr" | "en" }));
const CATALOGS: Record<TestLocale, Record<string, string>> = {
  ar: arJson as Record<string, string>,
  fr: frJson as Record<string, string>,
  en: enJson as Record<string, string>,
};
function interpolate(raw: string, params?: Record<string, string | number>) {
  return raw.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => String(params?.[key] ?? ""));
}
vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string | number>) =>
      interpolate(CATALOGS[harness.locale][key] ?? key, params),
    locale: harness.locale,
    dir: harness.locale === "ar" ? "rtl" : "ltr",
  }),
}));

const NOW = Date.parse("2026-10-30T12:00:00Z");
const DAY = 86_400_000;
const ZERO = { orders: 0, products: 0, customers: 0 };

function trial(over: Partial<LicenseClientProjection> = {}): LicenseClientProjection {
  return {
    status: "valid",
    message: "",
    onlineTrialAvailable: false,
    licenseId: "lic-1",
    type: "trial",
    expiresAt: new Date(NOW + 5 * DAY).toISOString(),
    supportEndsAt: null,
    shopSlots: 1,
    memberLimit: 1,
    deviceLimit: 1,
    features: [],
    minimumPermanentRecoveryEpoch: null,
    ...over,
  };
}

describe("resolveFirstRun (pure)", () => {
  it("shows only when orders, products and customers are all exactly 0", () => {
    expect(resolveFirstRun(ZERO).show).toBe(true);
  });

  it.each([
    ["orders", { orders: 1, products: 0, customers: 0 }],
    ["products", { orders: 0, products: 3, customers: 0 }],
    ["customers", { orders: 0, products: 0, customers: 2 }],
  ])("hides when %s > 0", (_n, counts) => {
    expect(resolveFirstRun(counts).show).toBe(false);
  });

  it.each([
    ["orders", { orders: null, products: 0, customers: 0 }],
    ["products", { orders: 0, products: null, customers: 0 }],
    ["customers", { orders: 0, products: 0, customers: null }],
  ])("hides when %s is unknown (no authority to read it)", (_n, counts) => {
    expect(resolveFirstRun(counts).show).toBe(false);
  });

  it("lists the three steps in order, all open at zero", () => {
    const r = resolveFirstRun(ZERO);
    expect(r.steps.map((s) => s.id)).toEqual(["product", "order", "delivery"]);
    expect(r.steps.map((s) => s.done)).toEqual([false, false, false]);
    expect(r.doneCount).toBe(0);
    expect(r.total).toBe(3);
  });

  it("derives ticks from the real counts and the delivery flag", () => {
    const r = resolveFirstRun({ orders: 4, products: 2, customers: 0 }, { deliveryPricesSet: true });
    expect(r.steps.map((s) => s.done)).toEqual([true, true, true]);
    expect(r.doneCount).toBe(3);
    expect(resolveFirstRun(ZERO, { deliveryPricesSet: true }).doneCount).toBe(1);
    expect(resolveFirstRun({ orders: 0, products: 5, customers: 0 }).steps[0].done).toBe(true);
  });

  it("points every step at a real existing route", () => {
    expect(FIRST_RUN_HREFS).toEqual({
      product: "/products?create=1",
      whatsapp: "/inbox",
      order: "/orders?create=1",
      delivery: "/settings?group=delivery",
    });
  });
});

describe("trialDaysLeft (pure)", () => {
  it.each([
    ["5 days out", trial(), 5],
    ["rounds a part day up", trial({ expiresAt: new Date(NOW + 4.2 * DAY).toISOString() }), 5],
    ["last hours count as 1", trial({ expiresAt: new Date(NOW + 3_600_000).toISOString() }), 1],
    ["expired", trial({ expiresAt: new Date(NOW - 1000).toISOString() }), null],
    ["permanent licence", trial({ type: "permanent" }), null],
    ["licence not valid", trial({ status: "expired" }), null],
    ["no expiry date", trial({ expiresAt: null }), null],
    ["garbled expiry", trial({ expiresAt: "soon" }), null],
  ])("%s", (_n, projection, expected) => {
    expect(trialDaysLeft(projection, NOW)).toBe(expected);
  });

  it("is null when the licence info is not on the client yet", () => {
    expect(trialDaysLeft(null, NOW)).toBeNull();
  });
});

describe.each(["en", "ar"] as const)("FirstRunPanel in %s", (locale) => {
  const cat = CATALOGS[locale];
  beforeEach(() => {
    harness.locale = locale;
  });
  afterEach(() => {
    useLicenseStore.setState({ projection: null });
  });

  it("counts 0 -> shows the panel with the Start here heading and three steps", () => {
    render(<FirstRunPanel counts={ZERO} now={NOW} />);
    const panel = screen.getByTestId("dashboard-first-run");
    expect(within(panel).getByRole("heading", { name: cat["dashboard.firstRun.title"] })).toBeInTheDocument();
    const steps = within(panel).getAllByRole("listitem");
    expect(steps).toHaveLength(3);
    expect(steps.map((s) => s.getAttribute("data-step"))).toEqual(["product", "order", "delivery"]);
    expect(steps.every((s) => s.getAttribute("data-done") === "false")).toBe(true);
  });

  it("links each step to the real page", () => {
    render(<FirstRunPanel counts={ZERO} now={NOW} />);
    const hrefOf = (name: string) =>
      screen.getByRole("link", { name }).getAttribute("href");
    expect(hrefOf(cat["dashboard.firstRun.product.cta"])).toBe("/products?create=1");
    expect(hrefOf(cat["dashboard.firstRun.order.whatsappCta"])).toBe("/inbox");
    expect(hrefOf(cat["dashboard.firstRun.order.manualCta"])).toBe("/orders?create=1");
    expect(hrefOf(cat["dashboard.firstRun.delivery.cta"])).toBe("/settings?group=delivery");
  });

  it.each([
    ["orders", { orders: 1, products: 0, customers: 0 }],
    ["products", { orders: 0, products: 1, customers: 0 }],
    ["customers", { orders: 0, products: 0, customers: 1 }],
  ])("counts > 0 (%s) -> the panel is hidden", (_n, counts) => {
    render(<FirstRunPanel counts={counts} now={NOW} />);
    expect(screen.queryByTestId("dashboard-first-run")).toBeNull();
  });

  it("ticks a step from the delivery flag and says how many are done", () => {
    render(<FirstRunPanel counts={ZERO} deliveryPricesSet now={NOW} />);
    const steps = screen.getAllByRole("listitem");
    expect(steps[2]).toHaveAttribute("data-done", "true");
    expect(within(steps[2]).getByText(cat["dashboard.firstRun.done"])).toBeInTheDocument();
    expect(within(steps[0]).getByText(cat["dashboard.firstRun.todo"])).toBeInTheDocument();
    expect(screen.getByTestId("dashboard-first-run")).toHaveTextContent(
      interpolate(cat["dashboard.firstRun.progress"], { done: 1, total: 3 }),
    );
  });

  it("shows a calm trial line from the client licence info, and nothing without it", () => {
    const { rerender } = render(<FirstRunPanel counts={ZERO} now={NOW} />);
    expect(screen.queryByTestId("dashboard-first-run-trial")).toBeNull();
    useLicenseStore.setState({ projection: trial() });
    rerender(<FirstRunPanel counts={ZERO} now={NOW} />);
    expect(screen.getByTestId("dashboard-first-run-trial")).toHaveTextContent(
      interpolate(cat["dashboard.firstRun.trial"], { days: 5 }),
    );
    useLicenseStore.setState({ projection: trial({ type: "permanent" }) });
    rerender(<FirstRunPanel counts={ZERO} now={NOW} />);
    expect(screen.queryByTestId("dashboard-first-run-trial")).toBeNull();
  });

  it("uses logical classes only", () => {
    const { container } = render(<FirstRunPanel counts={ZERO} now={NOW} />);
    const classes = Array.from(container.querySelectorAll("[class]")).flatMap((n) =>
      (n.getAttribute("class") ?? "").split(/\s+/),
    );
    expect(
      classes.filter((c) => /^(ml|mr|pl|pr|left|right|text-left|text-right)(-|$)/.test(c.replace(/^[a-z-]+:/, ""))),
    ).toEqual([]);
  });
});

describe("first-run copy exists in all three locales", () => {
  const KEYS = [
    "dashboard.firstRun.title",
    "dashboard.firstRun.subtitle",
    "dashboard.firstRun.progress",
    "dashboard.firstRun.done",
    "dashboard.firstRun.todo",
    "dashboard.firstRun.trial",
    "dashboard.firstRun.product.title",
    "dashboard.firstRun.product.hint",
    "dashboard.firstRun.product.cta",
    "dashboard.firstRun.order.title",
    "dashboard.firstRun.order.hint",
    "dashboard.firstRun.order.whatsappCta",
    "dashboard.firstRun.order.manualCta",
    "dashboard.firstRun.delivery.title",
    "dashboard.firstRun.delivery.hint",
    "dashboard.firstRun.delivery.cta",
  ];
  it.each(KEYS)("%s", (key) => {
    for (const l of ["ar", "fr", "en"] as const) expect(CATALOGS[l][key], `${l} ${key}`).toBeTruthy();
    expect(CATALOGS.ar[key]).toMatch(/[\u0600-\u06FF]/);
    const params = (l: TestLocale) => (CATALOGS[l][key].match(/\{\{(\w+)\}\}/g) ?? []).sort();
    expect(params("ar")).toEqual(params("en"));
    expect(params("fr")).toEqual(params("en"));
  });
});

describe("dashboard page wiring", () => {
  const page = readFileSync(resolve(process.cwd(), "src/app/(dashboard)/dashboard/page.tsx"), "utf8");

  it("reads the three counts, decides first-run, and returns the panel before the charts", () => {
    expect(page).toContain("getFirstRunCounts(");
    expect(page).toContain("resolveFirstRun(");
    expect(page).toContain("<FirstRunPanel");
    expect(page.indexOf("resolveFirstRun(")).toBeLessThan(page.indexOf("data-dashboard-operational-grid"));
    expect(page.indexOf("<FirstRunPanel")).toBeLessThan(page.indexOf("<StatCard"));
  });
});
