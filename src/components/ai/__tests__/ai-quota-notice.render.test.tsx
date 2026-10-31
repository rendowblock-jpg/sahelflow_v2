/**
 * @vitest-environment happy-dom
 */
/**
 * The calm free-limit notice: nothing when AI is fine, one hint when nearly
 * used, one sentence with the local reset time when paused. ar (RTL), fr, en.
 * Layout numbers are not measured here: this checks text, direction and roles.
 */
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { render } from "@/test-utils/render";
import type { QuotaStateWire } from "@/lib/ai/providers/quota-state";

import { ErrorNotice, QuotaNotice, SetupNotice, quotaNoticeText } from "../ai-canvas-notices";

afterEach(cleanup);

const NOW = new Date(2026, 9, 31, 10, 0, 0);
const AT = new Date(2026, 9, 31, 14, 30, 0).toISOString();
const PAUSED: QuotaStateWire = { kind: "paused", provider: "gemini", until: AT, untilKnown: true };
const PAUSED_ESTIMATE: QuotaStateWire = { kind: "paused", provider: "gemini", until: AT, untilKnown: false };
const ALL: QuotaStateWire = { kind: "all_paused", resumeAt: AT, resumeKnown: true };
const LOW: QuotaStateWire = { kind: "low", provider: "gemini", left: 4 };
const FORBIDDEN = /gemini|groq|unavailable|indisponible|429|RESOURCE|http/i;

describe("QuotaNotice", () => {
  it("shows nothing when AI is fine (ok, also with a note about who answers)", () => {
    for (const quota of [{ kind: "ok" } as QuotaStateWire, { kind: "ok", answeredBy: "groq", pausedProviders: ["gemini"] } as QuotaStateWire, undefined]) {
      const { container } = render(<QuotaNotice quota={quota} locale="en" now={NOW} />);
      expect(container.firstChild).toBeNull();
      cleanup();
    }
  });

  it("low: one hint line with the count", () => {
    render(<QuotaNotice quota={LOW} locale="en" now={NOW} />);
    expect(screen.getByRole("status").textContent).toBe("Free AI requests left today: about 4.");
  });

  it("paused: the exact English sentence with the local reset time", () => {
    render(<QuotaNotice quota={PAUSED} locale="en" now={NOW} />);
    expect(screen.getByRole("status").textContent).toBe(
      "Your free AI limit is used up until 14:30. Orders and messages still work, and the offline reader still reads orders. Add a second key or switch provider in Settings.",
    );
  });

  it("all_paused: the same sentence with the earliest time", () => {
    render(<QuotaNotice quota={ALL} locale="en" now={NOW} />);
    expect(screen.getByRole("status").textContent).toContain("used up until 14:30.");
  });

  it("a time that is only our own back-off is worded as an estimate, not as a promise", () => {
    render(<QuotaNotice quota={PAUSED_ESTIMATE} locale="en" now={NOW} />);
    expect(screen.getByRole("status").textContent).toContain("We will try again around 14:30.");
    expect(screen.getByRole("status").textContent).not.toContain("used up until");
  });

  it("fr: sentence and time", () => {
    render(<QuotaNotice quota={PAUSED} locale="fr" now={NOW} />);
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("jusqu'à 14:30");
    expect(status.textContent).toContain("lecteur hors ligne");
    expect(status.getAttribute("dir")).toBe("ltr");
  });

  it("ar: right-to-left, Latin digits for the time", () => {
    render(<QuotaNotice quota={PAUSED} locale="ar" now={NOW} />);
    const status = screen.getByRole("status");
    expect(status.getAttribute("dir")).toBe("rtl");
    expect(status.textContent).toContain("14:30");
    expect(status.textContent).toContain("القارئ دون اتصال");
  });

  it("another day shows the date with the time", () => {
    const tomorrow = new Date(2026, 10, 1, 7, 5, 0).toISOString();
    const text = quotaNoticeText({ kind: "paused", provider: "gemini", until: tomorrow, untilKnown: true }, "en", NOW) ?? "";
    expect(text).toMatch(/until 1 Nov,? 07:05\./);
  });

  it("never shows a provider name, a status code or the 'unavailable' line, in any language or state", () => {
    for (const locale of ["ar", "fr", "en"] as const) {
      for (const quota of [PAUSED, PAUSED_ESTIMATE, ALL, LOW]) {
        expect(quotaNoticeText(quota, locale, NOW)).not.toMatch(FORBIDDEN);
      }
    }
  });

  it("a garbled time says nothing rather than 'Invalid Date'", () => {
    expect(quotaNoticeText({ kind: "paused", provider: "gemini", until: "banana", untilKnown: true }, "en", NOW)).toBeNull();
  });
});

function workspace(over: Record<string, unknown>) {
  return {
    locale: "en",
    setup: { provider: "gemini", consentAccepted: true, keyConfigured: true, ready: true },
    setupError: false,
    refreshSetup: vi.fn(async () => undefined),
    retry: vi.fn(),
    error: null,
    copy: (key: string) => (key === "openSettings" ? "Open AI settings" : key === "providerDegraded" ? "AI provider is currently unavailable" : key),
    ...over,
  } as never;
}
const soon = () => new Date(Date.now() + 3_600_000).toISOString();

describe("in the chat canvas", () => {
  it("SetupNotice: a ready setup that is paused shows the calm sentence and a way to settings", () => {
    const setup = { provider: "gemini", consentAccepted: true, keyConfigured: true, ready: true, quota: { kind: "paused", provider: "gemini", until: soon(), untilKnown: true } };
    render(<SetupNotice workspace={workspace({ setup })} />);
    expect(screen.getByRole("status").textContent).toMatch(/^Your free AI limit is used up until /);
    expect(screen.getByRole("link", { name: "Open AI settings" }).getAttribute("href")).toBe("/settings?group=intelligence");
  });

  it("SetupNotice: ready and ok shows nothing", () => {
    const { container } = render(<SetupNotice workspace={workspace({})} />);
    expect(container.firstChild).toBeNull();
  });

  it("ErrorNotice: a provider failure while the limit is paused shows no error, and asks the status again", () => {
    const refreshSetup = vi.fn(async () => undefined);
    const setup = { provider: "gemini", consentAccepted: true, keyConfigured: true, ready: true, quota: { kind: "all_paused", resumeAt: soon(), resumeKnown: true } };
    const error = { code: "AI_PROVIDER_REPORTED", detail: "The Gemini quota is exhausted. Retry after the quota resets." };
    const { container } = render(<ErrorNotice workspace={workspace({ setup, error, refreshSetup })} />);
    expect(container.firstChild).toBeNull();
    expect(refreshSetup).toHaveBeenCalled();
  });

  it("ErrorNotice: the same failure without a quota stop still shows the error", () => {
    const error = { code: "AI_PROVIDER_REPORTED", detail: "Some other provider message" };
    render(<ErrorNotice workspace={workspace({ error })} />);
    expect(screen.getByRole("alert").textContent).toContain("Some other provider message");
  });
});
