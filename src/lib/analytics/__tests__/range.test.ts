import { describe, expect, it } from "vitest";

import {
  ANALYTICS_PRESET_DAYS,
  buildOrdersDrillDownUrl,
  MAX_ANALYTICS_RANGE_DAYS,
  resolveAnalyticsRange,
  resolvePreviousRange,
  toIsoDate,
} from "@/lib/analytics/range";

/** Fixed local clock: 2026-01-15 12:00 — deterministic windows in any TZ. */
const NOW = new Date(2026, 0, 15, 12, 0, 0);
const TODAY = "2026-01-15";

describe("resolveAnalyticsRange", () => {
  it("defaults to the 30d preset inclusive of today", () => {
    const range = resolveAnalyticsRange({}, NOW);
    expect(range.preset).toBe("30d");
    expect(range.fromIso).toBe("2025-12-17");
    expect(range.toIso).toBe(TODAY);
    expect(range.days).toBe(30);
  });

  it.each(["7d", "30d", "90d"] as const)(
    "resolves the %s preset as a trailing inclusive window",
    (preset) => {
      const range = resolveAnalyticsRange({ range: preset }, NOW);
      const days = ANALYTICS_PRESET_DAYS[preset];
      expect(range.preset).toBe(preset);
      expect(range.days).toBe(days);
      expect(range.toIso).toBe(TODAY);
      const expectedFrom = new Date(NOW);
      expectedFrom.setDate(expectedFrom.getDate() - (days - 1));
      expect(range.fromIso).toBe(toIsoDate(expectedFrom));
      // toExclusive is the start of the day after `to`.
      expect(range.toExclusive.getTime()).toBeGreaterThan(range.to.getTime());
      expect(range.toExclusive.getDate()).toBe(16);
    },
  );

  it("resolves an explicit custom window", () => {
    const range = resolveAnalyticsRange(
      { range: "custom", from: "2025-12-01", to: "2025-12-12" },
      NOW,
    );
    expect(range.preset).toBe("custom");
    expect(range.fromIso).toBe("2025-12-01");
    expect(range.toIso).toBe("2025-12-12");
    expect(range.days).toBe(12);
  });

  it("swaps a reversed custom window instead of rejecting it", () => {
    const range = resolveAnalyticsRange(
      { range: "custom", from: "2025-12-12", to: "2025-12-01" },
      NOW,
    );
    expect(range.fromIso).toBe("2025-12-01");
    expect(range.toIso).toBe("2025-12-12");
  });

  it("clamps a future `to` to today", () => {
    const range = resolveAnalyticsRange(
      { range: "custom", from: "2026-01-10", to: "2026-02-01" },
      NOW,
    );
    expect(range.toIso).toBe(TODAY);
    expect(range.fromIso).toBe("2026-01-10");
  });

  it("caps a custom span at the maximum window", () => {
    const range = resolveAnalyticsRange(
      { range: "custom", from: "2020-01-01", to: "2026-01-15" },
      NOW,
    );
    expect(range.days).toBe(MAX_ANALYTICS_RANGE_DAYS);
    expect(range.toIso).toBe(TODAY);
  });

  it("ends a lone `from` at today", () => {
    const range = resolveAnalyticsRange({ from: "2026-01-02" }, NOW);
    expect(range.preset).toBe("custom");
    expect(range.fromIso).toBe("2026-01-02");
    expect(range.toIso).toBe(TODAY);
    expect(range.days).toBe(14);
  });

  it("anchors a lone `to` on a 30d window ending at it", () => {
    const range = resolveAnalyticsRange({ to: "2025-11-30" }, NOW);
    expect(range.preset).toBe("custom");
    expect(range.toIso).toBe("2025-11-30");
    expect(range.fromIso).toBe("2025-11-01");
    expect(range.days).toBe(30);
  });

  it("treats an impossible `from` as absent (lone valid `to` anchors the window)", () => {
    const range = resolveAnalyticsRange(
      { range: "custom", from: "2026-02-31", to: "2025-12-05" },
      NOW,
    );
    expect(range.preset).toBe("custom");
    expect(range.toIso).toBe("2025-12-05");
    expect(range.fromIso).toBe("2025-11-06");
  });

  it("rejects loose date formats", () => {
    expect(resolveAnalyticsRange({ from: "2026-1-5" }, NOW).preset).toBe("30d");
    expect(
      resolveAnalyticsRange({ from: "not-a-date" }, NOW).preset,
    ).toBe("30d");
  });

  it("maps legacy ?days=7/30/90 onto presets", () => {
    expect(resolveAnalyticsRange({ days: "7" }, NOW).preset).toBe("7d");
    expect(resolveAnalyticsRange({ days: "90" }, NOW).preset).toBe("90d");
    expect(resolveAnalyticsRange({ days: "30" }, NOW).days).toBe(30);
  });

  it("keeps the legacy ?days=14 window as an equivalent custom range", () => {
    const range = resolveAnalyticsRange({ days: "14" }, NOW);
    expect(range.preset).toBe("custom");
    expect(range.days).toBe(14);
    expect(range.toIso).toBe(TODAY);
  });

  it("ignores garbage legacy days values", () => {
    expect(resolveAnalyticsRange({ days: "all" }, NOW).preset).toBe("30d");
    expect(resolveAnalyticsRange({ days: "-5" }, NOW).preset).toBe("30d");
  });
});

describe("resolvePreviousRange", () => {
  it("returns the equal-length period immediately before the window", () => {
    const range = resolveAnalyticsRange(
      { range: "custom", from: "2025-12-01", to: "2025-12-12" },
      NOW,
    );
    const previous = resolvePreviousRange(range);
    expect(previous.days).toBe(12);
    expect(previous.toIso).toBe("2025-11-30");
    expect(previous.fromIso).toBe("2025-11-19");
  });

  it("chains day-aligned for presets", () => {
    const range = resolveAnalyticsRange({ range: "7d" }, NOW);
    const previous = resolvePreviousRange(range);
    expect(previous.days).toBe(7);
    expect(previous.toIso).toBe("2026-01-08");
    expect(previous.fromIso).toBe("2026-01-02");
  });
});

describe("buildOrdersDrillDownUrl", () => {
  it("targets the orders list with the R2-a from/to contract", () => {
    expect(
      buildOrdersDrillDownUrl({ fromIso: "2026-01-01", toIso: "2026-01-31" }),
    ).toBe("/orders?from=2026-01-01&to=2026-01-31");
  });

  it("carries status and wilaya filters when provided", () => {
    expect(
      buildOrdersDrillDownUrl({
        fromIso: "2026-01-01",
        toIso: "2026-01-31",
        status: "delivered",
        wilayaCode: 16,
      }),
    ).toBe("/orders?status=delivered&wilaya=16&from=2026-01-01&to=2026-01-31");
  });
});

describe("toIsoDate", () => {
  it("serializes local dates as YYYY-MM-DD", () => {
    expect(toIsoDate(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05");
  });
});
