/**
 * @vitest-environment happy-dom
 */
/**
 * Onboarding step "WhatsApp" when the WhatsApp helper is OFF (the status route answers 503). The seller must see a
 * calm "not connected yet, you can do this later" card, no red alert, no error toast, no console error, and the
 * page must not hammer the helper once per second.
 */
import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { render } from "@/test-utils/render";

import { OnboardingPairingPanel } from "../onboarding-pairing-panel";

const harness = vi.hoisted(() => ({ locale: "en" as "en" | "fr" | "ar", toastError: vi.fn() }));
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
vi.mock("@/lib/toast", () => ({ toast: { error: harness.toastError, success: vi.fn() } }));
vi.mock("@/components/inbox/whatsapp-unofficial-notice", () => ({ WhatsAppUnofficialNotice: () => null }));

const fetchMock = vi.fn();
const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

/** A plain object, not `new Response`: a real body stream needs real timers and would stall under fake ones. */
function helperOff(): Response {
  const body = { status: "disconnected", user: null, hasQr: false, sidecarReachable: false };
  return { ok: false, status: 503, json: async () => body } as unknown as Response;
}

async function settle(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  harness.locale = "en";
  harness.toastError.mockClear();
  consoleError.mockClear();
  fetchMock.mockReset().mockImplementation(async () => helperOff());
  vi.stubGlobal("fetch", fetchMock);
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("OnboardingPairingPanel with the WhatsApp helper off", () => {
  it("shows a calm 'not connected yet, do it later' card and no alarm", async () => {
    render(<OnboardingPairingPanel />);
    await settle(50);
    const card = screen.getByRole("status");
    expect(card).toHaveTextContent("WhatsApp is not connected yet");
    expect(card).toHaveTextContent("You can connect it later from the Inbox");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(harness.toastError).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    expect(card.querySelector(".text-destructive")).toBeNull();
  });

  it("says it in Arabic too", async () => {
    harness.locale = "ar";
    render(<OnboardingPairingPanel />);
    await settle(50);
    expect(screen.getByRole("status").textContent).toContain("واتساب غير مرتبط بعد");
  });

  it("slows the polling down while the helper is unreachable (no 1 request per second)", async () => {
    render(<OnboardingPairingPanel />);
    await settle(200);
    fetchMock.mockClear();
    await settle(10_000);
    expect(fetchMock).not.toHaveBeenCalled();
    await settle(10_000);
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it("'Check again' asks the status route again and never starts a pairing", async () => {
    render(<OnboardingPairingPanel />);
    await settle(200);
    fetchMock.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    await settle(10);
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls).toEqual(["/api/whatsapp/status"]);
  });
});
