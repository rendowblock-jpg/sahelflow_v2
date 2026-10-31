/**
 * @vitest-environment happy-dom
 */
/**
 * Automations, the places a seller lands when something is wrong:
 * - a failed run offers "Pause this automation" next to Retry (the same PATCH
 *   the card's switch sends, nothing new on the server);
 * - /automations/[id] for an id that does not exist says so calmly and links
 *   back to the list (ar, fr, en);
 * - the builder routes show a builder-shaped skeleton, not the list skeleton.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AutomationNotFound from "@/app/(dashboard)/automations/[id]/not-found";
import { AutomationBuilderSkeleton } from "@/components/automations/automation-builder-skeleton";
import {
  AutomationRunRecoveryPanel,
  type AutomationRunHistoryView,
} from "@/components/automations/automation-run-recovery-panel";
import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";
import { render } from "@/test-utils/render";

const h = vi.hoisted(() => ({
  locale: "en" as "en" | "fr" | "ar",
  refresh: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: h.refresh }) }));
vi.mock("@/lib/toast", () => ({ toast: { success: h.toastSuccess, error: h.toastError } }));
vi.mock("@/hooks/use-i18n", async () => {
  const { getRuntimeTranslation: rt } = await import("@/lib/i18n/runtime-translations");
  return {
    useI18n: () => ({
      locale: h.locale,
      t: (key: string, params?: Record<string, string | number>) =>
        (rt(h.locale, key) ?? key).replace(/\{\{(\w+)\}\}/g, (_m, k: string) => String(params?.[k] ?? "")),
    }),
  };
});
vi.mock("@/lib/i18n-server", async () => {
  const { getRuntimeTranslation: rt } = await import("@/lib/i18n/runtime-translations");
  return {
    getI18n: async () => ({
      locale: h.locale,
      dir: h.locale === "ar" ? "rtl" : "ltr",
      t: (key: string) => rt(h.locale, key) ?? key,
    }),
  };
});

beforeEach(() => {
  h.locale = "en";
  h.refresh.mockReset();
  h.toastError.mockReset();
  h.toastSuccess.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const run = (over: Partial<AutomationRunHistoryView>): AutomationRunHistoryView => ({
  id: "run-1",
  automationId: "auto-1",
  automationName: "Confirmer la commande de Yacine",
  triggerType: "order_created",
  status: "failed",
  stepCount: 2,
  succeededStepCount: 1,
  failedStepCount: 1,
  skippedStepCount: 0,
  operatorRetryCount: 0,
  nextAttemptAt: null,
  lastErrorCode: "WHATSAPP_ACCOUNT_UNAVAILABLE",
  createdAt: "2026-10-30T09:15:00.000Z",
  recoverable: true,
  recoveryBlockCode: null,
  steps: [],
  ...over,
});

const openRun = () => fireEvent.click(screen.getAllByRole("button", { expanded: false })[0]!);

describe("failed run: pause exit", () => {
  it("offers Pause next to Retry and sends the card's PATCH { isActive: false }", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true }) as Response);
    vi.stubGlobal("fetch", fetchMock);
    render(<AutomationRunRecoveryPanel initialRuns={[run({})]} activeAutomationIds={["auto-1"]} />);
    openRun();
    const hold = screen.getByTestId("run-hold");
    expect(hold.textContent).toMatch(/Pause this automation/);
    fireEvent.click(hold);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/automations/auto-1");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(String(init.body))).toEqual({ isActive: false });
    await waitFor(() => expect(h.refresh).toHaveBeenCalled());
    expect(screen.queryByTestId("run-hold")).toBeNull();
  });

  it("does not offer Pause when the automation is already paused or the run has no automation id", () => {
    render(<AutomationRunRecoveryPanel initialRuns={[run({})]} activeAutomationIds={[]} />);
    openRun();
    expect(screen.queryByTestId("run-hold")).toBeNull();
    cleanup();
    render(<AutomationRunRecoveryPanel initialRuns={[run({ automationId: undefined })]} activeAutomationIds={["auto-1"]} />);
    openRun();
    expect(screen.queryByTestId("run-hold")).toBeNull();
  });

  it("keeps the button and says so when the server refuses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false }) as Response));
    render(<AutomationRunRecoveryPanel initialRuns={[run({})]} activeAutomationIds={["auto-1"]} />);
    openRun();
    fireEvent.click(screen.getByTestId("run-hold"));
    await waitFor(() => expect(h.toastError).toHaveBeenCalledTimes(1));
    expect(String(h.toastError.mock.calls[0]?.[0])).toMatch(/Could not pause/);
    expect(screen.getByTestId("run-hold")).toBeTruthy();
    expect(h.refresh).not.toHaveBeenCalled();
  });

  it("has the same words in ar, fr and en", () => {
    for (const locale of ["ar", "fr", "en"] as const) {
      for (const key of ["automations.hold", "automations.holdFailed", "automations.notFound.title", "automations.notFound.message", "automations.notFound.back"]) {
        expect(getRuntimeTranslation(locale, key), `${locale} ${key}`).toBeTruthy();
      }
    }
  });
});

describe("automation not found", () => {
  for (const [locale, back] of [["en", /Back to automations/], ["fr", /Retour aux automatisations/], ["ar", /العودة إلى الأتمتة/]] as const) {
    it(`says so calmly and links back to the list (${locale})`, async () => {
      h.locale = locale;
      render(await AutomationNotFound());
      const link = screen.getByRole("link", { name: back });
      expect(link.getAttribute("href")).toBe("/automations");
      expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(getRuntimeTranslation(locale, "automations.notFound.title"));
      expect(document.body.textContent).not.toMatch(/404|error|exception/i);
    });
  }
});

describe("builder routes while loading", () => {
  it("is one polite busy status shaped like the builder: a canvas of steps and a side panel, no table", () => {
    const { container } = render(<AutomationBuilderSkeleton />);
    const shell = screen.getByRole("status");
    expect(shell.getAttribute("aria-busy")).toBe("true");
    expect(container.querySelectorAll("[data-skeleton-step]").length).toBeGreaterThanOrEqual(3);
    expect(container.querySelector("[data-skeleton-side]")).toBeTruthy();
    expect(container.querySelector("table")).toBeNull();
  });

  it("[id] and /new use it instead of the parent's list skeleton", () => {
    const root = join(process.cwd(), "src/app/(dashboard)/automations");
    for (const dir of ["[id]", "new"]) {
      const source = readFileSync(join(root, dir, "loading.tsx"), "utf8");
      expect(source, dir).toMatch(/AutomationBuilderSkeleton/);
      expect(source, dir).not.toMatch(/FullPageSkeleton/);
    }
  });
});
