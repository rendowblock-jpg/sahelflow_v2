/**
 * @vitest-environment happy-dom
 */
/**
 * s42 orderpage: the horizontal order stepper replaces the old "Tracking" card (a second, vertical timeline).
 * Pure component: it draws the same `timeline` array the page builds (created, confirmed, packed, shipped, delivered)
 * as done / current / upcoming, with the date under each finished step, and a distinct end node for
 * returned / refused / cancelled.
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { Locale } from "@/lib/i18n";
import { formatDate } from "@/lib/utils";
import { OrderStepper, terminalStepFor } from "../order-stepper";
import { PAGE_LOCALES, RAW_KEY, makeT } from "./order-page-test-i18n";

afterEach(cleanup);

const D = (iso: string) => new Date(iso);

function steps(locale: Locale, dates: Array<Date | null>) {
  const t = makeT(locale);
  const labels = [
    t("orders.created"),
    t("orders.status.confirmed"),
    t("orders.statusActions.packed"),
    t("orders.status.shipped"),
    t("orders.status.delivered"),
  ];
  return labels.map((label, i) => ({ label, date: dates[i] ?? null, done: !!dates[i] }));
}

function view(locale: Locale, dates: Array<Date | null>, status: string) {
  const t = makeT(locale);
  return render(
    <OrderStepper
      steps={steps(locale, dates)}
      terminal={terminalStepFor(status, t)}
      locale={locale}
      ariaLabel={t("orderLifecycle.stepsLabel")}
      stateLabels={{
        done: t("orders.detail.stepper.done"),
        current: t("orders.detail.stepper.current"),
        upcoming: t("orders.detail.stepper.upcoming"),
      }}
    />,
  );
}

const states = (c: HTMLElement) =>
  [...c.querySelectorAll("[data-testid='order-step']")].map((li) => li.getAttribute("data-state"));

describe.each(PAGE_LOCALES)("OrderStepper (%s)", (locale) => {
  it("marks a shipped order: four steps done, delivery is the current one, only finished steps carry a date", () => {
    const dates = [D("2026-10-26T10:00:00Z"), D("2026-10-26T12:00:00Z"), D("2026-10-27T09:00:00Z"), D("2026-10-27T15:00:00Z"), null];
    const { container } = view(locale, dates, "shipped");
    expect(states(container)).toEqual(["done", "done", "done", "done", "current"]);
    const items = [...container.querySelectorAll("[data-testid='order-step']")];
    expect(items[0]?.textContent).toContain(formatDate(dates[0]!, locale));
    expect(items[4]?.textContent).not.toMatch(/\d{4}/);
    expect(items[4]?.getAttribute("aria-current")).toBe("step");
    expect(container.querySelectorAll("[aria-current='step']").length).toBe(1);
  });

  it("a delivered order has five done steps and no current one", () => {
    const d = D("2026-10-28T10:00:00Z");
    const { container } = view(locale, [d, d, d, d, d], "delivered");
    expect(states(container)).toEqual(["done", "done", "done", "done", "done"]);
    expect(container.querySelector("[aria-current]")).toBeNull();
  });

  it("a new order: created is done, confirmation is current, the rest is upcoming", () => {
    const { container } = view(locale, [D("2026-10-28T10:00:00Z")], "pending");
    expect(states(container)).toEqual(["done", "current", "upcoming", "upcoming", "upcoming"]);
  });

  it("returned: finished steps stay, the never-reached ones go, a distinct end node closes the row", () => {
    const d = D("2026-10-28T10:00:00Z");
    const { container } = view(locale, [d, d, d, d, null], "returned");
    expect(states(container)).toEqual(["done", "done", "done", "done", "terminal"]);
    const end = container.querySelector("[data-state='terminal']")!;
    expect(end.getAttribute("data-terminal")).toBe("returned");
    expect(end.textContent).toContain(makeT(locale)("orders.status.returned"));
    expect(container.querySelector("[aria-current]")).toBeNull();
  });

  it("cancelled right after creation: created plus the cancelled end node, nothing else", () => {
    const { container } = view(locale, [D("2026-10-28T10:00:00Z")], "cancelled");
    expect(states(container)).toEqual(["done", "terminal"]);
    expect(container.querySelector("[data-terminal='cancelled']")).not.toBeNull();
  });

  it("refused has its own end node", () => {
    const d = D("2026-10-28T10:00:00Z");
    const { container } = view(locale, [d, d, d, d, null], "refused");
    expect(container.querySelector("[data-terminal='refused']")).not.toBeNull();
  });

  it("speaks the state to a screen reader, shows no raw key and never uses uppercase or letter-spacing", () => {
    const d = D("2026-10-28T10:00:00Z");
    const { container } = view(locale, [d, d], "confirmed");
    const text = container.textContent ?? "";
    expect(text).not.toMatch(RAW_KEY);
    expect(container.querySelector("ol")?.getAttribute("aria-label")).toBe(makeT(locale)("orderLifecycle.stepsLabel"));
    expect(container.querySelectorAll(".sr-only").length).toBeGreaterThanOrEqual(5);
    expect(container.innerHTML).not.toMatch(/\buppercase\b|tracking-(?!tight)/);
  });
});

describe("OrderStepper structure", () => {
  it("is vertical on a phone and horizontal from 640 px, with logical (RTL-safe) classes only", () => {
    const { container } = view("en", [D("2026-10-28T10:00:00Z")], "pending");
    const ol = container.querySelector("ol")!;
    expect(ol.className).toContain("flex-col");
    expect(ol.className).toContain("sm:flex-row");
    expect(container.innerHTML).not.toMatch(/\b(?:ml|mr|pl|pr|left|right)-\d|text-left|text-right/);
  });

  it("terminalStepFor knows only the three end states", () => {
    const t = makeT("en");
    expect(terminalStepFor("delivered", t)).toBeNull();
    expect(terminalStepFor("shipped", t)).toBeNull();
    expect(terminalStepFor("returned", t)?.kind).toBe("returned");
    expect(terminalStepFor("refused", t)?.kind).toBe("refused");
    expect(terminalStepFor("cancelled", t)?.kind).toBe("cancelled");
  });
});
