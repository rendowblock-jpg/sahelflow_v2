/**
 * @vitest-environment happy-dom
 */
/**
 * "Which AI first" with the ChatGPT plan as the third provider. The two old values keep working; a seller who
 * signed in to ChatGPT sees where ChatGPT sits. Routes mocked, no network.
 */
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ar from "@/lib/i18n/locales/ar.json";
import en from "@/lib/i18n/locales/en.json";
import fr from "@/lib/i18n/locales/fr.json";
import { toast } from "@/lib/toast";
import { render } from "@/test-utils/render";

import { AiProviderOrderCard } from "../ai-provider-order-card";

const harness = vi.hoisted(() => ({ locale: "en" as "en" | "fr" | "ar" }));
vi.mock("@/hooks/use-i18n", async () => {
  const tables: Record<string, Record<string, string>> = {
    ar: (await import("@/lib/i18n/locales/ar.json")).default,
    fr: (await import("@/lib/i18n/locales/fr.json")).default,
    en: (await import("@/lib/i18n/locales/en.json")).default,
  };
  return { useI18n: () => ({ t: (key: string) => tables[harness.locale]?.[key] ?? key, locale: harness.locale, dir: harness.locale === "ar" ? "rtl" : "ltr" }) };
});
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const fetchMock = vi.fn();
let accountsAnswer: () => Response;
let savedOrder = "groq-first";
let putStatus = 200;
const READY = () => json({ ok: true, accounts: [{ id: 1, email: null, planUsageEnabled: true, signedIn: true, active: true }] });
const values = () => screen.getAllByRole("radio").map((r) => (r as HTMLInputElement).value);
const NOTE_EN =
  "ChatGPT is asked after these two. If ChatGPT is the only one you set up, SahelFlow uses it for the messages the offline reader cannot read.";

beforeEach(() => {
  harness.locale = "en";
  accountsAnswer = () => json({ ok: true, accounts: [] });
  savedOrder = "groq-first";
  putStatus = 200;
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.error).mockClear();
  fetchMock.mockReset().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/ai/provider-order") return init?.method === "PUT" ? json({ ok: putStatus < 400 }, putStatus) : json({ order: savedOrder });
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
    fireEvent.click(radios[1]!);
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

describe("AiProviderOrderCard: ChatGPT first", () => {
  const tables = { en, fr, ar } as Record<string, Record<string, string>>;
  const putBodies = () => fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT").map(([, init]) => JSON.parse(String(init.body)));

  it.each(["en", "fr", "ar"] as const)("%s: the choice is hidden without a ChatGPT account", async (locale) => {
    harness.locale = locale;
    render(<AiProviderOrderCard canManage />);
    await screen.findAllByRole("radio");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(values()).toEqual(["groq-first", "gemini-first"]);
    expect(screen.queryByText(tables[locale]!["aiKey.order.openaiFirst"]!)).toBeNull();
  });

  it.each(["en", "fr", "ar"] as const)("%s: the choice is shown, in the seller's language, with a signed-in plan account", async (locale) => {
    harness.locale = locale;
    accountsAnswer = READY;
    const { container } = render(<div dir={locale === "ar" ? "rtl" : "ltr"}><AiProviderOrderCard canManage /></div>);
    const label = await screen.findByLabelText(tables[locale]!["aiKey.order.openaiFirst"]!);
    expect((label as HTMLInputElement).value).toBe("openai-first");
    expect(values()).toEqual(["groq-first", "gemini-first", "openai-first"]);
    expect(label.closest("[dir]")?.getAttribute("dir")).toBe(locale === "ar" ? "rtl" : "ltr");
    expect(container.textContent).not.toContain("aiKey.");
    if (locale !== "en") expect(tables[locale]!["aiKey.order.openaiFirst"]).not.toBe(en["aiKey.order.openaiFirst"]);
  });

  it("stays visible and checked when the saved order is already openai-first, even with no account", async () => {
    savedOrder = "openai-first";
    render(<AiProviderOrderCard canManage />);
    await waitFor(() => expect(values()).toEqual(["groq-first", "gemini-first", "openai-first"]));
    expect((screen.getByLabelText(en["aiKey.order.openaiFirst"]) as HTMLInputElement).checked).toBe(true);
    expect(screen.queryByText(en["aiKey.order.openaiFirstNote"])).toBeNull();
    fireEvent.click(screen.getByLabelText(en["aiKey.order.groqFirst"]));
    await waitFor(() => expect(putBodies()).toEqual([{ order: "groq-first" }]));
  });

  it("choosing it sends exactly { order: openai-first } and says it was saved", async () => {
    accountsAnswer = READY;
    render(<AiProviderOrderCard canManage />);
    fireEvent.click(await screen.findByLabelText(en["aiKey.order.openaiFirst"]));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(en["aiKey.order.saved"]));
    expect(putBodies()).toEqual([{ order: "openai-first" }]);
    expect((screen.getByLabelText(en["aiKey.order.openaiFirst"]) as HTMLInputElement).checked).toBe(true);
  });

  it("when saving fails the previous choice comes back and the failure is said", async () => {
    accountsAnswer = READY;
    putStatus = 500;
    render(<AiProviderOrderCard canManage />);
    fireEvent.click(await screen.findByLabelText(en["aiKey.order.openaiFirst"]));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(en["aiKey.order.saveFailed"]));
    await waitFor(() => expect((screen.getByLabelText(en["aiKey.order.groqFirst"]) as HTMLInputElement).checked).toBe(true));
    expect((screen.getByLabelText(en["aiKey.order.openaiFirst"]) as HTMLInputElement).checked).toBe(false);
  });

  it("the note under the choices follows the choice", async () => {
    accountsAnswer = READY;
    render(<AiProviderOrderCard canManage />);
    expect(await screen.findByText(NOTE_EN)).toBeTruthy();
    fireEvent.click(screen.getByLabelText(en["aiKey.order.openaiFirst"]));
    const note = await screen.findByText(en["aiKey.order.openaiFirstNote"]);
    expect(screen.queryByText(NOTE_EN)).toBeNull();
    expect(screen.getByRole("group")).toHaveAttribute("aria-describedby", note.id);
    fireEvent.click(screen.getByLabelText(en["aiKey.order.geminiFirst"]));
    expect(await screen.findByText(NOTE_EN)).toBeTruthy();
  });

  it("the new texts exist in all three languages and use no jargon", () => {
    for (const locale of ["en", "fr", "ar"]) {
      for (const key of ["aiKey.order.openaiFirst", "aiKey.order.openaiFirstNote"]) {
        const text = tables[locale]![key]!;
        expect(text.length).toBeGreaterThan(10);
        expect(text).toContain(key.endsWith("Note") ? "Groq" : "ChatGPT");
        expect(text).not.toMatch(/quota|token|oauth/i);
      }
    }
  });
});
