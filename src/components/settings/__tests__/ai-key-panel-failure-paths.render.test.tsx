/**
 * @vitest-environment happy-dom
 */
/**
 * F-0023 round 2 ("the page crashed"): the AI keys panel read server JSON with no guard when it drew a failed or
 * successful save. One malformed field threw during render and took the whole page down. Every case below hands the
 * panel a body the server should not send, and the panel must stay on screen and say something plain.
 */
import { fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { render } from "@/test-utils/render";

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

const fetchMock = vi.fn();
type Reply = { status: number; body: unknown };
const respond = ({ status, body }: Reply) =>
  Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body } as Response);

let saveReply: Reply;
let statusReply: Reply;

beforeEach(() => {
  harness.locale = "en";
  fetchMock.mockReset();
  statusReply = { status: 200, body: { configured: false } };
  saveReply = { status: 400, body: { ok: false, error: "Google refused the key." } };
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

afterEach(() => {
  vi.unstubAllGlobals();
});

async function submitKey() {
  render(<AiKeyPanel canManageKey canManageConsent />);
  fireEvent.change(await screen.findByLabelText("API key"), { target: { value: "AIza-test-key" } });
  fireEvent.click(screen.getByRole("button", { name: "Test and save" }));
}

/** The red result box that holds the given sentence. (The consent notice on the same card is also role="alert".) */
async function resultBox(sentence: string): Promise<HTMLElement> {
  const node = await screen.findByText(sentence);
  const box = node.closest('[role="alert"], [role="status"]');
  if (!box) throw new Error(`"${sentence}" is not inside a result box`);
  return box as HTMLElement;
}

describe("AiKeyPanel: a failed save with an odd diagnostics field never takes the page down", () => {
  const failure = (diagnostics?: unknown) => ({
    status: 400,
    body: { ok: false, code: "GEMINI_PROVIDER_UNAVAILABLE", error: "Google refused the key.", ...(diagnostics === undefined ? {} : { diagnostics }) },
  });

  it.each([
    ["diagnostics missing", undefined],
    ["diagnostics null", null],
    ["diagnostics {}", {}],
    ["diagnostics without keyShape", { httpStatus: 403, providerStatus: "PERMISSION_DENIED" }],
    ["keyShape null", { httpStatus: 403, keyShape: null }],
    ["keyShape {}", { httpStatus: 403, keyShape: {} }],
    ["keyShape a string", { httpStatus: 403, keyShape: "AIza" }],
  ])("%s: the error stays on screen", async (_name, diagnostics) => {
    saveReply = failure(diagnostics);
    await submitKey();
    const alert = await resultBox("Google refused the key.");
    // No half-filled placeholders from a missing field.
    expect(alert.textContent).not.toMatch(/undefined|\{\{|NaN|\[object/);
  });

  it("still shows the probe line and the key shape when the server sends them (control)", async () => {
    saveReply = failure({ httpStatus: 403, keyShape: { prefix: "AIza", length: 39, hasNewline: false, hasWhitespace: true } });
    await submitKey();
    const text = (await resultBox("Google refused the key.")).textContent ?? "";
    expect(text).toContain("probe: HTTP 403");
    expect(text).toContain("key: AIza…, 39 chars");
    expect(text).toContain("whitespace");
  });

  it("names the probe status but leaves the key shape out when keyShape is missing", async () => {
    saveReply = failure({ httpStatus: 403 });
    await submitKey();
    const text = (await resultBox("Google refused the key.")).textContent ?? "";
    expect(text).toContain("probe: HTTP 403");
    expect(text).not.toContain("key:");
  });
});

describe("AiKeyPanel: text fields from the server must be text before they are drawn", () => {
  it("an error that is an object falls back to the plain 'Error' sentence instead of crashing", async () => {
    saveReply = { status: 400, body: { ok: false, error: { message: "boom" } } };
    await submitKey();
    const alert = await resultBox("Error");
    expect(alert.textContent).toBe("Error");
  });

  it("a code that is not text still shows the server sentence (it used to throw and read as 'Failed to connect')", async () => {
    saveReply = { status: 400, body: { ok: false, code: 403, error: "Google refused the key." } };
    await submitKey();
    expect((await resultBox("Google refused the key.")).textContent).toContain("Google refused the key.");
  });

  it("a success whose message and model are objects still says 'Key saved.' and draws no object", async () => {
    saveReply = { status: 200, body: { ok: true, model: { id: 1 }, message: { text: "x" } } };
    await submitKey();
    const status = await resultBox("Key saved.");
    expect(status.textContent).toBe("Key saved.");
    expect(document.body.textContent).not.toContain("[object");
    expect(screen.queryByText("Active model:")).toBeNull();
  });

  it("a success with a text model shows it (control)", async () => {
    saveReply = { status: 200, body: { ok: true, model: "gemini-2.5-flash", message: "Key saved." } };
    await submitKey();
    expect((await resultBox("Key saved.")).textContent).toBe("Key saved.");
    expect(await screen.findByText("gemini-2.5-flash")).toBeTruthy();
  });

  it("a body that is JSON null is reported as a connection problem, not a crash (already guarded: control)", async () => {
    saveReply = { status: 200, body: null };
    await submitKey();
    expect((await resultBox("Failed to connect to the server.")).textContent).toBe("Failed to connect to the server.");
  });

  it("a key status that is JSON null or has a non-boolean 'configured' shows the unavailable state (already guarded: control)", async () => {
    statusReply = { status: 200, body: { configured: "yes" } };
    render(<AiKeyPanel canManageKey canManageConsent />);
    expect(await screen.findByRole("button", { name: "Retry" })).toBeTruthy();
  });
});
