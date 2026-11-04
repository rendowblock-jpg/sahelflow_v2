import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * s42 orderpage: the structure of /orders/[id] (source contract, not behaviour).
 * The Founder found the page "not premium": ten equal cards, the customer 1.4 screens down, two timelines.
 * These rules stop the old shape from coming back: a summary strip and a stepper on top, a two-column body whose
 * aside runs customer, risk, activity, and at most 6 cards in the page file.
 */
const page = readFileSync(resolve(process.cwd(), "src/app/(dashboard)/orders/[id]/page.tsx"), "utf8");
const at = (needle: string) => page.indexOf(needle);

describe("order detail page structure", () => {
  it("holds at most 6 <Card in the page file (was 10)", () => {
    const cards = page.match(/<Card[\s>]/g) ?? [];
    expect(cards.length).toBeLessThanOrEqual(6);
    expect(cards.length).toBeGreaterThanOrEqual(4);
  });

  it("has no Tracking card: the stepper replaces it and the #order-tracking anchor stays", () => {
    expect(page).not.toContain('t("orders.detail.tracking")');
    expect(page).not.toMatch(/<Card[^>]*id="order-tracking"/);
    expect(page).toContain('id="order-tracking"');
    expect(page).toContain("<OrderStepper");
    expect(page).toContain("<OrderSummaryStrip");
    expect(at('id="order-tracking"')).toBeLessThan(at("<OrderStepper"));
    expect(at("<OrderStepper")).toBeLessThan(at("<OrderLifecycleRail"));
  });

  it("puts the summary strip before the lifecycle card and the body", () => {
    expect(at("<OrderSummaryStrip")).toBeGreaterThan(at("<h1"));
    expect(at("<OrderSummaryStrip")).toBeLessThan(at('id="order-tracking"'));
    // The stepper and the rail are the lower part of the SAME card as the four cells (one focus, one card).
    expect(at("<OrderLifecycleRail")).toBeLessThan(at("</OrderSummaryStrip>"));
    expect(page).toContain("whatsapp={");
    expect(page).toContain("<OrderWhatsAppButton");
  });

  it("body is main + a 22rem aside; the aside is sticky from lg", () => {
    expect(page).toContain("lg:grid-cols-[minmax(0,1fr)_22rem]");
    expect(page).toMatch(/<aside[^>]*lg:sticky[^>]*lg:top-4/);
    expect(page).toMatch(/<aside[^>]*lg:self-start/);
  });

  it("the aside runs customer+address, then risk, then activity (source order = phone order)", () => {
    const customer = at('t("orders.detail.customerAddress")');
    const risk = at('t("risk.assessment.title")');
    const activity = at("<OrderTimeline");
    expect(customer).toBeGreaterThan(at("<aside"));
    expect(customer).toBeLessThan(risk);
    expect(risk).toBeLessThan(activity);
    // The main column (items) comes before the aside, so on a phone: items, customer, risk, activity.
    expect(at('t("orders.detail.itemsWithCount"')).toBeLessThan(at("<aside"));
  });

  it("risk is compact: the first 3 factors, the rest inside <details>", () => {
    expect(page).toContain("riskAssessment.factors.slice(0, 3)");
    expect(page).toContain("riskAssessment.factors.slice(3)");
    expect(page).toContain("<details");
    expect(page).toContain('"orders.detail.risk.moreFactors"');
  });

  it("activity scrolls inside a bounded, keyboard-reachable region", () => {
    expect(page).toMatch(/max-h-\[?[\w.]+\]?[^"]*overflow-y-auto|overflow-y-auto[^"]*max-h-/);
    expect(page).toMatch(/tabIndex=\{0\}/);
  });

  it("header is a breadcrumb + one action group (Ask AI, slip, delete), no back button", () => {
    expect(page).toContain('t("orders.detail.breadcrumbLabel")');
    expect(page).not.toContain("ArrowLeft className=\"h-4 w-4 me-1");
    expect(at("<DeliverySlipPrintButton")).toBeLessThan(at("<aside"));
    expect(at("<DeliverySlipPrintButton")).toBeLessThan(at("<OrderSummaryStrip"));
    expect(at("<OrderDeleteButton")).toBeLessThan(at("<OrderSummaryStrip"));
    expect(at('data-testid="order-header-ask-ai"')).toBeLessThan(at("<OrderSummaryStrip"));
  });

  it("the French print button wraps instead of spilling out of its box", () => {
    expect(page).toMatch(/<DeliverySlipPrintButton[^>]*whitespace-normal h-auto min-h-10 text-center/);
  });

  it("keeps Arabic safe and RTL safe: no uppercase, no letter-spacing, logical classes only", () => {
    expect(page).not.toMatch(/\buppercase\b|tracking-wider|tracking-wide\b/);
    expect(page).not.toMatch(/\b(?:ml|mr|pl|pr)-\d|text-left|text-right|\bleft-\d|\bright-\d/);
  });

  it("Notes and Refunds are sections of the items card, not cards of their own", () => {
    expect(page).toContain('t("orders.notes")');
    expect(page).toContain("<RefundDialog");
    expect(page).not.toMatch(/<Card[^>]*>\s*<CardHeader>\s*<CardTitle[^>]*>\s*\{t\("orders\.notes"\)/);
  });

  it("the rail keeps its actions but hides its own second row of steps (presentation prop, default on)", () => {
    const rail = readFileSync(resolve(process.cwd(), "src/components/orders/order-lifecycle-rail.tsx"), "utf8");
    expect(page).toContain("showProgress={false}");
    expect(rail).toContain("showProgress = true");
    expect(rail).toContain("{!showProgress ? null : railPosition ? (");
    // The deep link the stepper wrapper answers to is still on the rail.
    expect(rail).toContain('href="#order-tracking"');
  });
});
