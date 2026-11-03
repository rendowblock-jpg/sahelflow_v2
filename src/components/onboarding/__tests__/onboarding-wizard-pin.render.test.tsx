/**
 * @vitest-environment happy-dom
 */
/**
 * F-0012: the delivery and AI ticks come from two reads that need a PIN confirmation younger than ten minutes. When
 * they answer 403 REAUTHENTICATION_REQUIRED the wizard asks for the PIN; it does not treat them as "not configured".
 */
import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { render } from "@/test-utils/render";

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
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}
async function mount() {
  render(<OnboardingWizard access={access} />);
  await flush();
}
/** What the server says right now: `pinFresh` flips when the seller confirms the PIN. */
const server = { pinFresh: false };
function route(url: string): Promise<Response> {
  if (url === "/api/auth/reauthenticate") {
    server.pinFresh = true;
    return reply(200, { ok: true });
  }
  if (url === "/api/delivery/credentials") {
    return server.pinFresh ? reply(200, { providers: { yalidine: { apiId: true, apiKey: true } } }) : reply(403, REAUTH);
  }
  if (url === "/api/secrets/gemini-key") {
    return server.pinFresh ? reply(200, { configured: true }) : reply(403, REAUTH);
  }
  if (url === "/api/whatsapp/status") return reply(200, { status: "disconnected" });
  return reply(200, { settings: {} });
}
/** Ticks in the checklist (the list is drawn twice: stepper and narrow strip, so each done item counts twice). */
const doneCount = () => document.querySelectorAll("[data-onboarding-wizard] svg.lucide-check").length;

beforeEach(() => {
  harness.locale = "en";
  server.pinFresh = false;
  fetchMock.mockReset().mockImplementation((url: string) => route(url));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("OnboardingWizard: delivery and AI status behind the PIN window", () => {
  it("asks for the PIN when both reads answer 403 REAUTHENTICATION_REQUIRED", async () => {
    await mount();
    expect(screen.getByText("Confirm your PIN to check delivery and AI status")).toBeInTheDocument();
  });

  it("does not ask when the reads answer", async () => {
    server.pinFresh = true;
    await mount();
    expect(screen.queryByText("Confirm your PIN to check delivery and AI status")).toBeNull();
  });

  it("after a good PIN the status is read again, the notice goes away and delivery and AI are ticked", async () => {
    await mount();
    const before = doneCount();
    fireEvent.change(screen.getByLabelText("Enter your PIN"), { target: { value: "24681357" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await flush();
    await flush();
    expect(screen.queryByText("Confirm your PIN to check delivery and AI status")).toBeNull();
    expect(doneCount()).toBeGreaterThanOrEqual(before + 2);
    const urls = fetchMock.mock.calls.map((call) => call[0] as string);
    expect(urls.filter((url) => url === "/api/delivery/credentials").length).toBeGreaterThanOrEqual(2);
  });

  it("a 403 that is not a PIN request does not show the PIN notice", async () => {
    fetchMock.mockImplementation((url: string) =>
      url === "/api/delivery/credentials" || url === "/api/secrets/gemini-key" ? reply(403, { code: "FORBIDDEN" }) : route(url),
    );
    await mount();
    expect(screen.queryByText("Confirm your PIN to check delivery and AI status")).toBeNull();
  });
});
