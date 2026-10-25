/**
 * @vitest-environment happy-dom
 */
/**
 * "Which AI first" with the ChatGPT plan as the third provider. The two old values keep working; a seller who
 * signed in to ChatGPT sees where ChatGPT sits. Routes mocked, no network.
 */
import { fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { render } from "@/test-utils/render";

import { AiProviderOrderCard } from "../ai-provider-order-card";

const harness = vi.hoisted(() => ({ locale: "en" as "en" | "fr" | "ar" }));
vi.mock("@/hooks/use-i18n", async () => {
  const tables: Record<string, Record<string, string>> = {
    ar: (await import("@/lib/i18n/locales/ar.json")).default,
    fr: (await import("@/lib/i18n/locales/fr.json")).default,
    en: (await import("@/lib/i18n/locales/en.json")).default,
  };
  return { useI18n: () => ({ t: (key: string) => tables[harness.locale][key] ?? key, locale: harness.locale, dir: harness.locale === "ar" ? "rtl" : "ltr" }) };
});
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const fetchMock = vi.fn();
let accountsAnswer: () => Response;
const NOTE_EN =
  "ChatGPT is asked after these two. If ChatGPT is the only one you set up, SahelFlow uses it for the messages the offline reader cannot read.";

beforeEach(() => {
  harness.locale = "en";
  accountsAnswer = () => json({ ok: true, accounts: [] });
  fetchMock.mockReset().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/ai/provider-order") return init?.method === "PUT" ? json({ ok: true }) : json({ order: "groq-first" });
    if (url === "/api/ai/openai/accounts") return accountsAnswer();
    throw new Error(`unexpected ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("AiProviderOrderCard with the ChatGPT plan", () => {
  it("keeps the two old values: Groq first and Gemini first, saved exactly as before", async () => {
    render(<AiProviderOrderCard canManage />);
    const radios = await screen.findAllByRole("radio");
    expect(radios.map((r) => (r as HTMLInputElement).value)).toEqual(["groq-first", "gemini-first"]);
    fireEvent.click(radios[1]);
    const put = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT")!;
    expect(JSON.parse(String(put[1].body))).toEqual({ order: "gemini-first" });
  });

  it("explains where ChatGPT sits when a ChatGPT account with plan usage is signed in", async () => {
    accountsAnswer = () => json({ ok: true, accounts: [{ id: 1, email: "a@b.dz", planUsageEnabled: true, signedIn: true, active: true }] });
    render(<AiProviderOrderCard canManage />);
    const note = await screen.findByText(NOTE_EN);
    expect(screen.getByRole("group")).toHaveAttribute("aria-describedby", note.id);
  });

  it.each([
    ["no ChatGPT account", () => json({ ok: true, accounts: [] })],
    ["plan usage not granted", () => json({ ok: true, accounts: [{ id: 1, email: null, planUsageEnabled: false, signedIn: true, active: true }] })],
    ["signed out", () => json({ ok: true, accounts: [{ id: 1, email: null, planUsageEnabled: true, signedIn: false, active: true }] })],
    ["a recent PIN check is needed", () => json({ ok: false, code: "REAUTHENTICATION_REQUIRED" }, 403)],
    ["the request fails", () => { throw new Error("offline"); }],
  ])("shows no ChatGPT note when %s", async (_name, answer) => {
    accountsAnswer = answer as () => Response;
    render(<AiProviderOrderCard canManage />);
    await screen.findAllByRole("radio");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByText(NOTE_EN)).toBeNull();
  });

  it.each(["fr", "ar"] as const)("has the note in %s", async (locale) => {
    harness.locale = locale;
    accountsAnswer = () => json({ ok: true, accounts: [{ id: 1, email: null, planUsageEnabled: true, signedIn: true, active: true }] });
    const { container } = render(<AiProviderOrderCard canManage />);
    await screen.findAllByRole("radio");
    const note = await screen.findByText(/ChatGPT/, { selector: "p" });
    expect(note.textContent).not.toContain("aiKey.");
    expect(container.textContent).toContain("ChatGPT");
  });
});
