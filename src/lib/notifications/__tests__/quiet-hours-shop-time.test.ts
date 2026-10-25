import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { isInQuietHours } from "@/lib/notifications/quiet-hours";
import { SHOP_TIME_ZONE } from "@/lib/time/shop-day";
import { HOST_TIME_ZONES, useHostTimeZone } from "@/test-utils/host-tz";

// Quiet hours are read on the shop clock (Africa/Algiers), never on the clock
// of the computer or server that runs the app. Algeria is UTC+1 all year, so
// "+01:00" in an instant below IS the shop wall-clock time.
const m = (hour: number, minute = 0) => hour * 60 + minute;

const NIGHT = { quietStartMinute: m(22), quietEndMinute: m(7) }; // wraps midnight
const DAYTIME = { quietStartMinute: m(9, 30), quietEndMinute: m(17, 45) };
const TO_MIDNIGHT = { quietStartMinute: m(22), quietEndMinute: 0 };

const BOUNDARIES: ReadonlyArray<{
  name: string;
  window: typeof NIGHT;
  shopTime: string;
  quiet: boolean;
}> = [
  { name: "22:00-07:00, 1 ms before the start", window: NIGHT, shopTime: "2026-10-24T21:59:59.999+01:00", quiet: false },
  { name: "22:00-07:00, exactly the start", window: NIGHT, shopTime: "2026-10-24T22:00:00.000+01:00", quiet: true },
  { name: "22:00-07:00, 1 ms after the start", window: NIGHT, shopTime: "2026-10-24T22:00:00.001+01:00", quiet: true },
  { name: "22:00-07:00, last ms before midnight", window: NIGHT, shopTime: "2026-10-24T23:59:59.999+01:00", quiet: true },
  { name: "22:00-07:00, exactly shop midnight", window: NIGHT, shopTime: "2026-10-25T00:00:00.000+01:00", quiet: true },
  { name: "22:00-07:00, 03:30 in the night", window: NIGHT, shopTime: "2026-10-25T03:30:00.000+01:00", quiet: true },
  { name: "22:00-07:00, 1 ms before the end", window: NIGHT, shopTime: "2026-10-25T06:59:59.999+01:00", quiet: true },
  { name: "22:00-07:00, exactly the end", window: NIGHT, shopTime: "2026-10-25T07:00:00.000+01:00", quiet: false },
  { name: "22:00-07:00, 1 ms after the end", window: NIGHT, shopTime: "2026-10-25T07:00:00.001+01:00", quiet: false },
  { name: "22:00-07:00, midday", window: NIGHT, shopTime: "2026-10-25T12:00:00.000+01:00", quiet: false },
  { name: "09:30-17:45, 1 ms before the start", window: DAYTIME, shopTime: "2026-10-24T09:29:59.999+01:00", quiet: false },
  { name: "09:30-17:45, exactly the start", window: DAYTIME, shopTime: "2026-10-24T09:30:00.000+01:00", quiet: true },
  { name: "09:30-17:45, 1 ms before the end", window: DAYTIME, shopTime: "2026-10-24T17:44:59.999+01:00", quiet: true },
  { name: "09:30-17:45, exactly the end", window: DAYTIME, shopTime: "2026-10-24T17:45:00.000+01:00", quiet: false },
  { name: "22:00-00:00, last ms before midnight", window: TO_MIDNIGHT, shopTime: "2026-10-24T23:59:59.999+01:00", quiet: true },
  { name: "22:00-00:00, exactly midnight (end)", window: TO_MIDNIGHT, shopTime: "2026-10-25T00:00:00.000+01:00", quiet: false },
];

/** Minute of the day on the shop clock, read through Intl (an independent oracle). */
function shopMinuteViaIntl(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: SHOP_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const part = (type: string) => {
    const found = parts.find((p) => p.type === type);
    if (!found) throw new Error(`Intl gave no ${type}`);
    return Number(found.value);
  };
  return part("hour") * 60 + part("minute");
}

function expectedQuiet(window: typeof NIGHT, at: Date): boolean {
  const { quietStartMinute: s, quietEndMinute: e } = window;
  const minute = shopMinuteViaIntl(at);
  return s < e ? minute >= s && minute < e : minute >= s || minute < e;
}

