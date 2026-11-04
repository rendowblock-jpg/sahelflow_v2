/**
 * @vitest-environment happy-dom
 */
/**
 * F-0023 (Founder, Internal.48, Settings > AI keys): "it asked for a PIN code; after entering the correct PIN, it said
 * the PIN was wrong and wouldn't accept it". The panel mapped every 401 to "Incorrect PIN" and guarded double
 * submission with React state only. These tests drive the real panel with a mocked network.
 */
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
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
let keyStatusReply: () => Promise<Response>;
let keySaveReply: () => Promise<Response>;
/** Every request the panel made to the key route or the PIN route, in order, as "METHOD url". */
let trace: string[];

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
  keyStatusReply = () => json(403, { error: "Recent PIN verification is required", code: "REAUTHENTICATION_REQUIRED" });
  keySaveReply = () => json(403, { error: "Recent PIN verification is required", code: "REAUTHENTICATION_REQUIRED" });
  trace = [];
  fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url.startsWith("/api/secrets/") || url === "/api/auth/reauthenticate") trace.push(`${method} ${url}`);
    if (url === "/api/auth/reauthenticate" && method === "POST") return reauthReply();
    if (url === "/api/secrets/gemini-key" && method === "GET") return keyStatusReply();
    if (url === "/api/secrets/gemini-key" && method === "POST") return keySaveReply();
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

  it("says the request is slow (wait, then reload) when the server does not answer within 15 s, and does not retry", async () => {
    reauthReply = () => new Promise<Response>(() => undefined);
    await mountNeedingPin();
    vi.useFakeTimers();
    try {
      fireEvent.click(verifyButton());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15_001);
        await vi.advanceTimersByTimeAsync(60_000);
      });
    } finally {
      vi.useRealTimers();
    }
    const text = pinMessage().textContent ?? "";
    expect(text).toContain("taking longer than usual");
    expect(text).not.toContain("Incorrect PIN");
    expect(text).not.toContain("session expired");
    expect(reauthPosts()).toHaveLength(1);
  });
});

/**
 * Item 3 of round 2: a successful PIN rotates the session cookie. Nothing in the panel may keep firing requests
 * from stale state afterwards. These pin what the code does today; they were green when first run (nothing to fix).
 */
describe("AiKeyPanel after a successful PIN", () => {
  const quiet = () =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });

  it("reads the key status exactly once more, shows it, and then stays quiet", async () => {
    reauthReply = () => {
      keyStatusReply = () => json(200, { configured: true });
      return json(200, { success: true, sessionRotated: true });
    };
    await mountNeedingPin();
    fireEvent.click(verifyButton());
    await waitFor(() => expect(screen.getByText("Configured")).toBeTruthy());
    await quiet();
    expect(trace).toEqual([
      "GET /api/secrets/gemini-key",
      "POST /api/auth/reauthenticate",
      "GET /api/secrets/gemini-key",
    ]);
  });

  it("resumes the interrupted save exactly once, after the PIN and the status read, with the key the seller typed", async () => {
    keyStatusReply = () => json(200, { configured: false });
    reauthReply = () => {
      keySaveReply = () => json(200, { ok: true, model: "gemini-test", message: "Key saved." });
      return json(200, { success: true, sessionRotated: true });
    };
    render(<AiKeyPanel canManageKey canManageConsent />);
    fireEvent.change(await screen.findByLabelText("API key"), { target: { value: "AIza-typed-key" } });
    fireEvent.click(screen.getByRole("button", { name: "Test and save" }));
    const pinInput = (await screen.findByLabelText("Enter your PIN")) as HTMLInputElement;
    fireEvent.change(pinInput, { target: { value: "24681357" } });
    fireEvent.click(verifyButton());
    await waitFor(() => expect(screen.getByText("Key saved.")).toBeTruthy());
    await quiet();
    expect(trace).toEqual([
      "GET /api/secrets/gemini-key",
      "POST /api/secrets/gemini-key",
      "POST /api/auth/reauthenticate",
      "GET /api/secrets/gemini-key",
      "POST /api/secrets/gemini-key",
    ]);
    const saves = fetchMock.mock.calls.filter(
      ([url, init]) => String(url) === "/api/secrets/gemini-key" && (init as RequestInit | undefined)?.method === "POST",
    );
    expect(JSON.parse(String(((saves[1] as [string, RequestInit])[1]).body))).toEqual({ key: "AIza-typed-key", test: true });
  });
});
