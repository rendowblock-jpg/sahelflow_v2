/** The one question the seller's notices ask: is AI usable now, nearly used up, or paused until when? */
import { describe, expect, it } from "vitest";
import {
  GEMINI_FREE_DAILY_LIMIT,
  geminiFreeKeyEvidence,
  resolveQuotaState,
} from "../quota-state";

const NOW = new Date("2026-10-31T10:00:00.000Z");
const at = (ms: number) => new Date(NOW.getTime() + ms);
const BOTH = ["gemini", "groq"] as const;

describe("resolveQuotaState", () => {
  it("is ok when nothing is paused and nothing is near a limit", () => {
    expect(resolveQuotaState({ now: NOW, providers: BOTH, pauses: {}, usedToday: { gemini: 2 }, limits: { gemini: 20 } })).toEqual({ kind: "ok" });
  });

  it("is low at exactly 80 percent of a known limit, with what is left", () => {
    expect(resolveQuotaState({ now: NOW, providers: BOTH, pauses: {}, usedToday: { gemini: 16 }, limits: { gemini: 20 } })).toEqual({ kind: "low", provider: "gemini", left: 4 });
    expect(resolveQuotaState({ now: NOW, providers: BOTH, pauses: {}, usedToday: { gemini: 80 }, limits: { gemini: 100 } })).toEqual({ kind: "low", provider: "gemini", left: 20 });
  });

  it("is not low just under 80 percent", () => {
    expect(resolveQuotaState({ now: NOW, providers: BOTH, pauses: {}, usedToday: { gemini: 15 }, limits: { gemini: 20 } })).toEqual({ kind: "ok" });
    expect(resolveQuotaState({ now: NOW, providers: BOTH, pauses: {}, usedToday: { gemini: 79 }, limits: { gemini: 100 } })).toEqual({ kind: "ok" });
  });

  it("never says low when the limit is unknown (absent is unknown, not zero)", () => {
    expect(resolveQuotaState({ now: NOW, providers: BOTH, pauses: {}, usedToday: { gemini: 500 }, limits: {} })).toEqual({ kind: "ok" });
    expect(resolveQuotaState({ now: NOW, providers: BOTH, pauses: {}, usedToday: { gemini: 500 }, limits: { gemini: 0 } })).toEqual({ kind: "ok" });
    expect(resolveQuotaState({ now: NOW, providers: BOTH, pauses: {}, usedToday: { gemini: 500 }, limits: { gemini: Number.NaN } })).toEqual({ kind: "ok" });
    expect(resolveQuotaState({ now: NOW, providers: BOTH, pauses: {}, usedToday: {}, limits: { gemini: 20 } })).toEqual({ kind: "ok" });
  });

  it("is paused, with the time, when the only configured provider is paused", () => {
    const until = at(3_600_000);
    expect(resolveQuotaState({ now: NOW, providers: ["gemini"], pauses: { gemini: { until } }, usedToday: {}, limits: {} }))
      .toEqual({ kind: "paused", provider: "gemini", until, untilKnown: true });
  });

  it("marks a time that is only our own back-off as not known", () => {
    const until = at(900_000);
    expect(resolveQuotaState({ now: NOW, providers: ["gemini"], pauses: { gemini: { until, retryAtKnown: false } }, usedToday: {}, limits: {} }))
      .toMatchObject({ kind: "paused", untilKnown: false });
  });

  it("is all_paused with the EARLIEST resume time when every configured provider is paused", () => {
    const early = at(600_000);
    const late = at(7_200_000);
    expect(resolveQuotaState({ now: NOW, providers: BOTH, pauses: { gemini: { until: late }, groq: { until: early } }, usedToday: {}, limits: {} }))
      .toEqual({ kind: "all_paused", resumeAt: early, resumeKnown: true });
    expect(resolveQuotaState({ now: NOW, providers: BOTH, pauses: { gemini: { until: early }, groq: { until: late } }, usedToday: {}, limits: {} }))
      .toMatchObject({ kind: "all_paused", resumeAt: early });
  });

  it("ignores a pause that already ended (also one ending exactly now)", () => {
    expect(resolveQuotaState({ now: NOW, providers: BOTH, pauses: { gemini: { until: at(-1) }, groq: { until: NOW } }, usedToday: {}, limits: {} })).toEqual({ kind: "ok" });
  });

  it("one provider paused and the other fine is ok, and says which one answers", () => {
    expect(resolveQuotaState({ now: NOW, providers: BOTH, pauses: { gemini: { until: at(3_600_000) } }, usedToday: {}, limits: {} }))
      .toEqual({ kind: "ok", answeredBy: "groq", pausedProviders: ["gemini"] });
  });

  it("a provider that is not configured never counts as paused or as the answer", () => {
    expect(resolveQuotaState({ now: NOW, providers: ["gemini"], pauses: { groq: { until: at(3_600_000) } }, usedToday: {}, limits: {} })).toEqual({ kind: "ok" });
  });

  it("low is judged on the provider that still answers, not on a paused one", () => {
    expect(resolveQuotaState({ now: NOW, providers: BOTH, pauses: { gemini: { until: at(3_600_000) } }, usedToday: { gemini: 19, groq: 90 }, limits: { gemini: 20, groq: 100 } }))
      .toEqual({ kind: "low", provider: "groq", left: 10 });
  });
});

describe("geminiFreeKeyEvidence", () => {
  it("is true when the last recorded Gemini quota stop is recent, false when absent, old or junk", () => {
    expect(GEMINI_FREE_DAILY_LIMIT).toBe(20);
    expect(geminiFreeKeyEvidence(at(-86_400_000).toISOString(), NOW)).toBe(true);
    expect(geminiFreeKeyEvidence(at(3_600_000).toISOString(), NOW)).toBe(true);
    expect(geminiFreeKeyEvidence(at(-14 * 86_400_000).toISOString(), NOW)).toBe(true);
    expect(geminiFreeKeyEvidence(at(-14 * 86_400_000 - 1).toISOString(), NOW)).toBe(false);
    expect(geminiFreeKeyEvidence(null, NOW)).toBe(false);
    expect(geminiFreeKeyEvidence("not a date", NOW)).toBe(false);
  });
});
