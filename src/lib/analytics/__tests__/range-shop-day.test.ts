import { describe, expect, it } from "vitest";

import { resolveAnalyticsRange, resolvePreviousRange, toIsoDate } from "@/lib/analytics/range";
import { HOST_TIME_ZONES, useHostTimeZone } from "@/test-utils/host-tz";

// 23:30 UTC on 24 Oct is 00:30 on 25 Oct in Algeria: the shop's "today" is
// already the 25th whatever zone the computer is set to.
const AFTER_SHOP_MIDNIGHT = new Date("2026-10-24T23:30:00.000Z");

describe.each(HOST_TIME_ZONES)("analytics range with the host set to %s", (zone) => {
  useHostTimeZone(zone);

  it("7d preset ends on the shop's today and starts at shop midnight", () => {
    const range = resolveAnalyticsRange({ range: "7d" }, AFTER_SHOP_MIDNIGHT);
    expect(range.toIso).toBe("2026-10-25");
    expect(range.fromIso).toBe("2026-10-19");
    expect(range.from.toISOString()).toBe("2026-10-18T23:00:00.000Z");
    expect(range.toExclusive.toISOString()).toBe("2026-10-25T23:00:00.000Z");
    expect(range.days).toBe(7);
  });

  it("a typed custom window starts and ends at shop midnights", () => {
    const range = resolveAnalyticsRange(
      { range: "custom", from: "2026-10-20", to: "2026-10-22" },
      AFTER_SHOP_MIDNIGHT,
    );
    expect(range.from.toISOString()).toBe("2026-10-19T23:00:00.000Z");
    expect(range.toExclusive.toISOString()).toBe("2026-10-22T23:00:00.000Z");
    expect(range.fromIso).toBe("2026-10-20");
    expect(range.toIso).toBe("2026-10-22");
    expect(range.days).toBe(3);
  });

  it("a future end date is clamped to the shop's today", () => {
    const range = resolveAnalyticsRange(
      { range: "custom", from: "2026-10-20", to: "2026-12-01" },
      AFTER_SHOP_MIDNIGHT,
    );
    expect(range.toIso).toBe("2026-10-25");
  });

  it("the previous window ends the shop day before the current one starts", () => {
    const current = resolveAnalyticsRange({ range: "7d" }, AFTER_SHOP_MIDNIGHT);
    const previous = resolvePreviousRange(current);
    expect(previous.toIso).toBe("2026-10-18");
    expect(previous.fromIso).toBe("2026-10-12");
  });

  it("toIsoDate names the shop day of an instant", () => {
    expect(toIsoDate(new Date("2026-10-24T22:59:00.000Z"))).toBe("2026-10-24");
    expect(toIsoDate(new Date("2026-10-24T23:01:00.000Z"))).toBe("2026-10-25");
  });
});
