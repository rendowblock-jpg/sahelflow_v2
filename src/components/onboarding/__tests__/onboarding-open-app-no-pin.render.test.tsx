/**
 * @vitest-environment happy-dom
 */
/**
 * Founder decision, 3 Nov 2026: the PIN typed at sign-in opens the whole app. The setup checklist reads the delivery and
 * AI status through routes that used to want a PIN younger than ten minutes (OnboardingPinNotice). The server now answers
 * a signed-in seller with 200, so the checklist must show those ticks and NO PIN box, in every language, and must never
 * call POST /api/auth/reauthenticate by itself. The notice stays in the code as a safety net for an unexpected 403.
 * (Written beside onboarding-wizard-pin.render.test.tsx, which keeps pinning the safety-net behaviour.)
 */
import { act, cleanup, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { render } from "@/test-utils/render";
import ar from "@/lib/i18n/locales/ar.json";
import en from "@/lib/i18n/locales/en.json";
import fr from "@/lib/i18n/locales/fr.json";

import { OnboardingWizard } from "../onboarding-wizard";

const harness = vi.hoisted(() => ({ locale: "en" as "en" | "fr" | "ar" }));
vi.mock("@/hooks/use-i18n", async () => {
  const tables: Record<string, Record<string, string>> = {
    ar: (await import("@/lib/i18n/locales/ar.json")).default,
    fr: (await import("@/lib/i18n/locales/fr.json")).default,
    en: (await import("@/lib/i18n/locales/en.json")).default,
  };
  const { getRuntimeTranslation } = await import("@/lib/i18n/runtime-translations");
  const cache: Record<string, (key: string) => string> = {};
  const stable = (locale: "en" | "fr" | "ar") =>
    (cache[locale] ??= (key: string) => tables[locale]?.[key] ?? getRuntimeTranslation(locale, key) ?? key);
  return { useI18n: () => ({ t: stable(harness.locale), locale: harness.locale, dir: harness.locale === "ar" ? "rtl" : "ltr" }) };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/components/onboarding/flagship-loop-explainer", () => ({ FlagshipLoopExplainer: () => null }));
vi.mock("@/components/onboarding/onboarding-pairing-panel", () => ({ OnboardingPairingPanel: () => null }));
vi.mock("@/components/onboarding/chatgpt-onboarding-option", () => ({ OnboardingChatGptOption: () => null }));
vi.mock("@/components/settings/ai-key-panel", () => ({ AiKeyPanel: () => null }));
vi.mock("@/components/settings/delivery-credentials-panel", () => ({ DeliveryCredentialsPanel: () => null }));
vi.mock("@/components/shared/wilaya-commune-select", () => ({ WilayaCommuneSelect: () => null }));

const fetchMock = vi.fn();
const access = { aiKey: false, aiConsent: false, delivery: false };
const reply = (status: number, body: unknown) =>
  Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Promise<Response>;
const REAUTH = { code: "REAUTHENTICATION_REQUIRED", error: "Recent PIN verification is required" };
const tables = { en, fr, ar } as const;

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}
async function mount() {
  render(<OnboardingWizard access={access} />);
  await flush();
}
/** What the server answers the two status reads: the open app (200) or, as a control, the old window (403). */
function serverAnswers(mode: "open" | "old-window") {
  fetchMock.mockReset().mockImplementation((url: string) => {
    if (url === "/api/delivery/credentials") {
      return mode === "open" ? reply(200, { providers: { yalidine: { apiId: true, apiKey: true } } }) : reply(403, REAUTH);
    }
    if (url === "/api/secrets/gemini-key") return mode === "open" ? reply(200, { configured: true }) : reply(403, REAUTH);
    if (url === "/api/whatsapp/status") return reply(200, { status: "disconnected" });
    return reply(200, { settings: {} });
  });
}
/** Ticks in the checklist (the list is drawn twice: stepper and narrow strip, so each done item counts twice). */
const doneCount = () => document.querySelectorAll("[data-onboarding-wizard] svg.lucide-check").length;
const calledUrls = () => fetchMock.mock.calls.map((call) => call[0] as string);

beforeEach(() => {
  harness.locale = "en";
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("OnboardingWizard when the app is open (the sign-in PIN is the only PIN)", () => {
  it.each(["en", "fr", "ar"] as const)("%s: no PIN box, no PIN title, no PIN request", async (locale) => {
    harness.locale = locale;
    serverAnswers("open");
    await mount();
    const t = tables[locale] as Record<string, string>;
    expect(t["onboarding.pin.title"]).toBeTruthy();
    expect(screen.queryByText(t["onboarding.pin.title"])).toBeNull();
    expect(screen.queryByLabelText(t["auth.pinPlaceholder"])).toBeNull();
    expect(screen.queryByRole("button", { name: t["onboarding.pin.verify"] })).toBeNull();
    expect(calledUrls()).not.toContain("/api/auth/reauthenticate");
  });

  it("ticks delivery and AI straight away, on the first read", async () => {
    serverAnswers("old-window");
    await mount();
    const withoutAnswers = doneCount();
    cleanup();

    serverAnswers("open");
    await mount();
    expect(doneCount()).toBeGreaterThanOrEqual(withoutAnswers + 2);
    expect(calledUrls().filter((url) => url === "/api/delivery/credentials")).toHaveLength(1);
    expect(calledUrls().filter((url) => url === "/api/secrets/gemini-key")).toHaveLength(1);
  });

  it("control: the detector is real, the old 403 answer still shows the notice (safety net kept, unreachable now)", async () => {
    serverAnswers("old-window");
    await mount();
    expect(screen.getByText(en["onboarding.pin.title"])).toBeInTheDocument();
    expect(screen.getByLabelText(en["auth.pinPlaceholder"])).toBeInTheDocument();
  });
});
