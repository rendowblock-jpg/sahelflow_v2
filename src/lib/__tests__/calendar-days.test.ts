import { describe, expect, it } from "vitest";

import { calendarDayDiff } from "@/lib/calendar-days";

// Every date is built from LOCAL parts, so the tests mean the same thing in
// every time zone (the app runs on the seller's own PC clock).
const at = (year: number, month: number, day: number, hour = 0, minute = 0) =>
  new Date(year, month - 1, day, hour, minute).getTime();

describe("calendarDayDiff", () => {
  it("is 0 anywhere inside the same calendar day", () => {
    expect(calendarDayDiff(at(2026, 10, 18, 0, 5), at(2026, 10, 18, 23, 55))).toBe(0);
    expect(calendarDayDiff(at(2026, 10, 18, 12), at(2026, 10, 18, 12))).toBe(0);
  });

  it("is 1 for two minutes that straddle midnight", () => {
    expect(calendarDayDiff(at(2026, 10, 18, 23, 59), at(2026, 10, 19, 0, 1))).toBe(1);
  });

  it("counts calendar days, not blocks of 24 hours: Sunday 19:39 seen on Tuesday 02:24 is 2", () => {
    // 31 hours apart. floor(31 / 24) is 1, which the inbox showed as "yesterday".
    expect(calendarDayDiff(at(2026, 10, 18, 19, 39), at(2026, 10, 20, 2, 24))).toBe(2);
  });

  it("is still 1 for 25 hours when only one midnight lies between", () => {
    expect(calendarDayDiff(at(2026, 10, 19, 0, 30), at(2026, 10, 20, 1, 30))).toBe(1);
  });

  it("crosses the end of a month and of a year", () => {
    expect(calendarDayDiff(at(2026, 9, 30, 23), at(2026, 10, 1, 1))).toBe(1);
    expect(calendarDayDiff(at(2026, 12, 31, 23), at(2027, 1, 1, 1))).toBe(1);
    expect(calendarDayDiff(at(2027, 2, 28, 12), at(2027, 3, 1, 12))).toBe(1);
  });

  it("is negative when the second instant is the earlier one", () => {
    expect(calendarDayDiff(at(2026, 10, 20, 2), at(2026, 10, 18, 19))).toBe(-2);
  });

  it("accepts Date objects as well as timestamps", () => {
    expect(calendarDayDiff(new Date(at(2026, 10, 18, 19)), new Date(at(2026, 10, 20, 2)))).toBe(2);
  });
});
