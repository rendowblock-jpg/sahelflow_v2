/**
 * @vitest-environment happy-dom
 */
/**
 * The PIN crash hunt (the Founder's report: Settings > AI keys, typed the PIN, the page said the PIN was wrong, then the
 * page crashed). Every answer the server, the network or the browser can give to the three requests behind that screen
 * (PIN check, key status, key save/delete) is mocked here, in en, fr and ar. For each one: nothing throws into the page
 * (a Catcher error boundary stands in for the page), the card stays on screen, the seller reads a plain sentence (never
 * "undefined", "[object Object]" or a raw key), and the screen stays usable (the PIN field can be typed in again).
 */
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { Component, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { render } from "@/test-utils/render";
import en from "@/lib/i18n/locales/en.json";
import fr from "@/lib/i18n/locales/fr.json";
import ar from "@/lib/i18n/locales/ar.json";
import { REAUTH_FAILURE_COPY_KEYS } from "@/components/auth/reauth-failure-message";

import { AiKeyPanel } from "../ai-key-panel";

type Loc = "en" | "fr" | "ar";
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

// ---- the page stand-in: whatever the panel throws in render lands here instead of blanking the page ----
const caught: unknown[] = [];
class Catcher extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    caught.push(error);
  }
  render() {
    return this.state.failed ? <p data-testid="page-crashed">PAGE CRASHED</p> : this.props.children;
  }
}

// ---- mocked answers ----
type Answer = Response | (() => Promise<Response>) | Error | "never";
const answer = (
  status: number,
  body: unknown,
  opts: { badJson?: boolean; headers?: Record<string, string>; noHeaders?: boolean } = {},
): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    ...(opts.noHeaders ? {} : { headers: new Headers(opts.headers ?? {}) }),
    json: async () => {
      if (opts.badJson) throw new SyntaxError("Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON");
      return body;
    },
  }) as unknown as Response;

const PIN_NEEDED = () => answer(403, { error: "Recent PIN verification is required", code: "REAUTHENTICATION_REQUIRED" });
let reauth: Answer;
let keyStatus: Answer;
let keySave: Answer;
let keyDelete: Answer;
const fetchMock = vi.fn();

function play(a: Answer): Promise<Response> {
  if (a === "never") return new Promise<Response>(() => undefined);
  if (a instanceof Error) return Promise.reject(a);
  if (typeof a === "function") return a();
  return Promise.resolve(a);
}

function wire(provider: "gemini" | "groq") {
  fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url === "/api/auth/reauthenticate" && method === "POST") return play(reauth);
    if (url === `/api/secrets/${provider}-key` && method === "GET") return play(keyStatus);
    if (url === `/api/secrets/${provider}-key` && method === "POST") return play(keySave);
    if (url === `/api/secrets/${provider}-key` && method === "DELETE") return play(keyDelete);
    if (url === "/api/settings" && method === "GET") return Promise.resolve(answer(200, { settings: {} }));
    throw new Error(`unexpected request ${method} ${url}`);
  });
}

