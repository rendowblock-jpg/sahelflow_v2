/**
 * @vitest-environment happy-dom
 */
/**
 * Profile editor, loading fails: the seller sees a calm sentence in his language and a Retry button, never the server's
 * own English text (a database or framework message), and Retry loads the profile.
 */
import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { render } from "@/test-utils/render";

import { ProfileEditor } from "../profile-editor";

const harness = vi.hoisted(() => ({ locale: "en" as "en" | "fr" | "ar" }));
vi.mock("@/hooks/use-i18n", async () => {
  const tables: Record<string, Record<string, string>> = {
    ar: (await import("@/lib/i18n/locales/ar.json")).default,
    fr: (await import("@/lib/i18n/locales/fr.json")).default,
    en: (await import("@/lib/i18n/locales/en.json")).default,
  };
  const { getRuntimeTranslation } = await import("@/lib/i18n/runtime-translations");
  // One stable t per locale, like the real hook: the editor's effect depends on it.
  const cache: Record<string, (key: string) => string> = {};
  const stable = (locale: "en" | "fr" | "ar") =>
    (cache[locale] ??= (key: string) => tables[locale]?.[key] ?? getRuntimeTranslation(locale, key) ?? key);
  return {
    useI18n: () => ({
      t: stable(harness.locale),
      locale: harness.locale,
      dir: harness.locale === "ar" ? "rtl" : "ltr",
    }),
  };
});
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const fetchMock = vi.fn();
const RAW = "Prisma exploded: P2002 unique constraint failed on the fields: (`phone`)";
const reply = (ok: boolean, body: unknown) => ({ ok, status: ok ? 200 : 500, json: async () => body }) as unknown as Response;

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  harness.locale = "en";
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("ProfileEditor when the profile cannot be loaded", () => {
  it("maps a server error through translateServerError: no raw text, Retry offered", async () => {
    fetchMock.mockResolvedValue(reply(false, { error: RAW }));
    render(<ProfileEditor canManage />);
    await flush();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).not.toContain("Prisma");
    expect(alert.textContent).not.toContain("P2002");
    expect(alert).toHaveTextContent("Something went wrong on our side");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("does not show a network exception's text either", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<ProfileEditor canManage />);
    await flush();
    expect(screen.getByRole("alert").textContent).not.toContain("Failed to fetch");
  });

  it("says it in Arabic", async () => {
    harness.locale = "ar";
    fetchMock.mockResolvedValue(reply(false, { error: RAW }));
    render(<ProfileEditor canManage />);
    await flush();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toMatch(/[\u0600-\u06FF]/);
    expect(alert.textContent).not.toContain("Prisma");
  });

  it("Retry loads the profile", async () => {
    fetchMock.mockResolvedValueOnce(reply(false, { error: RAW }));
    fetchMock.mockResolvedValue(reply(true, { name: "Amine Benali", phone: "0555123456" }));
    render(<ProfileEditor canManage />);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await flush();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByDisplayValue("Amine Benali")).toBeInTheDocument();
  });
});
