/**
 * @vitest-environment happy-dom
 */
/** COD reconciliation page: five states, plus the pairing of each headline figure with its sentence. */
import { readFileSync } from "node:fs";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CodReconciliationView } from "@/components/accounting/cod-reconciliation-view";
import { isCodSummaryEmpty, resolveCodState } from "@/components/accounting/cod-reconciliation-state";
import { getTranslations, type Locale } from "@/lib/i18n";
import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/accounting/cod-reconciliation",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/hooks/use-i18n", async () => {
  const { getTranslations: gt } = await import("@/lib/i18n");
  const { getRuntimeTranslation: rt } = await import("@/lib/i18n/runtime-translations");
  return { useI18n: () => ({ locale: "en", dir: "ltr", t: (key: string) => gt("en")[key] ?? rt("en", key) ?? key }) };
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
const flagged = [{ orderId: "o1", orderNumber: "SF-1042" }, { orderId: "o2", orderNumber: "SF-1047" }];
function view(locale: Locale, state: Parameters<typeof resolveCodState>[0] & object, over: Partial<React.ComponentProps<typeof CodReconciliationView>> = {}) {
  const input = state as { s: React.ComponentProps<typeof CodReconciliationView>["state"] };
  return render(
    <CodReconciliationView
      t={makeT(locale)}
      state={input.s}
      flaggedOrders={[]}
      truncated={false}
      retryHref="/accounting/cod-reconciliation"
      ordersHref="/orders"
      body={<div data-testid="cod-body">workspace</div>}
      {...over}
    />,
  );
}
const at = (s: React.ComponentProps<typeof CodReconciliationView>["state"]) => ({ s }) as never;

describe("resolveCodState / isCodSummaryEmpty", () => {
  const ok = { failed: false, truncated: false, flaggedCount: 0, empty: false };
  it.each([
    [{ loading: true }, "loading"],
    [{ failed: true, empty: true }, "error"],
    [{ empty: true }, "empty"],
    [{ truncated: true }, "partial"],
    [{ flaggedCount: 2 }, "partial"],
    [{}, "populated"],
  ] as const)("%j -> %s", (over, expected) => expect(resolveCodState({ ...ok, ...over })).toBe(expected));
  it("empty means every total is zero and nothing to review", () => {
    const zero = { expectedReceivable: 0, effectiveCollected: 0, fees: 0 };
    expect(isCodSummaryEmpty({ totals: zero, reviewLines: [], disputed: [] })).toBe(true);
    expect(isCodSummaryEmpty({ totals: { ...zero, fees: 150 }, reviewLines: [], disputed: [] })).toBe(false);
    expect(isCodSummaryEmpty({ totals: zero, reviewLines: [{}], disputed: [] })).toBe(false);
    expect(isCodSummaryEmpty({ totals: zero, reviewLines: [], disputed: [{}] })).toBe(false);
  });
});

describe("CodReconciliationView", () => {
  it("loading: skeleton with the eight figures grid, no body", () => {
    const { container, queryByTestId } = view("en", at("loading"));
    expect(container.querySelector("[data-cod-skeleton]")?.getAttribute("role")).toBe("status");
    expect([...container.querySelectorAll("[data-skeleton-section]")].map((n) => n.getAttribute("data-skeleton-section"))).toEqual(["header", "cards", "list"]);
    expect(queryByTestId("cod-body")).toBeNull();
  });
  it("error: kit error with Retry, no raw text, no body, no notices", () => {
    const { getByRole, queryByTestId } = view("en", at("error"), { flaggedOrders: flagged, truncated: true });
    const t = makeT("en");
    const alert = getByRole("alert");
    expect(alert.textContent).toContain(t("codReconciliation.state.loadFailed"));
    expect(alert.textContent).toContain(t("error.requestFailed"));
    expect(alert.textContent).not.toMatch(/SQLITE|Error:|undefined|null|\[object/i);
    const retry = getByRole("link", { name: t("common.retry") });
    expect(retry.getAttribute("href")).toBe("/accounting/cod-reconciliation");
    expect(retry.className).toContain("min-h-11");
    expect(queryByTestId("cod-body")).toBeNull();
  });
  it("empty: one sentence, one action to the orders", () => {
    const { getByTestId, getByRole, queryByTestId } = view("en", at("empty"));
    expect(getByTestId("cod-empty").textContent).toContain(makeT("en")("codReconciliation.state.empty"));
    expect(getByRole("link", { name: makeT("en")("nav.orders") }).getAttribute("href")).toBe("/orders");
    expect(queryByTestId("cod-body")).toBeNull();
  });
  it("partial: capped read and flagged orders are said above the workspace that stays", () => {
    const { getByTestId, getByRole, getAllByRole } = view("en", at("partial"), { flaggedOrders: flagged, truncated: true });
    const t = makeT("en");
    expect(getByTestId("cod-body")).toBeTruthy();
    expect(getAllByRole("alert")[0]?.textContent).toContain("SF-1042");
    expect(getByRole("status").textContent).toContain(t("codReconciliation.truncatedNotice"));
  });
  it("populated: just the workspace, no notice", () => {
    const { getByTestId, queryByRole } = view("en", at("populated"));
    expect(getByTestId("cod-body")).toBeTruthy();
    expect(queryByRole("alert")).toBeNull();
    expect(queryByRole("status")).toBeNull();
  });
  it("the COD sentences exist in ar, fr, en and differ", () => {
    for (const key of ["expected", "collected", "remitted", "net", "fees", "collectPending", "remitPending", "review"].map((k) => `codReconciliation.def.${k}`).concat(["codReconciliation.state.empty", "codReconciliation.state.loadFailed"])) {
      const all = (["ar", "fr", "en"] as const).map((l) => makeT(l)(key));
      expect(new Set(all).size, key).toBe(3);
      for (const text of all) expect(text, key).not.toBe(key);
    }
  });
});

describe("headline figure <-> sentence pairing in the COD workspace", () => {
  const dash = readFileSync("src/components/accounting/canonical-cod-dashboard.tsx", "utf8");
  const readonly = readFileSync("src/components/accounting/canonical-cod-readonly.tsx", "utf8");
  it.each([
    ["expected", "expected"], ["collectedTotal", "collected"], ["grossRemitted", "remitted"], ["net", "net"],
    ["fees", "fees"], ["collectPending", "collectPending"], ["remitPending", "remitPending"], ["reviewCount", "review"],
  ])("dashboard card %s carries codReconciliation.def.%s", (label, def) => {
    expect(dash).toContain(`<SummaryCard label={t("codReconciliation.${label}")} hint={t("codReconciliation.def.${def}")} `);
  });
  it.each([
    ["expected", "expected"], ["collected", "collected"], ["remitted", "remitted"], ["net", "net"],
    ["awaitingCollection", "collectPending"], ["awaitingRemittance", "remitPending"], ["review", "review"],
  ])("read-only card %s carries codReconciliation.def.%s", (label, def) => {
    expect(readonly).toContain(`<StatCard label={text.${label}} subtitle={t("codReconciliation.def.${def}")} `);
  });
});
