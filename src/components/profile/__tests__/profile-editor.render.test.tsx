/**
 * @vitest-environment happy-dom
 */
/**
 * Profile editor (the Account area of Settings): loading skeleton, load failure with Retry, and a loaded profile
 * with an Arabic name and an Algerian phone shown masked. Network mocked.
 */
import { fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { render } from "@/test-utils/render";
import en from "@/lib/i18n/locales/en.json";
import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";

import { ProfileEditor } from "../profile-editor";

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
  // One stable t per locale, like the real hook: the editor's load effect depends on it. An unstable t made the effect
  // fetch again after every render, and after the test ended the fetch was the real one (ECONNREFUSED ::1:3000).
  const cache: Record<string, (key: string) => string> = {};
  const stable = (locale: "en" | "fr" | "ar") => (cache[locale] ??= (key: string) => tables[locale]?.[key] ?? getRuntimeTranslation(locale, key) ?? key);
  return {
    useI18n: () => ({
      t: stable(harness.locale),
      locale: harness.locale,
      dir: harness.locale === "ar" ? "rtl" : "ltr",
    }),
  };
});
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/components/shared/photo-upload", () => ({ PhotoUpload: () => null }));

const fetchMock = vi.fn();
function json(status: number, body: unknown) {
  return { ok: status < 400, status, json: async () => body } as unknown as Response;
}

beforeEach(() => {
  harness.locale = "en";
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("ProfileEditor", () => {
  it("loading: a named status region while the profile is fetched", () => {
    fetchMock.mockImplementation(() => new Promise(() => undefined));
    render(<ProfileEditor canManage />);
    expect(screen.getByRole("status", { name: T("common.loading") })).toBeInTheDocument();
  });

  it("error: says what failed, offers Retry, and Retry asks again", async () => {
    let failing = true;
    fetchMock.mockImplementation(async () =>
      failing ? json(500, { error: "Request failed (500)" }) : json(200, { name: "أمينة بن علي", phone: "0555123456" }),
    );
    render(<ProfileEditor canManage />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    const callsBefore = fetchMock.mock.calls.length;
    failing = false;
    fireEvent.click(screen.getByRole("button", { name: T("common.retry") }));
    expect(await screen.findByDisplayValue("أمينة بن علي")).toBeInTheDocument();
    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it("loaded: Arabic name and the phone masked the way every Algerian phone field shows it", async () => {
    fetchMock.mockResolvedValue(json(200, { name: "أمينة بن علي", phone: "0555123456", email: "amina@example.dz" }));
    render(<ProfileEditor canManage />);
    expect(await screen.findByDisplayValue("أمينة بن علي")).toBeInTheDocument();
    expect(screen.getByDisplayValue("05 55 12 34 56")).toBeInTheDocument();
    expect(screen.getByDisplayValue("amina@example.dz")).toBeInTheDocument();
  });
});
