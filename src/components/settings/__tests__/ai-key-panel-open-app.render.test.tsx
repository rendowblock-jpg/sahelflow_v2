/**
 * @vitest-environment happy-dom
 */
/**
 * Founder decision, 3 Nov 2026: "I don't want him to enter a PIN again at any place ... the function of entering the PIN
 * when he is entering the AI credentials." The server now answers a signed-in seller's key reads and saves with 200, so
 * Settings > AI keys must go from opening the page to saving a key with NO PIN box and NO call to
 * POST /api/auth/reauthenticate. The panel's PIN code stays as a safety net for an unexpected 403 (the control below).
 */
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { render } from "@/test-utils/render";
import ar from "@/lib/i18n/locales/ar.json";
import en from "@/lib/i18n/locales/en.json";
import fr from "@/lib/i18n/locales/fr.json";

import { AiKeyPanel } from "../ai-key-panel";

const harness = vi.hoisted(() => ({ locale: "en" as "en" | "fr" | "ar" }));
vi.mock("@/hooks/use-i18n", async () => {
  const { renderTranslation } = await import("@/lib/i18n");
  const tables: Record<string, Record<string, string>> = {
    ar: (await import("@/lib/i18n/locales/ar.json")).default,
    fr: (await import("@/lib/i18n/locales/fr.json")).default,
    en: (await import("@/lib/i18n/locales/en.json")).default,
  };
  const cache: Record<string, (key: string, params?: Record<string, string | number>) => string> = {};
  const stable = (locale: "en" | "fr" | "ar") =>
    (cache[locale] ??= (key, params) => renderTranslation(tables[locale]?.[key] ?? key, params, locale));
  return {
    useI18n: () => ({ t: stable(harness.locale), locale: harness.locale, dir: harness.locale === "ar" ? "rtl" : "ltr" }),
  };
});

const tables = { en, fr, ar } as const;
const fetchMock = vi.fn();
type Reply = { status: number; body: unknown };
const respond = ({ status, body }: Reply) =>
  Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body } as Response);

let statusReply: Reply;
let saveReply: Reply;

beforeEach(() => {
  harness.locale = "en";
  fetchMock.mockReset();
  statusReply = { status: 200, body: { configured: false } };
  saveReply = { status: 200, body: { ok: true, model: "gemini-test", message: "Key saved." } };
  fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url === "/api/secrets/gemini-key" && method === "GET") return respond(statusReply);
    if (url === "/api/secrets/gemini-key" && method === "POST") return respond(saveReply);
    if (url === "/api/settings" && method === "GET") return respond({ status: 200, body: { settings: {} } });
    throw new Error(`unexpected request ${method} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const reauthCalls = () => fetchMock.mock.calls.filter(([url]) => String(url) === "/api/auth/reauthenticate");
const pinBoxes = (locale: "en" | "fr" | "ar") => {
  const t = tables[locale] as Record<string, string>;
  return screen.queryAllByLabelText(t["auth.pinPlaceholder"]);
};

describe("Settings > AI keys when the app is open", () => {
  it.each(["en", "fr", "ar"] as const)("%s: opening the page shows the key field and no PIN box", async (locale) => {
    harness.locale = locale;
    render(<AiKeyPanel canManageKey canManageConsent />);
    // The key field (id "gemini-key"), found by id so the check is the same in every language.
    await waitFor(() => expect(document.getElementById("gemini-key")).not.toBeNull());
    expect(pinBoxes(locale)).toHaveLength(0);
    expect(reauthCalls()).toHaveLength(0);
  });

  it("saving a key goes straight through: key saved, no PIN box, no PIN request", async () => {
    render(<AiKeyPanel canManageKey canManageConsent />);
    fireEvent.change(await screen.findByLabelText("API key"), { target: { value: "AIza-test-key" } });
    fireEvent.click(screen.getByRole("button", { name: "Test and save" }));
    expect(await screen.findByText("Key saved.")).toBeInTheDocument();
    expect(pinBoxes("en")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Verify PIN" })).toBeNull();
    expect(reauthCalls()).toHaveLength(0);
    const saves = fetchMock.mock.calls.filter(
      ([url, init]) => String(url) === "/api/secrets/gemini-key" && (init as RequestInit | undefined)?.method === "POST",
    );
    expect(saves).toHaveLength(1);
  });

  it("an already saved key opens as Configured with no PIN box", async () => {
    statusReply = { status: 200, body: { configured: true } };
    render(<AiKeyPanel canManageKey canManageConsent />);
    expect(await screen.findByText("Configured")).toBeInTheDocument();
    expect(pinBoxes("en")).toHaveLength(0);
    expect(reauthCalls()).toHaveLength(0);
  });

  it("control: the old 403 answer still shows the PIN box (safety net kept, unreachable now)", async () => {
    statusReply = { status: 403, body: { error: "Recent PIN verification is required", code: "REAUTHENTICATION_REQUIRED" } };
    render(<AiKeyPanel canManageKey canManageConsent />);
    expect(await screen.findByLabelText("Enter your PIN")).toBeInTheDocument();
  });
});