beforeEach(() => {
  harness.locale = "en";
  caught.length = 0;
  fetchMock.mockReset();
  reauth = answer(200, { success: true });
  keyStatus = PIN_NEEDED();
  keySave = PIN_NEEDED();
  keyDelete = PIN_NEEDED();
  wire("gemini");
  vi.stubGlobal("fetch", fetchMock);
  // React logs an uncaught render error with console.error; those are checked through `caught`, so keep the output quiet.
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const settle = () =>
  act(async () => {
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
  });
const pinField = () => document.getElementById("ai-key-reauth-pin") as HTMLInputElement | null;
const verifyButton = () => pinField()!.parentElement!.querySelector("button") as HTMLButtonElement;
const ugly = /undefined|\[object|\{\{|NaN|aiKey\.|auth\.reauth\.|onboarding\.pin\./;

function mountPanel(locale: Loc = "en", provider: "gemini" | "groq" = "gemini") {
  harness.locale = locale;
  wire(provider);
  return render(
    <Catcher>
      <AiKeyPanel canManageKey canManageConsent provider={provider} />
    </Catcher>,
  );
}

async function mountAtPinPrompt(locale: Loc = "en", provider: "gemini" | "groq" = "gemini") {
  mountPanel(locale, provider);
  await waitFor(() => expect(pinField()).not.toBeNull());
  fireEvent.change(pinField()!, { target: { value: "24681357" } });
}

/** The page is still there: no throw reached the Catcher and the card is drawn. */
function expectPageAlive() {
  expect(caught, `the panel threw into the page: ${String(caught[0])}`).toHaveLength(0);
  expect(screen.queryByTestId("page-crashed")).toBeNull();
  expect(document.querySelector('[id^="ai-key-"]'), "the AI key card is gone").not.toBeNull();
}

/** The seller-facing line under the PIN field (the <p role="alert"> that ReauthFailureMessage draws). */
function pinLine(): string {
  const p = screen.getAllByRole("alert").find((node) => node.tagName === "P" && node.closest("#ai-key-reauth-hint, [role=alert]"));
  return (p?.textContent ?? "").trim();
}

describe("PIN check: every answer to POST /api/auth/reauthenticate", () => {
  const replies: Array<[string, Answer]> = [
    ["401 INVALID_CREDENTIALS (really a wrong PIN)", answer(401, { code: "INVALID_CREDENTIALS" })],
    ["401 UNAUTHORIZED (dead session)", answer(401, { code: "UNAUTHORIZED" })],
    ["401 with an HTML body (json() throws)", answer(401, null, { badJson: true })],
    ["401 with a JSON null body", answer(401, null)],
    ["401 with a code that is an object", answer(401, { code: { nested: true } })],
    ["400", answer(400, { error: "bad" })],
    ["403 REAUTHENTICATION_REQUIRED", answer(403, { code: "REAUTHENTICATION_REQUIRED" })],
    ["409 conflict", answer(409, { error: "conflict" })],
    ["429 without Retry-After", answer(429, {})],
    ["429 with Retry-After: abc", answer(429, {}, { headers: { "Retry-After": "abc" } })],
    ["429 on a response without headers", answer(429, {}, { noHeaders: true })],
    ["500 HTML", answer(500, null, { badJson: true })],
    ["500 with an object error", answer(500, { error: { deep: [1] } })],
    ["503", answer(503, {})],
    ["network failure (TypeError)", new TypeError("Failed to fetch")],
    ["rejects with a string", "boom" as unknown as Error],
    ["rejects with undefined", undefined as unknown as Error],
    ["resolves with undefined", (() => Promise.resolve(undefined as unknown as Response)) as Answer],
    ["resolves with null", (() => Promise.resolve(null as unknown as Response)) as Answer],
  ];

  for (const loc of ["en", "fr", "ar"] as const) {
    it.each(replies)(`[${loc}] %s: one plain sentence, the page lives, the PIN can be typed again`, async (_name, reply) => {
      reauth =
        reply instanceof Error || reply === undefined || typeof reply === "string"
          ? () => (reply === undefined ? Promise.reject(undefined) : Promise.reject(reply))
          : reply;
      await mountAtPinPrompt(loc);
      await act(async () => {
        fireEvent.click(verifyButton());
      });
      await settle();
      expectPageAlive();
      const line = pinLine();
      expect(line.length, "no sentence under the PIN field").toBeGreaterThan(3);
      expect(line).not.toMatch(ugly);
      // still usable: the field is enabled and a new PIN can be typed
      expect(pinField()!.disabled).toBe(false);
      fireEvent.change(pinField()!, { target: { value: "13572468" } });
      expect(pinField()!.value).toBe("13572468");
      expect(verifyButton().disabled).toBe(false);
    });
  }

  it("a PIN check that never answers and a panel that is closed meanwhile: nothing throws when the 15 s timer fires later", async () => {
    // Fake timers on purpose: the PIN helper keeps ONE request in flight for everybody until it settles, so a real
    // 15 s timer left running would leak into the next test.
    vi.useFakeTimers();
    try {
      reauth = "never";
      mountPanel();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5);
      });
      fireEvent.change(pinField()!, { target: { value: "24681357" } });
      await act(async () => {
        fireEvent.click(verifyButton());
      });
      cleanup();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15_100);
      });
      expect(caught).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("the 15 s client timeout says 'slow' in the seller's language and does not retry", async () => {
    vi.useFakeTimers();
    try {
      reauth = "never";
      mountPanel("fr");
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5);
      });
      fireEvent.change(pinField()!, { target: { value: "24681357" } });
      await act(async () => {
        fireEvent.click(verifyButton());
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15_100);
      });
      expectPageAlive();
      expect(pinLine()).toBe(fr["auth.reauth.slow" as keyof typeof fr]);
      expect(fetchMock.mock.calls.filter(([u]) => String(u) === "/api/auth/reauthenticate")).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("after a CORRECT PIN: the key status that is read next, whatever it answers", () => {
  const statuses: Array<[string, Answer]> = [
    ["403 REAUTHENTICATION_REQUIRED again (the loop)", PIN_NEEDED()],
    ["401 UNAUTHORIZED", answer(401, { code: "UNAUTHORIZED" })],
    ["409", answer(409, { error: "x" })],
    ["500 HTML", answer(500, null, { badJson: true })],
    ["503", answer(503, {})],
    ["200 with a JSON null body", answer(200, null)],
    ["200 with {}", answer(200, {})],
    ["200 with an array", answer(200, [])],
    ["200 configured as the text 'true'", answer(200, { configured: "true" })],
    ["200 configured null", answer(200, { configured: null })],
    ["200 with an HTML body", answer(200, null, { badJson: true })],
    ["network failure", new TypeError("Failed to fetch")],
    ["answer is an object error", answer(500, { error: { a: 1 }, code: { b: 2 } })],
  ];

  for (const loc of ["en", "fr", "ar"] as const) {
    it.each(statuses)(`[${loc}] %s: the page lives and says something`, async (_name, reply) => {
      await mountAtPinPrompt(loc);
      keyStatus = reply; // the first (initial) read already used PIN_NEEDED; the read after the PIN gets this reply
      await act(async () => {
        fireEvent.click(verifyButton());
      });
      await settle();
      await settle();
      expectPageAlive();
      const text = document.body.textContent ?? "";
      expect(text).not.toMatch(/\[object|undefined|\{\{|NaN/);
      expect(text.length).toBeGreaterThan(40);
    });
  }
});

describe("after a correct PIN the interrupted save runs again: every answer to POST /api/secrets/gemini-key", () => {
  const hostileDiagnostics = {
    httpStatus: { n: 1 },
    providerStatus: { s: 1 },
    reason: { r: 1 },
    transport: { code: { c: 1 }, name: ["x"] },
    transportClass: { k: 1 },
    responseShape: { finishReason: { f: 1 }, candidatesCount: { c: 1 }, blockReason: ["b"], jsonParseFailed: "yes" },
    keyShape: { prefix: { p: 1 }, length: "39", hasNewline: "yes", hasWhitespace: 1 },
  };
  const saves: Array<[string, Answer]> = [
    ["401", answer(401, { code: "UNAUTHORIZED" })],
    ["403 PIN needed again", PIN_NEEDED()],
    ["409", answer(409, { error: "Another save is running." })],
    ["429", answer(429, { error: "Slow down." })],
    ["500 HTML", answer(500, null, { badJson: true })],
    ["503 {}", answer(503, {})],
    ["200 with a JSON null body", answer(200, null)],
    ["200 {ok:true} with objects for message and model", answer(200, { ok: true, message: { m: 1 }, model: ["x"] })],
    ["400 with error/message/code as objects", answer(400, { ok: false, error: { e: 1 }, message: { m: 1 }, code: { c: 1 } })],
    ["400 with error as a number", answer(400, { ok: false, error: 42, code: 7 })],
    ["400 with diagnostics as a string", answer(400, { ok: false, error: "No.", diagnostics: "oops" })],
    ["400 with diagnostics as an array", answer(400, { ok: false, error: "No.", diagnostics: [1, 2] })],
    ["400 with diagnostics as a number", answer(400, { ok: false, error: "No.", diagnostics: 5 })],
    ["400 with every diagnostics field an object", answer(400, { ok: false, error: "No.", code: "GEMINI_PROVIDER_UNAVAILABLE", diagnostics: hostileDiagnostics })],
    ["network failure", new TypeError("Failed to fetch")],
  ];

  for (const loc of ["en", "fr", "ar"] as const) {
    it.each(saves)(`[${loc}] %s: the page lives, the line is plain text`, async (_name, reply) => {
      keyStatus = PIN_NEEDED();
      keySave = reply;
      harness.locale = loc;
      wire("gemini");
      render(
        <Catcher>
          <AiKeyPanel canManageKey canManageConsent />
        </Catcher>,
      );
      await waitFor(() => expect(pinField()).not.toBeNull());
      // the seller first types the key while the panel is ready: simulate by answering the status as 'not configured'
      keyStatus = answer(200, { configured: false });
      fireEvent.change(pinField()!, { target: { value: "24681357" } });
      await act(async () => {
        fireEvent.click(verifyButton());
      });
      await settle();
      await settle();
      const keyField = document.querySelector('input[type="password"]:not(#ai-key-reauth-pin), input[type="text"]') as HTMLInputElement | null;
      expect(keyField, "the key field is not shown after the PIN").not.toBeNull();
      fireEvent.change(keyField!, { target: { value: "AIza-test-key-0123456789" } });
      const save = Array.from(document.querySelectorAll("button")).find((b) => b.closest("#ai-key-gemini") && /save|enregistrer|حفظ/i.test(b.textContent ?? "")) as HTMLButtonElement | undefined;
      expect(save, "no save button").toBeDefined();
      await act(async () => {
        fireEvent.click(save!);
      });
      await settle();
      await settle();
      expectPageAlive();
      const text = document.getElementById("ai-key-gemini")?.textContent ?? "";
      expect(text).not.toMatch(/\[object|undefined|\{\{|NaN/);
    });
  }
});

describe("the key status read at first (before any PIN), whatever it answers, for both AIs", () => {
  const odd: Array<[string, Answer]> = [
    ["null body", answer(200, null)],
    ["500 HTML", answer(500, null, { badJson: true })],
    ["reject", new TypeError("Failed to fetch")],
    ["configured as an object", answer(200, { configured: {} })],
    ["403 with another code", answer(403, { code: "LICENSE_REQUIRED", error: { x: 1 } })],
  ];
  for (const provider of ["gemini", "groq"] as const) {
    it.each(odd)(`[${provider}] %s: the card stays and shows a state`, async (_name, reply) => {
      keyStatus = reply;
      mountPanel("ar", provider);
      await settle();
      await settle();
      expectPageAlive();
      expect(document.body.textContent ?? "").not.toMatch(/\[object|undefined|\{\{|NaN/);
    });
  }
});

describe("the copy every PIN outcome needs exists in en, fr and ar (a missing key would show a raw key name)", () => {
  const keys = Object.values(REAUTH_FAILURE_COPY_KEYS).concat(["auth.reauth.signInAgain", "auth.pinPlaceholder"]);
  it.each(["en", "fr", "ar"] as const)("[%s] every key has a non-empty sentence", (loc) => {
    const table = { en, fr, ar }[loc] as Record<string, string>;
    for (const key of keys) {
      expect(typeof table[key], `${loc} is missing ${key}`).toBe("string");
      expect(table[key]!.trim().length, `${loc} ${key} is empty`).toBeGreaterThan(0);
    }
  });
});
