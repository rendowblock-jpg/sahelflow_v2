/**
 * @vitest-environment happy-dom
 */
/**
 * The five-state kit (F2): loading, empty, error, partial, offline, plus the
 * four skeleton presets, rendered in Arabic and English.
 */
import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EmptyState } from "@/components/shared/empty-state";
import { FullPageSkeleton } from "@/components/shared/full-page-skeleton";
import { PageError } from "@/components/shared/page-error";
import { ChatLoading, FormLoading, PageLoading } from "@/components/shared/page-loading";
import {
  CardGridSkeleton,
  ChartSkeleton,
  DetailSkeleton,
  ListSkeleton,
} from "@/components/shared/state-skeletons";
import { StateSurface } from "@/components/shared/state-surface";
import { formatStateClock } from "@/components/shared/state-time";
import { StateView } from "@/components/shared/state-view";
import arJson from "@/lib/i18n/locales/ar.json";
import enJson from "@/lib/i18n/locales/en.json";
import frJson from "@/lib/i18n/locales/fr.json";
import { render, userEvent } from "@/test-utils/render";
import { Inbox } from "lucide-react";

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

function req(catalog: Record<string, string>, key: string): string {
  const value = catalog[key];
  if (value === undefined) throw new Error(`missing catalog key ${key}`);
  return value;
}

vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string | number>) =>
      interpolate(CATALOGS[harness.locale][key] ?? key, params),
    locale: harness.locale,
    dir: harness.locale === "ar" ? "rtl" : "ltr",
  }),
}));

const AT = new Date("2026-10-30T10:05:00Z"); // 11:05 in Algiers (UTC+1)

