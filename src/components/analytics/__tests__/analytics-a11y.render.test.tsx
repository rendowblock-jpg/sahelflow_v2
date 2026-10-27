/**
 * @vitest-environment happy-dom
 */
/**
 * Analytics keyboard + screen-reader contract (PB-A11Y-ANALYTICS).
 *
 * The 24 Oct browser sweep found two axe failures on /analytics and
 * /analytics/extraction:
 *  - scrollable-region-focusable: a table wrapper that scrolls sideways could
 *    not be reached with the keyboard (WCAG 2.1.1);
 *  - aria-progressbar-name: the delivery-rate bar had no accessible name
 *    (WCAG 4.1.2).
 * happy-dom has no layout, so axe cannot measure "scrolls"; instead every
 * element that carries an overflow auto/scroll class must be a named,
 * focusable region, and every progressbar must be named and carry its value.
 */
import { screen, waitFor } from "@testing-library/react";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import { render } from "@/test-utils/render";

import { OutcomeProgress } from "@/components/charts/decision-visualizations";
import { ScrollRegion } from "@/components/ui/scroll-region";

import { CourierPerformanceSection } from "../courier-performance-section";
import { ExtractionAnalytics } from "../extraction-analytics";

vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({ t: (key: string) => key, locale: "en", dir: "ltr" }),
}));
vi.mock("@/lib/i18n-server", () => ({
  getI18n: async () => ({ t: (key: string) => key, locale: "en", dir: "ltr" }),
}));

const SCROLL_CLASS = /(^|\s)overflow-(?:x-|y-)?(?:auto|scroll)(\s|$)/;

/** Every element that scrolls (overflow auto/scroll class) inside `root`. */
function scrollers(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>("*")).filter((el) =>
    SCROLL_CLASS.test(el.getAttribute("class") ?? ""),
  );
}

/** The accessible name: aria-label, else the text of the aria-labelledby target. */
function accessibleName(el: HTMLElement): string {
  const label = el.getAttribute("aria-label")?.trim();
  if (label) return label;
  const ids = (el.getAttribute("aria-labelledby") ?? "").split(/\s+/).filter(Boolean);
  return ids
    .map((id) => el.ownerDocument.getElementById(id)?.textContent?.trim() ?? "")
    .join(" ")
    .trim();
}

function expectNamedFocusableRegions(
  container: HTMLElement,
  expectedLabels: string[],
) {
  const found = scrollers(container);
  // A guard against passing with nothing to check.
  expect(found.length).toBe(expectedLabels.length);
  for (const el of found) {
    expect(el.tabIndex, `tabIndex of <${el.tagName.toLowerCase()} class="${el.className}">`).toBe(0);
    expect(el.getAttribute("role")).toBe("region");
    expect(accessibleName(el)).not.toBe("");
  }
  expect(found.map(accessibleName)).toEqual(expectedLabels);
}

const providers = [
  {
    provider: "Yalidine",
    shipments: 40,
    delivered: 30,
    returned: 6,
    inTransit: 3,
    failed: 1,
    deliveryRate: 75,
    returnRate: 15,
    avgDeliveryDays: 3.2,
    deliveryDaySamples: 30,
    totalFees: 120000,
  },
  {
    provider: "Zr Express",
    shipments: 10,
    delivered: 6,
    returned: 3,
    inTransit: 1,
    failed: 0,
    deliveryRate: 60,
    returnRate: 30,
    avgDeliveryDays: null,
    deliveryDaySamples: 0,
    totalFees: null,
  },
];

const matrix = {
  wilayas: ["Alger", "Oran"],
  providers: ["Yalidine", "Zr Express"],
  cells: [
    { wilaya: "Alger", provider: "Yalidine", shipments: 20, delivered: 18, successRate: 90 },
    { wilaya: "Oran", provider: "Zr Express", shipments: 5, delivered: 3, successRate: 60 },
  ],
};

describe("analytics scroll regions are keyboard reachable and named", () => {
  it("ScrollRegion is a focusable named region", async () => {
    const { container } = render(
      <ScrollRegion label="Region title">
        <table />
      </ScrollRegion>,
    );
    expectNamedFocusableRegions(container, ["Region title"]);
  });

  it("courier table and wilaya matrix", async () => {
    const element = await CourierPerformanceSection({
      providers,
      matrix,
      totalShipments: 50,
      feesIncluded: true,
      range: { from: new Date("2026-10-01"), to: new Date("2026-10-24") },
    });
    const { container } = render(element);
    expect(container.querySelector("[data-courier-matrix]")).not.toBeNull();
    expectNamedFocusableRegions(container, [
      "analytics.courier.title",
      "analytics.courier.matrix.title",
    ]);
  });

  it("extraction tables", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          total: 12,
          completionRate: 0.8,
          byMethod: [{ method: "rules", count: 12, avgConfidence: 0.9, avgLatencyMs: 40 }],
          trend: [{ date: "2026-10-23", count: 12, avgConfidence: 0.9, completeRate: 0.8 }],
        }),
      ),
    );
    const { container } = render(<ExtractionAnalytics />);
    await waitFor(() => expect(container.querySelector("table")).not.toBeNull());
    expectNamedFocusableRegions(container, [
      "analytics.extraction.byMethod",
      "analytics.extraction.trend",
    ]);
  });

  it("no analytics source adds a bare overflow wrapper outside ScrollRegion / Table", () => {
    // The SKU P&L table lives in the async server page, which needs the whole
    // database stack to render; this guard reads its source instead.
    const root = path.resolve(__dirname, "../../..");
    const files = [
      ...readdirSync(path.join(root, "components/analytics"))
        .filter((name) => name.endsWith(".tsx"))
        .map((name) => path.join(root, "components/analytics", name)),
      path.join(root, "app/(dashboard)/analytics/page.tsx"),
      path.join(root, "app/(dashboard)/analytics/extraction/page.tsx"),
    ];
    const offenders: string[] = [];
    for (const file of files) {
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, index) => {
          if (/className="[^"]*\boverflow-(?:x-|y-)?(?:auto|scroll)\b/.test(line)) {
            offenders.push(`${path.relative(root, file)}:${index + 1}`);
          }
        });
    }
    expect(offenders).toEqual([]);
  });
});

describe("analytics progress bars are named and carry their value", () => {
  it("OutcomeProgress progressbar is named by its visible label", () => {
    render(
      <OutcomeProgress
        value={72.4}
        displayValue="72%"
        label="Delivery Rate"
        outcomes={[{ key: "delivered", label: "Delivered", value: 7 }]}
      />,
    );
    const bar = screen.getByRole("progressbar", { name: "Delivery Rate" });
    expect(bar.getAttribute("aria-valuemin")).toBe("0");
    expect(bar.getAttribute("aria-valuemax")).toBe("100");
    expect(bar.getAttribute("aria-valuenow")).toBe("72");
  });

  it("two bars on one page get different label ids", () => {
    render(
      <>
        <OutcomeProgress value={10} displayValue="10%" label="First" outcomes={[]} />
        <OutcomeProgress value={20} displayValue="20%" label="Second" outcomes={[]} />
      </>,
    );
    expect(screen.getByRole("progressbar", { name: "First" })).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "Second" })).toBeTruthy();
  });
});
