/**
 * @vitest-environment happy-dom
 */
/**
 * Onboarding step 4: the ChatGPT plan is a third, collapsed choice after Groq and Gemini. Collapsed means nothing
 * is loaded and nothing is asked until the seller opens it. Routes mocked, no network.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { render } from "@/test-utils/render";

import { OnboardingChatGptOption } from "../chatgpt-onboarding-option";

const harness = vi.hoisted(() => ({ locale: "en" as "en" | "fr" | "ar" }));
vi.mock("@/hooks/use-i18n", async () => {
  const tables: Record<string, Record<string, string>> = {
    ar: (await import("@/lib/i18n/locales/ar.json")).default,
    fr: (await import("@/lib/i18n/locales/fr.json")).default,
    en: (await import("@/lib/i18n/locales/en.json")).default,
  };
  return { useI18n: () => ({ t: (key: string) => tables[harness.locale]?.[key] ?? key, locale: harness.locale, dir: harness.locale === "ar" ? "rtl" : "ltr" }) };
});
vi.mock("@/components/theme-provider", () => ({ useTheme: () => ({ resolvedTheme: "light" }) }));

const fetchMock = vi.fn();
beforeEach(() => {
  harness.locale = "en";
  fetchMock.mockReset().mockImplementation(async () => new Response(JSON.stringify({ ok: true, accounts: [] }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("OnboardingChatGptOption", () => {
  it("starts collapsed and asks nothing", () => {
    render(<OnboardingChatGptOption canManage />);
    const toggle = screen.getByRole("button", { name: "Or use your ChatGPT plan (optional)" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "Continue with ChatGPT" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("opens and closes with the toggle, and shows the sign-in card only while open", async () => {
    render(<OnboardingChatGptOption canManage />);
    const toggle = screen.getByRole("button", { name: "Or use your ChatGPT plan (optional)" });
    toggle.focus();
    expect(document.activeElement).toBe(toggle);
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle.getAttribute("aria-controls")).toBeTruthy();
    expect(await screen.findByRole("button", { name: "Continue with ChatGPT" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/ai/openai/accounts", expect.anything());
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "Continue with ChatGPT" })).toBeNull();
  });

  it("shows nothing to a person who may not manage integrations", () => {
    const { container } = render(<OnboardingChatGptOption canManage={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it.each([["fr", "ltr"], ["ar", "rtl"]] as const)("is readable in %s (%s)", async (locale, dir) => {
    harness.locale = locale;
    const { container } = render(<OnboardingChatGptOption canManage />);
    const toggle = screen.getAllByRole("button")[0]!;
    expect(toggle.textContent).toContain("ChatGPT");
    expect(toggle.textContent).not.toContain("aiKey.");
    fireEvent.click(toggle);
    await screen.findAllByRole("button");
    expect(container.querySelector(`[dir="${dir}"]`)).not.toBeNull();
  });

  it("is the third choice in wizard step 4, after Groq and Gemini", () => {
    const source = readFileSync(join(process.cwd(), "src/components/onboarding/onboarding-wizard.tsx"), "utf8");
    const groq = source.indexOf('provider="groq"');
    const gemini = source.indexOf("<AiKeyPanel", groq + 1);
    const chatgpt = source.indexOf("<OnboardingChatGptOption canManage={access.aiKey} />");
    expect(groq).toBeGreaterThan(-1);
    expect(gemini).toBeGreaterThan(groq);
    expect(chatgpt).toBeGreaterThan(gemini);
  });
});
