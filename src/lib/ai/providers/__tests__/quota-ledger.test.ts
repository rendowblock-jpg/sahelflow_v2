/**
 * The quota ledger remembers, per AI provider, when a quota pause ends and how
 * many requests were made today, so a paused provider is not asked again on
 * every message.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_PAUSE_SECONDS,
  MAX_PAUSE_SECONDS,
  createQuotaLedger,
} from "../quota-ledger";

const T0 = new Date(2026, 9, 25, 12, 0, 0); // local time on purpose

describe("quota ledger", () => {
  it("is not paused until a quota hit is recorded", () => {
    const ledger = createQuotaLedger();
    expect(ledger.isPaused("groq", T0)).toEqual({ paused: false });
  });

  it("honours the retry-after value and expires with the injected clock", () => {
    const ledger = createQuotaLedger();
    ledger.recordQuotaHit("groq", 90, T0);
    const during = ledger.isPaused("groq", new Date(T0.getTime() + 89_000));
    expect(during.paused).toBe(true);
    expect(during.until?.getTime()).toBe(T0.getTime() + 90_000);
    expect(ledger.isPaused("groq", new Date(T0.getTime() + 90_000)).paused).toBe(false);
  });

  it("pauses providers independently", () => {
    const ledger = createQuotaLedger();
    ledger.recordQuotaHit("groq", 60, T0);
    expect(ledger.isPaused("gemini", T0).paused).toBe(false);
  });

  it("uses a 15 minute pause when the provider gave no delay", () => {
    const ledger = createQuotaLedger();
    ledger.recordQuotaHit("gemini", null, T0);
    expect(DEFAULT_PAUSE_SECONDS).toBe(15 * 60);
    expect(ledger.isPaused("gemini", T0).until?.getTime()).toBe(T0.getTime() + 15 * 60_000);
  });

  it("treats a zero, negative or non-finite delay as unknown", () => {
    const ledger = createQuotaLedger();
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      ledger.clear("groq");
      ledger.recordQuotaHit("groq", bad, T0);
      expect(ledger.isPaused("groq", T0).until?.getTime()).toBe(T0.getTime() + 15 * 60_000);
    }
  });

  it("caps any pause at 24 hours", () => {
    const ledger = createQuotaLedger();
    const until = ledger.recordQuotaHit("gemini", 57_173 * 10, T0);
    expect(MAX_PAUSE_SECONDS).toBe(86_400);
    expect(until.getTime()).toBe(T0.getTime() + 86_400_000);
  });

  it("never shortens a longer pause that is already running", () => {
    const ledger = createQuotaLedger();
    ledger.recordQuotaHit("groq", 600, T0);
    ledger.recordQuotaHit("groq", 5, T0);
    expect(ledger.isPaused("groq", T0).until?.getTime()).toBe(T0.getTime() + 600_000);
  });

  it("clear lifts the pause", () => {
    const ledger = createQuotaLedger();
    ledger.recordQuotaHit("groq", 600, T0);
    ledger.clear("groq");
    expect(ledger.isPaused("groq", T0).paused).toBe(false);
  });

  it("counts requests per local day and starts again at local midnight", () => {
    const ledger = createQuotaLedger();
    const evening = new Date(2026, 9, 25, 23, 59, 0);
    const morning = new Date(2026, 9, 26, 0, 1, 0);
    ledger.recordRequest("groq", evening);
    ledger.recordRequest("groq", evening);
    ledger.recordRequest("gemini", evening);
    expect(ledger.requestsToday("groq", evening)).toBe(2);
    expect(ledger.requestsToday("gemini", evening)).toBe(1);
    expect(ledger.requestsToday("groq", morning)).toBe(0);
    ledger.recordRequest("groq", morning);
    expect(ledger.requestsToday("groq", morning)).toBe(1);
  });

  it("exports and restores pauses (for persistence)", () => {
    const ledger = createQuotaLedger();
    ledger.recordQuotaHit("groq", 600, T0);
    const saved = ledger.exportPauses();
    const fresh = createQuotaLedger();
    fresh.restorePauses(saved);
    expect(fresh.isPaused("groq", T0).until?.getTime()).toBe(T0.getTime() + 600_000);
    expect(fresh.isPaused("gemini", T0).paused).toBe(false);
  });
});