// UTC days chosen around the Los Angeles daylight-saving changes (8 Mar and
// 1 Nov 2026) plus a plain summer and winter day.
const SWEEP_DAYS = ["2026-03-08", "2026-07-10", "2026-11-01", "2026-12-15"];

describe.each(HOST_TIME_ZONES)(
  "quiet hours with the host clock set to %s",
  (zone) => {
    useHostTimeZone(zone);

    it("really runs under that host zone", () => {
      const expectedLocalHour = {
        UTC: 23,
        "America/Los_Angeles": 16,
        "Pacific/Kiritimati": 13,
      }[zone];
      expect(new Date("2026-10-24T23:30:00Z").getHours()).toBe(expectedLocalHour);
    });

    it.each(BOUNDARIES)(
      "$name is evaluated on the shop clock",
      ({ window, shopTime, quiet }) => {
        expect(isInQuietHours(window, new Date(shopTime))).toBe(quiet);
      },
    );

    it("gives the same answer as the shop clock for every minute of four days", () => {
      let checked = 0;
      for (const day of SWEEP_DAYS) {
        const dayStart = Date.parse(`${day}T00:00:00.000Z`);
        for (let minute = 0; minute < 1440; minute += 1) {
          const at = new Date(dayStart + minute * 60_000);
          for (const window of [NIGHT, DAYTIME, TO_MIDNIGHT]) {
            if (isInQuietHours(window, at) !== expectedQuiet(window, at)) {
              throw new Error(
                `wrong answer at ${at.toISOString()} for ${JSON.stringify(window)}`,
              );
            }
            checked += 1;
          }
        }
      }
      expect(checked).toBe(SWEEP_DAYS.length * 1440 * 3);
    });

    it("has no window when a minute is missing or start equals end", () => {
      const at = new Date("2026-10-24T23:00:00.000+01:00");
      expect(isInQuietHours({ quietStartMinute: null, quietEndMinute: null }, at)).toBe(false);
      expect(isInQuietHours({ quietStartMinute: m(22), quietEndMinute: null }, at)).toBe(false);
      expect(isInQuietHours({ quietStartMinute: null, quietEndMinute: m(7) }, at)).toBe(false);
      expect(isInQuietHours({ quietStartMinute: m(23), quietEndMinute: m(23) }, at)).toBe(false);
    });
  },
);

// What the code did before this change: it read the host clock. On a host that
// already runs on Algiers time the new answer must be identical.
function answerBeforeThisChange(window: typeof NIGHT, at: Date): boolean {
  const { quietStartMinute: s, quietEndMinute: e } = window;
  if (s === e) return false;
  const minute = at.getHours() * 60 + at.getMinutes();
  return s < e ? minute >= s && minute < e : minute >= s || minute < e;
}

describe("quiet hours with the host clock on Algiers time", () => {
  useHostTimeZone(SHOP_TIME_ZONE);

  it("really runs under that host zone", () => {
    expect(new Date("2026-10-24T23:30:00Z").getHours()).toBe(0);
  });

  it("gives exactly the answer the host-clock code gave, for every minute of four days", () => {
    let checked = 0;
    for (const day of SWEEP_DAYS) {
      const dayStart = Date.parse(`${day}T00:00:00.000Z`);
      for (let minute = 0; minute < 1440; minute += 1) {
        const at = new Date(dayStart + minute * 60_000);
        for (const window of [NIGHT, DAYTIME, TO_MIDNIGHT]) {
          if (isInQuietHours(window, at) !== answerBeforeThisChange(window, at)) {
            throw new Error(
              `differs from before at ${at.toISOString()} for ${JSON.stringify(window)}`,
            );
          }
          checked += 1;
        }
      }
    }
    expect(checked).toBe(SWEEP_DAYS.length * 1440 * 3);
  });

  it.each(BOUNDARIES)("$name is unchanged", ({ window, shopTime, quiet }) => {
    const at = new Date(shopTime);
    expect(answerBeforeThisChange(window, at)).toBe(quiet);
    expect(isInQuietHours(window, at)).toBe(quiet);
  });
});

describe("native delivery uses the shop-clock evaluation", () => {
  it("claimNativeDelivery decides quiet hours through isInQuietHours, not the host clock", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/lib/notifications/notification-center.ts"),
      "utf8",
    );
    expect(source).toContain("isInQuietHours(preference, now)");
    expect(source).not.toMatch(/\.getHours\(|\.getMinutes\(/);
  });
});
