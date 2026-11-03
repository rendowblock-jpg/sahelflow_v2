/**
 * @vitest-environment happy-dom
 */
/**
 * F-0012: when the checklist cannot read the delivery and AI status because the PIN confirmation is older than ten
 * minutes, the seller is asked for the PIN here instead of being shown "not configured".
 */
import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { render } from "@/test-utils/render";

import { OnboardingPinNotice } from "../onboarding-pin-notice";

const harness = vi.hoisted(() => ({ locale: "en" as "en" | "fr" | "ar" }));
vi.mock("@/hooks/use-i18n", async () => {
  const tables: Record<string, Record<string, string>> = {
    ar: (await import("@/lib/i18n/locales/ar.json")).default,
    fr: (await import("@/lib/i18n/locales/fr.json")).default,
    en: (await import("@/lib/i18n/locales/en.json")).default,
  };
  const cache: Record<string, (key: string) => string> = {};
  const stable = (locale: "en" | "fr" | "ar") => (cache[locale] ??= (key: string) => tables[locale]?.[key] ?? key);
  return { useI18n: () => ({ t: stable(harness.locale), locale: harness.locale, dir: harness.locale === "ar" ? "rtl" : "ltr" }) };
});

const fetchMock = vi.fn();
const reply = (status: number, body: unknown = {}) =>
  Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body } as Response);
async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}
const pinField = () => screen.getByLabelText("Enter your PIN") as HTMLInputElement;

afterEach(() => {
  harness.locale = "en";
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

function setup(onConfirmed = vi.fn(async () => undefined)) {
  vi.stubGlobal("fetch", fetchMock);
  render(<OnboardingPinNotice onConfirmed={onConfirmed} />);
  return onConfirmed;
}

describe("OnboardingPinNotice", () => {
  it("says what it needs and why, with a named password field and a disabled button until a PIN is typed", () => {
    setup();
    expect(screen.getByText("Confirm your PIN to check delivery and AI status")).toBeTruthy();
    expect(screen.getByText(/saved delivery and AI keys are only checked after a recent PIN confirmation/)).toBeTruthy();
    expect(pinField().type).toBe("password");
    expect(pinField().getAttribute("autocomplete")).toBe("current-password");
    expect((screen.getByRole("button", { name: "Confirm" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("posts the PIN, clears the field and asks the wizard to read the status again", async () => {
    fetchMock.mockImplementation(() => reply(200, { ok: true }));
    const onConfirmed = setup();
    fireEvent.change(pinField(), { target: { value: "24681357" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/auth/reauthenticate");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ pin: "24681357" });
    expect(onConfirmed).toHaveBeenCalledTimes(1);
    expect(pinField().value).toBe("");
  });

  it("shows the wrong-PIN sentence on 401 and the locked sentence on 429, and does not refresh", async () => {
    const onConfirmed = setup();
    fetchMock.mockImplementationOnce(() => reply(401, { error: "Incorrect PIN", code: "INVALID_CREDENTIALS" }));
    fireEvent.change(pinField(), { target: { value: "00000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await flush();
    expect(screen.getByRole("alert").textContent).toBe("Incorrect PIN.");
    fetchMock.mockImplementationOnce(() => reply(429, {}));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await flush();
    expect(screen.getByRole("alert").textContent).toBe("Too many attempts. Wait a moment, then try again.");
    expect(onConfirmed).not.toHaveBeenCalled();
  });

  it("says the session expired, not wrong PIN, when the server answers 401 UNAUTHORIZED (F-0023)", async () => {
    const onConfirmed = setup();
    fetchMock.mockImplementationOnce(() => reply(401, { error: "Unauthorized", code: "UNAUTHORIZED" }));
    fireEvent.change(pinField(), { target: { value: "24681357" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await flush();
    expect(screen.getByRole("alert").textContent).toBe("Your session expired. Sign in again.");
    expect(screen.getByRole("link", { name: "Sign in again." }).getAttribute("href")).toBe("/login");
    expect(onConfirmed).not.toHaveBeenCalled();
  });

  it("says it could not confirm when the request itself fails", async () => {
    const onConfirmed = setup();
    fetchMock.mockImplementationOnce(() => Promise.reject(new Error("offline")));
    fireEvent.change(pinField(), { target: { value: "24681357" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await flush();
    expect(screen.getByRole("alert").textContent).toBe("Could not confirm the PIN. Try again.");
    expect(onConfirmed).not.toHaveBeenCalled();
  });

  it("speaks French and Arabic with the same structure", () => {
    harness.locale = "fr";
    setup();
    expect(screen.getByText("Confirmez votre code PIN pour vérifier l'état de la livraison et de l'IA")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Confirmer" })).toBeTruthy();
  });

  it("speaks Arabic", () => {
    harness.locale = "ar";
    setup();
    expect(screen.getByText("أكّد رمز PIN للتحقق من حالة التوصيل والذكاء الاصطناعي")).toBeTruthy();
    expect(screen.getByRole("button", { name: "تأكيد" })).toBeTruthy();
  });
});