describe.each(["en", "ar"] as const)("state kit in %s", (locale) => {
  const cat = CATALOGS[locale];
  const say = (key: string, params?: Record<string, string | number>) =>
    interpolate(req(cat, key), params);
  beforeEach(() => {
    harness.locale = locale;
  });

  it("loading: a polite, busy status with the localized label and no motion under reduced motion", () => {
    const { container } = render(<StateView kind="loading" />);
    const el = screen.getByRole("status");
    expect(el).toHaveAttribute("aria-busy", "true");
    expect(el).toHaveAttribute("aria-live", "polite");
    expect(el).toHaveAttribute("data-state-kind", "loading");
    expect(el).toHaveTextContent(say("state.loading.title"));
    expect(container.querySelector(".animate-spin")).toHaveClass("motion-reduce:animate-none");
  });

  it("empty: shows the caller's words and next action, and is not an alert", async () => {
    const onAdd = vi.fn();
    const user = userEvent.setup();
    render(
      <StateView
        kind="empty"
        title="Nothing yet"
        description="Add the first one"
        action={<button type="button" onClick={onAdd}>Add</button>}
      />,
    );
    expect(screen.getByText("Nothing yet")).toBeInTheDocument();
    expect(screen.getByText("Add the first one")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it("empty: falls back to localized default copy", () => {
    render(<StateView kind="empty" />);
    expect(screen.getByText(say("state.empty.title"))).toBeInTheDocument();
  });

  it("error: assertive alert, heading focused, Retry calls the callback, no code without a digest", async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    render(<StateView kind="error" onRetry={onRetry} />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveAttribute("aria-live", "assertive");
    expect(alert).toHaveAttribute("data-state-kind", "error");
    const heading = within(alert).getByRole("heading");
    expect(heading).toHaveTextContent(say("state.error.title"));
    expect(document.activeElement).toBe(heading);
    expect(screen.queryByTestId("state-error-code")).toBeNull();
    const retry = screen.getByRole("button", { name: req(cat, "error.retry") });
    expect(retry.className).toContain("min-h-(--sf-touch-target)");
    await user.click(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("error: shows a muted error code line only when there is a digest", () => {
    render(<StateView kind="error" onRetry={() => {}} digest="abc123" />);
    const code = screen.getByTestId("state-error-code");
    expect(code).toHaveTextContent(say("state.error.code", { code: "abc123" }));
    expect(code).toHaveClass("text-muted-foreground");
  });

  it("error: no Retry button when there is nothing to retry", () => {
    render(<StateView kind="error" />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("partial: a polite status banner with the saved time and a Refresh action", async () => {
    const onRefresh = vi.fn();
    const user = userEvent.setup();
    render(<StateView kind="partial" lastUpdated={AT} onRefresh={onRefresh} />);
    const banner = screen.getByRole("status");
    expect(banner).toHaveAttribute("aria-live", "polite");
    expect(banner).toHaveAttribute("data-state-size", "banner");
    expect(banner).toHaveTextContent(
      say("state.partial.message", { time: formatStateClock(AT, locale) }),
    );
    await user.click(within(banner).getByRole("button", { name: say("state.partial.refresh") }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("offline: says saved data stays readable, with the last-updated time when given", () => {
    const { rerender } = render(<StateView kind="offline" />);
    const el = screen.getByRole("status");
    expect(el).toHaveTextContent(say("state.offline.message"));
    expect(el).not.toHaveTextContent(say("state.offline.lastUpdated", { time: "" }).trim());
    rerender(<StateView kind="offline" lastUpdated={AT} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      say("state.offline.lastUpdated", { time: formatStateClock(AT, locale) }),
    );
  });

  it("uses logical (RTL-safe) classes only", () => {
    const { container } = render(
      <div>
        <StateView kind="loading" />
        <StateView kind="empty" />
        <StateView kind="error" onRetry={() => {}} digest="d" />
        <StateView kind="partial" lastUpdated={AT} onRefresh={() => {}} />
        <StateView kind="offline" lastUpdated={AT} />
      </div>,
    );
    const classes = Array.from(container.querySelectorAll("[class]")).flatMap((n) =>
      (n.getAttribute("class") ?? "").split(/\s+/),
    );
    const physical = classes.filter((c) =>
      /^(ml|mr|pl|pr|left|right|text-left|text-right|border-l|border-r|rounded-l|rounded-r)(-|$)/.test(
        c.replace(/^[a-z-]+:/, ""),
      ),
    );
    expect(physical).toEqual([]);
  });
});

describe("clock format", () => {
  it("prints HH:mm in the shop time zone", () => {
    expect(formatStateClock(AT, "en")).toBe("11:05");
    expect(formatStateClock(AT.getTime(), "fr")).toBe("11:05");
    expect(formatStateClock(AT.toISOString(), "ar")).toMatch(/11.05/);
  });
});

describe("StateSurface kind contract", () => {
  it("keeps legacy callers (no kind) untouched: no role, no live region, no busy flag", () => {
    const { container } = render(<StateSurface icon={Inbox} title="Plain" />);
    const section = container.querySelector("section");
    expect(section).not.toHaveAttribute("role");
    expect(section).toHaveAttribute("aria-live", "off");
    expect(section).not.toHaveAttribute("aria-busy");
  });

  it.each([
    ["loading", "status", "polite"],
    ["partial", "status", "polite"],
    ["offline", "status", "polite"],
    ["error", "alert", "assertive"],
  ] as const)("%s gets role %s and aria-live %s", (kind, role, live) => {
    render(<StateSurface kind={kind} title="T" />);
    const el = screen.getByRole(role);
    expect(el).toHaveAttribute("aria-live", live);
  });

  it("empty is static content: no role", () => {
    const { container } = render(<StateSurface kind="empty" title="T" />);
    expect(container.querySelector("section")).not.toHaveAttribute("role");
  });
});

describe("skeleton shape contract", () => {
  beforeEach(() => {
    harness.locale = "en";
  });

  it("ListSkeleton renders exactly rows x columns at the requested row height", () => {
    const { container } = render(<ListSkeleton rows={5} columns={4} rowHeight="lg" />);
    const rows = container.querySelectorAll("[data-skeleton-row]");
    expect(rows).toHaveLength(5);
    rows.forEach((row) => {
      expect(row.querySelectorAll("[data-skeleton-cell]")).toHaveLength(4);
      expect(row).toHaveClass("h-14");
    });
    expect(container.querySelectorAll("[data-skeleton-header]")).toHaveLength(1);
    expect(container.querySelector("[data-skeleton-header]")?.querySelectorAll("[data-skeleton-cell]")).toHaveLength(4);
  });

  it.each([
    ["sm", "h-10"],
    ["md", "h-12"],
    ["lg", "h-14"],
  ] as const)("ListSkeleton rowHeight=%s uses %s", (rowHeight, cls) => {
    const { container } = render(<ListSkeleton rows={2} columns={3} rowHeight={rowHeight} />);
    container.querySelectorAll("[data-skeleton-row]").forEach((row) => expect(row).toHaveClass(cls));
  });

  it("ListSkeleton defaults to the table density (8 rows, 5 columns, h-12) and can drop the header", () => {
    const { container } = render(<ListSkeleton showHeader={false} />);
    expect(container.querySelectorAll("[data-skeleton-row]")).toHaveLength(8);
    expect(container.querySelector("[data-skeleton-row]")).toHaveClass("h-12");
    expect(container.querySelector("[data-skeleton-row]")?.querySelectorAll("[data-skeleton-cell]")).toHaveLength(5);
    expect(container.querySelector("[data-skeleton-header]")).toBeNull();
  });

  it("CardGridSkeleton renders the requested cards in the matching column ladder", () => {
    const { container } = render(<CardGridSkeleton cards={6} columns={3} />);
    expect(container.querySelectorAll("[data-skeleton-card]")).toHaveLength(6);
    expect(container.querySelector("[data-skeleton-grid]")).toHaveClass("xl:grid-cols-3");
  });

  it("DetailSkeleton renders the requested number of fields", () => {
    const { container } = render(<DetailSkeleton fields={7} />);
    expect(container.querySelectorAll("[data-skeleton-field]")).toHaveLength(7);
  });

  it.each([
    ["sm", "h-32"],
    ["md", "h-48"],
    ["lg", "h-64"],
  ] as const)("ChartSkeleton height=%s uses %s", (height, cls) => {
    const { container } = render(<ChartSkeleton height={height} />);
    expect(container.querySelector("[data-skeleton-chart]")).toHaveClass(cls);
  });

  const PRESETS: ReadonlyArray<[string, React.ReactElement]> = [
    ["ListSkeleton", <ListSkeleton key="l" rows={3} />],
    ["DetailSkeleton", <DetailSkeleton key="d" fields={3} />],
    ["CardGridSkeleton", <CardGridSkeleton key="c" cards={3} />],
    ["ChartSkeleton", <ChartSkeleton key="h" />],
    ["PageLoading", <PageLoading key="p" />],
    ["FormLoading", <FormLoading key="f" />],
    ["FullPageSkeleton", <FullPageSkeleton key="s" />],
  ];

  it.each(PRESETS)("%s is a busy polite status with a localized label", (_n, ui) => {
    render(ui);
    const el = screen.getByRole("status");
    expect(el).toHaveAttribute("aria-busy", "true");
    expect(el).toHaveAttribute("aria-live", "polite");
    expect(within(el).getByText(req(CATALOGS.en, "state.loading.label"))).toHaveClass("sr-only");
  });

  it.each(PRESETS)("%s: every bar carries motion-reduce:animate-none (no shimmer)", (_n, ui) => {
    const { container } = render(ui);
    const bars = container.querySelectorAll('[data-slot="skeleton"]');
    expect(bars.length).toBeGreaterThan(0);
    bars.forEach((bar) => expect(bar).toHaveClass("motion-reduce:animate-none"));
  });

  it("ChatLoading spinner also stops under reduced motion", () => {
    const { container } = render(<ChatLoading />);
    expect(container.querySelector(".animate-spin")).toHaveClass("motion-reduce:animate-none");
  });

  it("old page-level exports keep their props: PageLoading rowCount/statCount, FullPageSkeleton rowCount/statCount", () => {
    const a = render(<PageLoading rowCount={3} statCount={2} />);
    expect(a.container.querySelectorAll("[data-skeleton-row]")).toHaveLength(3);
    expect(a.container.querySelectorAll("[data-skeleton-card]")).toHaveLength(2);
    a.unmount();
    const b = render(<FullPageSkeleton rowCount={5} statCount={3} showStats={false} />);
    expect(b.container.querySelectorAll("[data-skeleton-row]")).toHaveLength(5);
    expect(b.container.querySelector("[data-skeleton-card]")).toBeNull();
  });
});

describe("old exports now run on the kit", () => {
  beforeEach(() => {
    harness.locale = "en";
  });

  it("EmptyState is the empty kind", () => {
    const onAction = vi.fn();
    const { container } = render(
      <EmptyState icon={Inbox} title="No orders" actionLabel="Add order" onAction={onAction} />,
    );
    expect(container.querySelector("section")).toHaveAttribute("data-state-kind", "empty");
    expect(screen.getByRole("button", { name: "Add order" })).toBeInTheDocument();
  });

  it("PageError keeps its test ids, is an assertive alert, focuses the heading and shows the digest", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const reset = vi.fn();
    const user = userEvent.setup();
    const error = Object.assign(new Error("db exploded"), { digest: "dg-77" });
    render(<PageError error={error} reset={reset} />);
    const alert = screen.getByTestId("page-error");
    expect(alert).toHaveAttribute("role", "alert");
    expect(alert).toHaveAttribute("aria-live", "assertive");
    expect(document.activeElement).toBe(within(alert).getByRole("heading"));
    expect(screen.getByTestId("state-error-code")).toHaveTextContent("dg-77");
    expect(alert).not.toHaveTextContent("db exploded");
    await user.click(screen.getByTestId("page-error-retry"));
    expect(reset).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("page-error-reload")).toBeInTheDocument();
  });

  it("PageError without a digest shows no code line", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<PageError error={new Error("x")} reset={() => {}} />);
    expect(screen.queryByTestId("state-error-code")).toBeNull();
  });
});

describe("state kit copy exists in all three locales", () => {
  const KEYS = [
    "state.loading.title",
    "state.loading.label",
    "state.empty.title",
    "state.empty.description",
    "state.error.title",
    "state.error.description",
    "state.error.code",
    "state.offline.message",
    "state.offline.lastUpdated",
    "state.partial.message",
    "state.partial.messageNoTime",
    "state.partial.refresh",
  ];
  it.each(KEYS)("%s is present, non-empty, and Arabic is Arabic", (key) => {
    for (const l of ["ar", "fr", "en"] as const) {
      expect(req(CATALOGS[l], key), `${l} ${key}`).toBeTruthy();
    }
    expect(req(CATALOGS.ar, key)).toMatch(/[\u0600-\u06FF]/);
    for (const l of ["ar", "fr", "en"] as const) {
      const params = (req(CATALOGS[l], key).match(/\{\{(\w+)\}\}/g) ?? []).sort();
      expect(params).toEqual((req(CATALOGS.en, key).match(/\{\{(\w+)\}\}/g) ?? []).sort());
    }
  });
});
