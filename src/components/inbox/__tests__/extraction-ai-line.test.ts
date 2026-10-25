import { describe, expect, it } from "vitest";

import { extractionAiLineState } from "@/components/inbox/extraction-ai-line";

// Local-time dates, so the tests give the same answer in any time zone.
const NOW = new Date(2026, 9, 25, 15, 30);
const iso = (y: number, m: number, d: number, h: number, min: number) => new Date(y, m - 1, d, h, min).toISOString();

const state = (aiFailure: string | undefined, aiRetryAt?: string, locale = "fr", now = NOW) =>
  extractionAiLineState({ aiFailure, aiRetryAt, now, locale });

describe("extractionAiLineState: no failure", () => {
  it("returns null when the AI did not fail", () => {
    expect(state(undefined)).toBeNull();
    expect(state("")).toBeNull();
    expect(state(undefined, iso(2026, 10, 25, 18, 0))).toBeNull();
  });
});

describe("extractionAiLineState: quota", () => {
  it.each(["GEMINI_QUOTA_EXHAUSTED", "GROQ_QUOTA_EXHAUSTED"])("%s with a time later today shows HH:mm", (code) => {
    expect(state(code, iso(2026, 10, 25, 18, 5))).toEqual({ kind: "quota", time: "18:05", sameDay: true });
  });

  it("pads the hour and uses a 24-hour clock with Latin digits in every language", () => {
    for (const locale of ["fr", "en", "ar"]) {
      expect(state("GEMINI_QUOTA_EXHAUSTED", iso(2026, 10, 25, 7, 5), locale, new Date(2026, 9, 25, 6, 0))).toEqual({
        kind: "quota",
        time: "07:05",
        sameDay: true,
      });
      expect(state("GEMINI_QUOTA_EXHAUSTED", iso(2026, 10, 25, 21, 40), locale)).toMatchObject({ time: "21:40" });
    }
  });

  it("adds the day when the pause ends on a later calendar day", () => {
    expect(state("GEMINI_QUOTA_EXHAUSTED", iso(2026, 10, 26, 9, 0))).toEqual({
      kind: "quota",
      time: "26/10 09:00",
      sameDay: false,
    });
  });

  it("treats just after midnight as the next day, even a few minutes away", () => {
    const late = new Date(2026, 9, 25, 23, 55);
    expect(state("GROQ_QUOTA_EXHAUSTED", iso(2026, 10, 26, 0, 10), "fr", late)).toEqual({
      kind: "quota",
      time: "26/10 00:10",
      sameDay: false,
    });
  });

  it("handles a month and year change", () => {
    const newYearsEve = new Date(2026, 11, 31, 22, 0);
    expect(state("GEMINI_QUOTA_EXHAUSTED", iso(2027, 1, 1, 8, 0), "en", newYearsEve)).toMatchObject({
      time: "01/01 08:00",
      sameDay: false,
    });
  });

  it("reads an ISO time with an offset as the same moment", () => {
    const retry = "2026-10-26T08:00:00+01:00";
    const d = new Date(retry);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const sameDay = d.getDate() === NOW.getDate();
    const result = state("GEMINI_QUOTA_EXHAUSTED", retry);
    expect(result).toMatchObject({ kind: "quota", sameDay });
    expect((result as { time: string }).time.endsWith(`${hh}:${mm}`)).toBe(true);
  });

  it.each([
    ["no retry time", undefined],
    ["an empty retry time", ""],
    ["a retry time in the past", iso(2026, 10, 25, 14, 0)],
    ["a retry time equal to now", NOW.toISOString()],
    ["a retry time that is not a date", "soon"],
    ["a bare number", "12"],
    ["an impossible date", "2026-13-45T99:00:00Z"],
  ])("has no time for %s", (_label, retry) => {
    expect(state("GEMINI_QUOTA_EXHAUSTED", retry)).toEqual({ kind: "quota", time: null, sameDay: false });
  });
});

describe("extractionAiLineState: key", () => {
  it.each(["GEMINI_KEY_INVALID", "GROQ_KEY_INVALID", "GEMINI_PERMISSION_DENIED", "GROQ_PERMISSION_DENIED"])(
    "%s asks the seller to check the key",
    (code) => {
      expect(state(code)).toEqual({ kind: "key" });
      expect(state(code, iso(2026, 10, 25, 18, 0))).toEqual({ kind: "key" });
    },
  );
});

describe("extractionAiLineState: any other failure", () => {
  it.each([
    "GEMINI_PROVIDER_UNAVAILABLE",
    "GROQ_PROVIDER_UNAVAILABLE",
    "GEMINI_NETWORK_ERROR",
    "GROQ_TIMEOUT",
    "GEMINI_EMPTY_RESPONSE",
    "GEMINI_INVALID_EXTRACTION",
    "GEMINI_KEY_MISSING",
    "SOMETHING_NEW",
    "QUOTA",
  ])("%s keeps the generic line", (code) => {
    expect(state(code, iso(2026, 10, 25, 18, 0))).toEqual({ kind: "failed" });
  });
});
