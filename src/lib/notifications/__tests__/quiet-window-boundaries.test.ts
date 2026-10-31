import { describe, expect, it } from "vitest";
import { quietWindowEndedAt } from "../quiet-digest";
import { isInQuietHours } from "../quiet-hours";

// The shop clock is UTC+1: "shop HH:MM" is written with an explicit +01:00.
const shop = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00+01:00`);
const D = "2026-10-31";
const PREV = "2026-10-30";
const DAY_WINDOW = { quietStartMinute: 60, quietEndMinute: 180 }; // 01:00-03:00
const NIGHT_WINDOW = { quietStartMinute: 22 * 60, quietEndMinute: 6 * 60 }; // 22:00-06:00

describe("a window that does NOT wrap midnight (01:00-03:00)", () => {
  it("start is inside, end is outside", () => {
    expect(isInQuietHours(DAY_WINDOW, shop(D, "00:30"))).toBe(false);
    expect(isInQuietHours(DAY_WINDOW, shop(D, "01:00"))).toBe(true);
    expect(isInQuietHours(DAY_WINDOW, shop(D, "02:59"))).toBe(true);
    expect(isInQuietHours(DAY_WINDOW, shop(D, "03:00"))).toBe(false);
  });
  it("the end instant is the last 03:00, never a time in the future (the +1440 maths)", () => {
    // 00:30 is BEFORE today's window: the window that ended last was yesterday's.
    const before = quietWindowEndedAt(DAY_WINDOW, shop(D, "00:30"));
    expect(before?.toISOString()).toBe(shop(PREV, "03:00").toISOString());
    expect(before !== null && before.getTime() <= shop(D, "00:30").getTime()).toBe(true);
    expect(quietWindowEndedAt(DAY_WINDOW, shop(D, "01:00"))).toBeNull();
    expect(quietWindowEndedAt(DAY_WINDOW, shop(D, "02:59"))).toBeNull();
    expect(quietWindowEndedAt(DAY_WINDOW, shop(D, "03:00"))?.toISOString()).toBe(shop(D, "03:00").toISOString());
    expect(quietWindowEndedAt(DAY_WINDOW, shop(D, "12:00"))?.toISOString()).toBe(shop(D, "03:00").toISOString());
  });
});

describe("a window that wraps midnight (22:00-06:00)", () => {
  it("23:59 and 00:00 are inside, 06:00 and 06:01 are outside", () => {
    expect(isInQuietHours(NIGHT_WINDOW, shop(PREV, "23:59"))).toBe(true);
    expect(isInQuietHours(NIGHT_WINDOW, shop(D, "00:00"))).toBe(true);
    expect(isInQuietHours(NIGHT_WINDOW, shop(D, "06:00"))).toBe(false);
    expect(isInQuietHours(NIGHT_WINDOW, shop(D, "06:01"))).toBe(false);
  });
  it("inside there is no end yet; outside the end is the 06:00 just gone", () => {
    expect(quietWindowEndedAt(NIGHT_WINDOW, shop(PREV, "23:59"))).toBeNull();
    expect(quietWindowEndedAt(NIGHT_WINDOW, shop(D, "00:00"))).toBeNull();
    expect(quietWindowEndedAt(NIGHT_WINDOW, shop(D, "06:00"))?.toISOString()).toBe(shop(D, "06:00").toISOString());
    expect(quietWindowEndedAt(NIGHT_WINDOW, shop(D, "06:01"))?.toISOString()).toBe(shop(D, "06:00").toISOString());
    expect(quietWindowEndedAt(NIGHT_WINDOW, shop(D, "21:59"))?.toISOString()).toBe(shop(D, "06:00").toISOString());
  });
});
