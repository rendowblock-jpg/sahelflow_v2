import { describe, expect, it } from "vitest";

import {
  addShopDays,
  parseShopDate,
  shopDateString,
  shopHour,
  shopMonthRange,
  startOfShopDay,
} from "@/lib/time/shop-day";
import { HOST_TIME_ZONES, useHostTimeZone } from "@/test-utils/host-tz";

// Algeria is UTC+1 all year (no daylight saving since 1981), so 00:00 shop
// time is 23:00 UTC of the day before.
const DAY_EDGES: ReadonlyArray<{
  name: string;
  at: string;
  date: string;
  start: string;
  hour: number;
}> = [
  { name: "1 ms before shop midnight", at: "2026-10-24T22:59:59.999Z", date: "2026-10-24", start: "2026-10-23T23:00:00.000Z", hour: 23 },
  { name: "exactly shop midnight", at: "2026-10-24T23:00:00.000Z", date: "2026-10-25", start: "2026-10-24T23:00:00.000Z", hour: 0 },
  { name: "1 ms after shop midnight", at: "2026-10-24T23:00:00.001Z", date: "2026-10-25", start: "2026-10-24T23:00:00.000Z", hour: 0 },
  { name: "00:30 shop time, still 23:30 UTC", at: "2026-10-24T23:30:00.000Z", date: "2026-10-25", start: "2026-10-24T23:00:00.000Z", hour: 0 },
  { name: "UTC midnight is already 01:00 shop time", at: "2026-10-25T00:00:00.000Z", date: "2026-10-25", start: "2026-10-24T23:00:00.000Z", hour: 1 },
  { name: "year end", at: "2026-12-31T23:30:00.000Z", date: "2027-01-01", start: "2026-12-31T23:00:00.000Z", hour: 0 },
  { name: "month end (28 days)", at: "2026-02-28T23:00:00.000Z", date: "2026-03-01", start: "2026-02-28T23:00:00.000Z", hour: 0 },
  { name: "leap day", at: "2028-02-28T23:00:00.000Z", date: "2028-02-29", start: "2028-02-28T23:00:00.000Z", hour: 0 },
  { name: "summer has the same offset as winter", at: "2026-07-10T23:00:00.000Z", date: "2026-07-11", start: "2026-07-10T23:00:00.000Z", hour: 0 },
];

describe.each(HOST_TIME_ZONES)("shop day helper with the host set to %s", (zone) => {
  useHostTimeZone(zone);

  it("really runs under that host zone", () => {
    const expectedLocalHour = { UTC: 23, "America/Los_Angeles": 16, "Pacific/Kiritimati": 13 }[zone];
    expect(new Date("2026-10-24T23:30:00Z").getHours()).toBe(expectedLocalHour);
  });

  it.each(DAY_EDGES)("$name", ({ at, date, start, hour }) => {
    const instant = new Date(at);
    expect(shopDateString(instant)).toBe(date);
    expect(startOfShopDay(instant).toISOString()).toBe(start);
    expect(shopHour(instant)).toBe(hour);
  });

  it("adds whole shop days and stays on shop midnight", () => {
    const monthStart = startOfShopDay(new Date("2026-02-28T23:30:00Z")); // 1 March
    expect(addShopDays(monthStart, -1).toISOString()).toBe("2026-02-27T23:00:00.000Z");
    expect(shopDateString(addShopDays(monthStart, -1))).toBe("2026-02-28");
    expect(shopDateString(addShopDays(monthStart, 31))).toBe("2026-04-01");
  });

  it("parses a calendar date to its shop midnight and rejects impossible ones", () => {
    expect(parseShopDate("2026-10-25")?.toISOString()).toBe("2026-10-24T23:00:00.000Z");
    expect(parseShopDate("2028-02-29")?.toISOString()).toBe("2028-02-28T23:00:00.000Z");
    expect(parseShopDate("2026-02-31")).toBeNull();
    expect(parseShopDate("2026-1-5")).toBeNull();
    expect(parseShopDate("")).toBeNull();
  });

  it("gives the shop month as a half-open range", () => {
    const october = shopMonthRange(2026, 10);
    expect(october.gte.toISOString()).toBe("2026-09-30T23:00:00.000Z");
    expect(october.lt.toISOString()).toBe("2026-10-31T23:00:00.000Z");
    const december = shopMonthRange(2026, 12);
    expect(december.lt.toISOString()).toBe("2026-12-31T23:00:00.000Z");
  });
});
