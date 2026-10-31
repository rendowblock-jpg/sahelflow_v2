/**
 * @vitest-environment happy-dom
 */
/** Detail pages: the offline gate, the offline banner and the page-shaped loading skeletons, in ar and en. */
import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { render } from "@/test-utils/render";
import ar from "@/lib/i18n/locales/ar.json";
import en from "@/lib/i18n/locales/en.json";
import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";
import { DetailOfflineBanner, OfflineWriteGate } from "@/components/orders/offline-write-gate";
import {
  DeliveryDetailSkeleton,
  OrderDetailSkeleton,
  ReturnDetailSkeleton,
} from "@/components/orders/detail-skeletons";

let online = true;
let locale: "ar" | "en" = "en";
vi.mock("@/hooks/use-online-status", () => ({ useOnlineStatus: () => online }));
vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({
    t: (key: string) => {
      const table = (locale === "ar" ? ar : en) as Record<string, string>;
      return table[key] ?? getRuntimeTranslation(locale, key) ?? key;
    },
    locale,
    dir: locale === "ar" ? "rtl" : "ltr",
  }),
}));

const sections = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("[data-skeleton-section]")).map((el) => el.getAttribute("data-skeleton-section"));

beforeEach(() => {
  online = true;
  locale = "en";
});

describe("OfflineWriteGate", () => {
  const write = (
    <OfflineWriteGate>
      <button type="button">Confirm</button>
      <input aria-label="Notes" defaultValue="ملاحظة: اتصال قبل التسليم" />
    </OfflineWriteGate>
  );

  it("online: controls work and nothing is said", () => {
    const { container } = render(write);
    expect(screen.getByRole("button", { name: "Confirm" })).toBeEnabled();
    expect(screen.getByLabelText("Notes")).toBeEnabled();
    expect(container.querySelector("fieldset")?.getAttribute("title")).toBeNull();
  });

  it("offline (en): every control is off and the reason is the tooltip AND the described-by text", () => {
    online = false;
    const { container } = render(write);
    expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled();
    expect(screen.getByLabelText("Notes")).toBeDisabled();
    const group = container.querySelector("fieldset");
    expect(group?.getAttribute("title")).toBe("You are offline");
    expect(screen.getByRole("group")).toHaveAccessibleDescription("You are offline");
  });

  it("offline (ar): the reason is Arabic", () => {
    online = false;
    locale = "ar";
    render(write);
    expect(screen.getByRole("group").getAttribute("title")).toMatch(/[\u0600-\u06FF]/);
    expect(screen.getByRole("group")).toHaveAccessibleDescription(/[\u0600-\u06FF]/);
  });
});

describe("DetailOfflineBanner", () => {
  it("draws nothing online", () => {
    const { container } = render(<DetailOfflineBanner />);
    expect(container.textContent).toBe("");
  });
  it("offline: says what is paused (en)", () => {
    online = false;
    render(<DetailOfflineBanner />);
    expect(screen.getByTestId("detail-offline-banner")).toHaveTextContent(/Confirm, reject, ship/);
  });
  it("offline: says it in Arabic", () => {
    online = false;
    locale = "ar";
    render(<DetailOfflineBanner />);
    expect(screen.getByTestId("detail-offline-banner").textContent).toMatch(/واتساب/);
  });
});

describe("detail loading skeletons have the shape of their page", () => {
  it.each([
    ["order", OrderDetailSkeleton, ["header", "stats", "items", "side"]],
    ["delivery", DeliveryDetailSkeleton, ["header", "stats", "order", "customer", "timeline"]],
    ["return", ReturnDetailSkeleton, ["header", "stats", "notes", "customer", "timeline"]],
  ] as const)("%s", (_name, Skeleton, expected) => {
    const { container } = render(<Skeleton />);
    expect(sections(container)).toEqual(expected);
    const shell = screen.getByRole("status");
    expect(shell).toHaveAttribute("aria-busy", "true");
    expect(shell).toHaveTextContent(en["state.loading.label" as keyof typeof en] as string);
  });
});
