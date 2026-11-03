/**
 * @vitest-environment happy-dom
 */
/**
 * F-0023 (Founder, Internal.48, Settings > AI keys): "it asked for a PIN code; after entering the correct PIN, it said
 * the PIN was wrong and wouldn't accept it". The panel mapped every 401 to "Incorrect PIN" and guarded double
 * submission with React state only. These tests drive the real panel with a mocked network.
 */
import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { render } from "@/test-utils/render";

import { AiKeyPanel } from "../ai-key-panel";

const harness = vi.hoisted(() => ({ locale: "en" as "en" | "fr" | "ar" }));
vi.mock("@/hooks/use-i18n", async () => {
  const tables: Record<string, Record<string, string>> = {
    ar: (await import("@/lib/i18n/locales/ar.json")).default,
    fr: (await import("@/lib/i18n/locales/fr.json")).default,
    en: (await import("@/lib/i18n/locales/en.json")).default,
  };
  const cache: Record<string, (key: string) => string> = {};
  const stable = (locale: "en" | "fr" | "ar") =>
    (cache[locale] ??= (key: string) => tables[locale]?.[key] ?? key);
  return {
    useI18n: () => ({ t: stable(harness.locale), locale: harness.locale, dir: harness.locale === "ar" ? "rtl" : "ltr" }),
  };
});

const fetchMock = vi.fn();
const json = (status: number, body: unknown = {}) =>
  Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body } as Response);

let reauthReply: () => Promise<Response>;

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}
const verifyButton = () => screen.getByRole("button", { name: "Verify PIN" });
// The shadcn Alert around the PIN form is itself role="alert"; the message under the field is the <p role="alert">.
const pinMessage = () => {
  const el = screen.getAllByRole("alert").find((node) => node.tagName === "P");
  if (!el) throw new Error("no PIN message is shown");
  return el;
};
const reauthPosts = () =>
  fetchMock.mock.calls.filter(
    ([url, init]) => String(url) === "/api/auth/reauthenticate" && (init as RequestInit | undefined)?.method === "POST",
  );

async function mountNeedingPin() {
  render(<AiKeyPanel canManageKey canManageConsent />);
  // The panel reads its state from a setTimeout(0) in an effect, so wait for the PIN prompt to appear.
  const field = (await screen.findByLabelText("Enter your PIN")) as HTMLInputElement;
  fireEvent.change(field, { target: { value: "24681357" } });
}

beforeEach(() => {
  harness.locale = "en";
  fetchMock.mockReset();
  reauthReply = () => json(200, { success: true, sessionRotated: true });
  fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url === "/api/auth/reauthenticate" && method === "POST") return reauthReply();
    if (url === "/api/secrets/gemini-key" && method === "GET") {
      return json(403, { error: "Recent PIN verification is required", code: "REAUTHENTICATION_REQUIRED" });
    }
    if (url === "/api/settings" && method === "GET") return json(200, { settings: {} });
    throw new Error(`unexpected request ${method} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AiKeyPanel PIN confirmation (F-0023)", () => {
  it("sends exactly ONE reauthentication request when Verify is triggered twice before React re-renders", async () => {
    // The first call is slow (a slow PC hashing the PIN). A second request would carry the old session cookie, which the
    // first one revokes, so the server would answer 401 UNAUTHORIZED to a correct PIN.
    let release!: (response: Response) => void;
    reauthReply = () =>
      new Promise<Response>((resolve) => {
        release = resolve;
      });
    await mountNeedingPin();
    const button = verifyButton();
    await act(async () => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    expect(reauthPosts()).toHaveLength(1);
    await act(async () => {
      release({ ok: true, status: 200, json: async () => ({ success: true }) } as Response);
    });
    await flush();
    expect(reauthPosts()).toHaveLength(1);
  });

  it("says the session expired, with a way back to sign-in, when the server answers 401 UNAUTHORIZED", async () => {
    reauthReply = () => json(401, { error: "Unauthorized", code: "UNAUTHORIZED" });
    await mountNeedingPin();
    fireEvent.click(verifyButton());
    await flush();
    const alert = pinMessage();
    expect(alert.textContent).not.toContain("Incorrect PIN");
    expect(alert.textContent).toBe("Your session expired. Sign in again.");
    const link = screen.getByRole("link", { name: "Sign in again." });
    expect(link.getAttribute("href")).toBe("/login");
  });

  it("still says Incorrect PIN for a genuinely wrong PIN (401 INVALID_CREDENTIALS)", async () => {
    reauthReply = () => json(401, { error: "Incorrect PIN", code: "INVALID_CREDENTIALS" });
    await mountNeedingPin();
    fireEvent.click(verifyButton());
    await flush();
    expect(pinMessage().textContent).toBe("Incorrect PIN.");
    expect(screen.queryByRole("link", { name: "Sign in again." })).toBeNull();
  });

  it("says too many attempts on 429", async () => {
    reauthReply = () => json(429, { error: "Too many attempts.", code: "RATE_LIMITED" });
    await mountNeedingPin();
    fireEvent.click(verifyButton());
    await flush();
    expect(pinMessage().textContent).toBe("Too many attempts. Wait a moment, then try again.");
  });

  it("says it could not confirm (not wrong PIN) when the server is unavailable", async () => {
    reauthReply = () => json(503, { error: "Authentication authority is temporarily unavailable", code: "AUTH_SECRET_UNAVAILABLE" });
    await mountNeedingPin();
    fireEvent.click(verifyButton());
    await flush();
    const text = pinMessage().textContent;
    expect(text).toBe("Could not confirm the PIN. Try again.");
    expect(text).not.toContain("Incorrect PIN");
  });
});
