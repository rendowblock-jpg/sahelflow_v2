/**
 * @vitest-environment happy-dom
 */
/**
 * The /notifications ROUTE loading screen (loading.tsx) used to be the generic FullPageSkeleton. It must show the page header
 * and the same row-shaped skeleton the component shows while its feed loads: an icon block and two text lines per row.
 */
import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Loading from "@/app/(dashboard)/notifications/loading";
import { render } from "@/test-utils/render";

import { NotificationRowsSkeleton } from "../notification-center-workspace";

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
vi.mock("@/hooks/use-notification-center", () => ({
  useNotificationFeed: () => ({}),
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

beforeEach(() => {
  harness.locale = "en";
});

function expectRowShape(status: HTMLElement, rows: number) {
  expect(status).toHaveAttribute("aria-busy", "true");
  expect(status.children).toHaveLength(rows);
  for (const row of Array.from(status.children)) {
    // icon block + a column with two text lines
    expect(row.children).toHaveLength(2);
    expect(row.children[1]?.children).toHaveLength(2);
  }
}

describe("notifications route loading screen", () => {
  it("shows the page title and 6 notification-shaped rows, not the generic page skeleton", () => {
    render(<Loading />);
    expect(screen.getByRole("heading", { name: "Notifications" })).toBeInTheDocument();
    expectRowShape(screen.getByRole("status", { name: "Loading..." }), 6);
  });

  it("says it in Arabic too", () => {
    harness.locale = "ar";
    render(<Loading />);
    expect(screen.getByRole("heading").textContent).toMatch(/[\u0600-\u06FF]/);
    expect(screen.getByRole("status").getAttribute("aria-label")).toMatch(/[\u0600-\u06FF]/);
  });

  it("the exported rows skeleton takes its label and row count", () => {
    render(<NotificationRowsSkeleton label="Chargement" rows={3} />);
    expectRowShape(screen.getByRole("status", { name: "Chargement" }), 3);
  });
});
