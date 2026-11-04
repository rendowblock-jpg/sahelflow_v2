import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * R50 lane tapb (Internal.50), second group: /storefronts, /analytics, /risk, /accounting and the
 * settings modal. On a 390 px phone every link, button, field and tab measures at least 40x40 css px
 * (sweep rule in audit/program/ui/sweep-lib.mjs). Controls inside the dashboard workspace also get a
 * zero-specificity floor from responsive-system.css, but a control that sets its own width, height
 * or display needs its own phone-only (`max-sm:`) size, and a control inside a dialog is outside that
 * rule. Desktop must not change: every size here is a `max-sm:` class.
 */
const read = (path: string) => readFileSync(resolve(process.cwd(), "src", path), "utf8");

/** The opening tag (up to its closing `>` on its own line) that contains `needle`. */
function tagWith(source: string, needle: string): string {
  const at = source.indexOf(needle);
  expect(at, `${needle} is in the source`).toBeGreaterThan(-1);
  const start = source.lastIndexOf("<", at);
  const end = source.indexOf("\n", source.indexOf(">", at));
  return source.slice(start, end);
}

describe("tabs: a wrapping or sideways-scrolling list keeps 40 px tabs on a phone", () => {
  it("TabsTrigger floors the tab height under the wrap and the scroll variants (storefronts, risk)", () => {
    const source = read("components/ui/tabs.tsx");
    expect(source).toContain("group-data-[wrap=true]/tabs-list:max-sm:min-h-10");
    expect(source).toContain("group-data-[scroll=true]/tabs-list:max-sm:min-h-10");
    // the fixed-height line list keeps its 36 px list: no floor there, a taller tab would stick out of it
    expect(source).not.toContain("group-data-[variant=default]/tabs-list:max-sm:min-h-10");
  });
});

describe("analytics, dashboard and accounting cards", () => {
  it("the metric info button of a stat card is a 40 px target that does not grow the card", () => {
    const button = tagWith(read("components/shared/stat-card.tsx"), 'aria-label={tooltip}');
    expect(button).toContain("max-sm:size-10");
    expect(button).toContain("max-sm:-m-2");
  });

  it("the KPI drill-down arrow link is 40 px on a phone", () => {
    expect(read("components/analytics/kpi-drill-down-link.tsx")).toContain("max-sm:size-10");
  });

  it("the courier success-rate cell link is at least 40 px tall on a phone", () => {
    const link = tagWith(read("components/analytics/courier-performance-section.tsx"), 'title={t("analytics.courier.viewDelivered")}');
    expect(link).toContain("max-sm:min-h-10");
  });

  it("the chart 'show as table' toggle is at least 40 px on a phone", () => {
    const source = read("components/charts/chart-primitives.tsx");
    const at = source.indexOf("aria-pressed={asTable}");
    expect(at).toBeGreaterThan(-1);
    // the opening tag has an arrow function in onClick, so look at the lines up to the label
    expect(source.slice(at, source.indexOf("{asTable ?", at))).toContain("max-sm:min-h-10");
  });

  it("the shared row actions (edit expense, edit product) are 40 px buttons on a phone", () => {
    const source = read("components/shared/row-actions.tsx");
    expect(source.match(/max-sm:size-10/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});

describe("risk page", () => {
  it("the period pills (Last 7 days ...) are 40 px links on a phone", () => {
    const source = read("components/risk/risk-view.tsx");
    const link = tagWith(source, "href={`/risk?days=${range.days}&tab=${activeTab}`}");
    expect(source.slice(source.indexOf(link), source.indexOf(link) + link.length + 400)).toContain("max-sm:min-h-10");
  });

  it("the 'review' link of a risky customer is a 40 px link on a phone", () => {
    const link = tagWith(read("components/risk/risk-seller-sections.tsx"), 'href={`/customers/${encodeURIComponent(customer.customerId)}`}');
    expect(link).toBeTruthy();
    const source = read("components/risk/risk-seller-sections.tsx");
    const at = source.indexOf("href={`/customers/${encodeURIComponent(customer.customerId)}`}");
    expect(source.slice(at, at + 400)).toContain("max-sm:min-h-10");
  });
});

describe("storefronts hub", () => {
  const card = read("components/storefront/storefront-card.tsx");

  it("the copy-link icon button is 40 px on a phone without making its row taller", () => {
    const button = tagWith(card, "onClick={onCopyLink}");
    expect(button).toContain("max-sm:size-10");
    expect(button).toContain("max-sm:-my-1.5");
  });

  it("the 'Edit in Studio' and 'View store' buttons are at least 40 px tall on a phone", () => {
    const editAt = card.indexOf("<Button asChild size=\"sm\"");
    expect(editAt).toBeGreaterThan(-1);
    expect(card.slice(editAt, editAt + 160)).toContain("max-sm:min-h-10");
    const viewAt = card.indexOf("<Button\n          asChild");
    expect(viewAt).toBeGreaterThan(-1);
    expect(card.slice(viewAt, viewAt + 260)).toContain("max-sm:min-h-10");
  });
});

describe("settings modal", () => {
  const source = read("components/settings/settings-workspace.tsx");

  it("the search field is 44 px tall on a phone even with a mouse-like pointer", () => {
    expect(tagWith(source, 'data-settings-search="true"')).toBeDefined();
    const at = source.indexOf('data-settings-search="true"');
    expect(source.slice(at, at + 600)).toContain("max-sm:h-11");
  });

  it("the clear-search button is 44 px on a phone", () => {
    const at = source.indexOf("onClick={() => setQuery(\"\")}");
    expect(source.slice(at, at + 600)).toContain("max-sm:size-11");
  });

  it("the page rows of the phone directory stay 48 px tall", () => {
    expect(source).toContain('mobile ? "min-h-12 py-2" : "h-8"');
  });
});
