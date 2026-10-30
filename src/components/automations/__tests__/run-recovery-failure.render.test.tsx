/**
 * @vitest-environment happy-dom
 */
/** A failed automation run says WHAT failed on the collapsed card, before the seller opens it. */
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AutomationRunRecoveryPanel,
  type AutomationRunHistoryView,
} from "@/components/automations/automation-run-recovery-panel";
import { render } from "@/test-utils/render";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/use-i18n", async () => {
  const { getRuntimeTranslation } = await import("@/lib/i18n/runtime-translations");
  return {
    useI18n: () => ({
      locale: "en",
      t: (key: string, params?: Record<string, string | number>) =>
        (getRuntimeTranslation("en", key) ?? key).replace(/\{\{(\w+)\}\}/g, (_m, k: string) => String(params?.[k] ?? "")),
    }),
  };
});
afterEach(cleanup);

const run = (over: Partial<AutomationRunHistoryView>): AutomationRunHistoryView => ({
  id: "run-1",
  automationName: "Confirmer la commande de Yacine",
  triggerType: "order_created",
  status: "failed",
  stepCount: 3,
  succeededStepCount: 1,
  failedStepCount: 1,
  skippedStepCount: 1,
  operatorRetryCount: 0,
  nextAttemptAt: null,
  lastErrorCode: "WHATSAPP_ACCOUNT_UNAVAILABLE",
  createdAt: "2026-10-30T09:15:00.000Z",
  recoverable: true,
  recoveryBlockCode: null,
  steps: [
    { id: "s1", position: 0, action: "update_order_status", failurePolicy: "stop", status: "succeeded", attemptCount: 1, operatorRetryCount: 0, nextAttemptAt: null, lastErrorCode: null, effectKey: null, effectState: null, attempts: [] },
    { id: "s2", position: 1, action: "send_whatsapp", failurePolicy: "stop", status: "failed", attemptCount: 3, operatorRetryCount: 0, nextAttemptAt: null, lastErrorCode: "WHATSAPP_ACCOUNT_UNAVAILABLE", effectKey: null, effectState: null, attempts: [] },
    { id: "s3", position: 2, action: "add_note", failurePolicy: "stop", status: "skipped", attemptCount: 0, operatorRetryCount: 0, nextAttemptAt: null, lastErrorCode: "BLOCKED_BY_FAILED_STEP", effectKey: null, effectState: null, attempts: [] },
  ],
  ...over,
});

describe("AutomationRunRecoveryPanel failed run", () => {
  it("shows the failed step and a plain reason without opening the details", () => {
    render(<AutomationRunRecoveryPanel initialRuns={[run({})]} />);
    const line = screen.getByTestId("run-failure");
    expect(line.textContent).toMatch(/Step 2/);
    expect(line.textContent).toMatch(/WhatsApp is not connected/);
    expect(line.textContent).not.toMatch(/WHATSAPP_ACCOUNT_UNAVAILABLE/);
  });
  it("keeps the Retry exit one tap away", () => {
    render(<AutomationRunRecoveryPanel initialRuns={[run({})]} />);
    fireEvent.click(screen.getAllByRole("button", { expanded: false })[0]!);
    expect(within(screen.getByTestId("run-failure").closest("[data-slot='card']") ?? document.body).getAllByRole("button").length).toBeGreaterThan(1);
  });
  it("shows nothing extra for a succeeded run", () => {
    render(<AutomationRunRecoveryPanel initialRuns={[run({ status: "succeeded", lastErrorCode: null, failedStepCount: 0, skippedStepCount: 0, recoverable: false })]} />);
    expect(screen.queryByTestId("run-failure")).toBeNull();
  });
});
