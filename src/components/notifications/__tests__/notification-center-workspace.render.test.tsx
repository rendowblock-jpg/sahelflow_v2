/**
 * @vitest-environment happy-dom
 */
/**
 * Notifications page, three states without a network: loading (a skeleton with the SHAPE of a notification row),
 * empty (says it is caught up), error (calm text, Retry, no raw server message).
 */
import { fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { render } from "@/test-utils/render";
import en from "@/lib/i18n/locales/en.json";
import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";

import { NotificationCenterWorkspace } from "../notification-center-workspace";

/** English text of a key, from the same sources the app reads. */
const T = (key: string): string => (en as Record<string, string>)[key] ?? getRuntimeTranslation("en", key) ?? key;

const harness = vi.hoisted(() => ({ locale: "en" as "en" | "fr" | "ar" }));
vi.mock("@/hooks/use-i18n", async () => {
  const tables: Record<string, Record<string, string>> = {
    ar: (await import("@/lib/i18n/locales/ar.json")).default,
    fr: (await import("@/lib/i18n/locales/fr.json")).default,
    en: (await import("@/lib/i18n/locales/en.json")).default,
  };
  const { getRuntimeTranslation } = await import("@/lib/i18n/runtime-translations");
  return {
    useI18n: () => ({
      t: (key: string) => tables[harness.locale]?.[key] ?? getRuntimeTranslation(harness.locale, key) ?? key,
      locale: harness.locale,
      dir: harness.locale === "ar" ? "rtl" : "ltr",
    }),
  };
});
const feed = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  mutate: vi.fn(),
}));
vi.mock("@/hooks/use-notification-center", () => ({
  useNotificationFeed: () => feed.state,
  dismissNotification: vi.fn(),
}));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/components/notifications/notification-preferences-panel", () => ({ NotificationPreferencesPanel: () => null }));
vi.mock("@/components/system", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/system")>()),
  PageShell: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section>
      <h1>{title}</h1>
      {children}
    </section>
  ),
}));

function setFeed(patch: Record<string, unknown>) {
  feed.state = {
    notifications: [],
    unreadCount: 0,
    nextCursor: null,
    preference: null,
    isLoading: false,
    error: undefined,
    mutate: feed.mutate,
    ...patch,
  };
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }) as unknown as Response));
  harness.locale = "en";
  feed.mutate.mockReset();
});

describe("NotificationCenterWorkspace", () => {
  it("loading: six rows shaped like a notification (icon tile + title line + detail line)", () => {
    setFeed({ isLoading: true });
    render(<NotificationCenterWorkspace />);
    const region = screen.getByRole("status", { name: T("notifications.loading") });
    expect(region).toHaveAttribute("aria-busy", "true");
    expect(region.children).toHaveLength(6);
    for (const row of Array.from(region.children)) {
      expect(row.querySelector(".size-9")).not.toBeNull();
      expect(row.querySelectorAll(".h-4, .h-3")).toHaveLength(2);
    }
  });

  it("empty: says the seller is caught up", () => {
    setFeed({});
    render(<NotificationCenterWorkspace />);
    expect(screen.getByText(T("notifications.allCaughtUp"))).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: /Loading/ })).toBeNull();
  });

  it("error: calm text and Retry; the raw server message never reaches the seller", () => {
    setFeed({ error: new Error("SQLITE_BUSY: database is locked (code 5)") });
    render(<NotificationCenterWorkspace />);
    const box = screen.getByTestId("notifications-error");
    expect(box).toHaveTextContent("Your data is safe; try again.");
    expect(box.textContent).not.toContain("SQLITE_BUSY");
    fireEvent.click(screen.getByRole("button", { name: T("common.retry") }));
    expect(feed.mutate).toHaveBeenCalledTimes(1);
  });

  it("error in Arabic", () => {
    harness.locale = "ar";
    setFeed({ error: new Error("SQLITE_BUSY") });
    render(<NotificationCenterWorkspace />);
    expect(screen.getByTestId("notifications-error").textContent).toContain("تعذر تحميل الإشعارات");
  });
});

afterEach(() => vi.unstubAllGlobals());
