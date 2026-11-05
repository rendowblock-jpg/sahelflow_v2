/**
 * @vitest-environment happy-dom
 */
/** M1 render: the suspicious flag is a badge PLUS the top reason as visible text (Arabic RTL + French). */
import { screen } from "@testing-library/react";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { SWRConfig } from "swr";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConfirmationQueueTable } from "@/components/orders/confirmation-queue-table";
import { render } from "@/test-utils/render";
import type { ConfirmationQueueResponse } from "@/types/workbench";

const h = vi.hoisted(() => ({
  locale: "ar" as "ar" | "fr" | "en",
  mobile: true,
  dicts: {} as Record<string, Record<string, string>>,
}));
vi.mock("@/hooks/use-mobile", () => ({ useMobile: () => h.mobile }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/orders/confirmation-queue",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/toast", () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() });
  return { toast, default: toast };
});
vi.mock("@/hooks/use-i18n", async () => {
  const dicts: Record<string, Record<string, string>> = {
    ar: (await import("@/lib/i18n/locales/ar.json")).default as Record<string, string>,
    fr: (await import("@/lib/i18n/locales/fr.json")).default as Record<string, string>,
    en: (await import("@/lib/i18n/locales/en.json")).default as Record<string, string>,
  };
  h.dicts = dicts;
  const t = (key: string, params?: Record<string, unknown>) => {
    let s = dicts[h.locale]?.[key] ?? key;
    for (const [k, v] of Object.entries(params ?? {})) s = s.split(`{${k}}`).join(String(v));
    return s;
  };
  return { useI18n: () => ({ t, locale: h.locale, dir: h.locale === "ar" ? "rtl" : "ltr" }) };
});

const base = {
  version: 1, ageMinutes: 12, isStale: false, ageLabel: "12 min", mutationAuthority: "canonical_v1" as const,
  canUpdate: true, customerName: "Ahmed Benali", phone: "+213555010203", wilaya: "16", totalPrice: 450000,
};
const response = {
  queue: [
    { ...base, id: "ord-flag", orderNumber: "ORD-0057", risk: {
      level: "high",
      reasons: [
        { code: "previous_returns", key: "confirmationQueue.risk.reason.previousReturns" },
        { code: "repeat_order_24h", key: "confirmationQueue.risk.reason.repeatOrder24h" },
      ] } },
    { ...base, id: "ord-clean", orderNumber: "ORD-0058" },
  ],
  fieldAccess: { contact: true, financials: true },
  total: 2, staleCount: 0, totalValue: 900000, hasNextPage: false, page: 1, pageSize: 25,
} as unknown as ConfirmationQueueResponse;

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(response), { status: 200, headers: { "content-type": "application/json" } })));
});
afterEach(() => { vi.unstubAllGlobals(); });

describe.each([
  { locale: "ar" as const, mobile: true }, { locale: "ar" as const, mobile: false },
  { locale: "fr" as const, mobile: true }, { locale: "fr" as const, mobile: false },
])("flag on a row, locale $locale, mobile $mobile", ({ locale, mobile }) => {
  it("shows the level badge and the top reason as visible, wrapping, direction-safe text; the clean row has none", () => {
    h.locale = locale; h.mobile = mobile;
    const dict = h.dicts[locale] ?? {};
    const text = (key: string): string => dict[key] ?? key;
    render(
      <NuqsTestingAdapter>
        <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
          <div dir={locale === "ar" ? "rtl" : "ltr"}>
            <ConfirmationQueueTable fallback={response} locale={locale} />
          </div>
        </SWRConfig>
      </NuqsTestingAdapter>,
    );
    expect(dict["confirmationQueue.risk.reason.previousReturns"], "locale key missing").toBeTruthy();
    const top = text("confirmationQueue.risk.reason.previousReturns");
    const flags = screen.getAllByTestId("queue-risk-flag");
    expect(flags).toHaveLength(1);
    expect(flags[0]?.textContent).toContain(text("risk.level.high"));
    const reason = screen.getByTestId("queue-risk-reason");
    expect(reason.textContent).toBe(top);
    expect(reason.closest("[aria-hidden='true']")).toBeNull();
    expect(reason.className).not.toMatch(/sr-only|truncate|whitespace-nowrap|\bhidden\b/);
    expect(reason.className).toMatch(/break-words|whitespace-normal|text-wrap/);
    expect(reason.className).not.toMatch(/(^|\s)(ml|mr|pl|pr|left|right)-|text-(left|right)/);
    expect(screen.queryByText(text("confirmationQueue.risk.reason.repeatOrder24h"))).toBeNull();
    if (locale === "ar") expect(top).toMatch(/[\u0600-\u06FF]/);
    else expect(top).not.toMatch(/[\u0600-\u06FF]/);
  });
});
