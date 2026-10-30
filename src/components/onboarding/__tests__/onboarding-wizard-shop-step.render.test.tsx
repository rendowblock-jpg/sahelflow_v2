/**
 * @vitest-environment happy-dom
 */
/**
 * Onboarding, step 1 (shop): pressing Next with something wrong puts the cursor on the field to fix, marks it
 * aria-invalid and links it to the sentence that says what is wrong (same behaviour as setup and login).
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
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}
async function mount() {
  render(<OnboardingWizard access={access} />);
  await flush();
}
const field = (id: string) => document.getElementById(id) as HTMLInputElement;

beforeEach(() => {
  harness.locale = "en";
  fetchMock.mockReset().mockImplementation(async () => ({ ok: true, status: 200, json: async () => ({ settings: {} }) }) as unknown as Response);
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("OnboardingWizard shop step errors", () => {
  it("empty shop name + Next: focus on the name, aria-invalid, linked sentence, nothing saved", async () => {
    await mount();
    fireEvent.click(screen.getByRole("button", { name: /^Next/ }));
    await flush();
    expect(document.activeElement).toBe(field("biz-name"));
    expect(field("biz-name")).toHaveAttribute("aria-invalid", "true");
    expect(field("biz-name")).toHaveAttribute("aria-describedby", "form-error");
    expect(document.getElementById("form-error")).toHaveTextContent("Enter your shop name to continue.");
    expect(fetchMock.mock.calls.some((call) => (call[1] as { method?: string } | undefined)?.method === "PUT")).toBe(false);
  });

  it("invalid phone + Next: focus on the phone, aria-invalid, described by the phone sentence", async () => {
    await mount();
    fireEvent.change(field("biz-name"), { target: { value: "متجر الأمل" } });
    fireEvent.change(field("biz-phone"), { target: { value: "0555" } });
    fireEvent.click(screen.getByRole("button", { name: /^Next/ }));
    await flush();
    expect(document.activeElement).toBe(field("biz-phone"));
    expect(field("biz-phone")).toHaveAttribute("aria-invalid", "true");
    const describedBy = field("biz-phone").getAttribute("aria-describedby") ?? "";
    expect(document.getElementById(describedBy)).toHaveTextContent("valid Algerian mobile number");
  });

  it("typing in the name clears the error", async () => {
    await mount();
    fireEvent.click(screen.getByRole("button", { name: /^Next/ }));
    await flush();
    fireEvent.change(field("biz-name"), { target: { value: "م" } });
    expect(field("biz-name")).not.toHaveAttribute("aria-invalid");
    expect(document.getElementById("form-error")).toBeNull();
  });

  it("says it in Arabic", async () => {
    harness.locale = "ar";
    await mount();
    fireEvent.click(screen.getAllByRole("button").find((b) => b.querySelector(".icon-rtl-flip")) as HTMLElement);
    await flush();
    expect(document.getElementById("form-error")?.textContent).toMatch(/[\u0600-\u06FF]/);
    expect(document.activeElement).toBe(field("biz-name"));
  });
});
