"use client";

/**
 * Shared URL-state access for the analytics date range (R4-d).
 *
 * One parser map so every reader/writer of these params agrees on the same URL
 * contract (mirrors R2-a's orders filter hook):
 *   /analytics?range=7d|30d|90d|custom&from=2026-08-01&to=2026-08-30
 *
 * Writes are NOT shallow: the analytics workspace is server-computed, so a
 * range change must trigger a server re-render with the new window (nuqs
 * shallow:false performs the history + server navigation).
 */

import { useQueryStates } from "nuqs";

import {
  ANALYTICS_RANGE_PRESETS,
  DEFAULT_ANALYTICS_RANGE_PRESET,
} from "@/lib/analytics/range";

const nullableString = {
  parse: (value: string | null) => value ?? null,
  serialize: (value: string | null) => value ?? "",
};

const rangeParser = {
  parse: (value: string | null): string => {
    if (value === "custom") return "custom";
    return (ANALYTICS_RANGE_PRESETS as readonly string[]).includes(value ?? "")
      ? (value as string)
      : DEFAULT_ANALYTICS_RANGE_PRESET;
  },
  serialize: (value: string) => value,
};

export const analyticsRangeParsers = {
  range: rangeParser,
  from: nullableString,
  to: nullableString,
} as const;

export function useAnalyticsRangeParams() {
  const [params, setParams] = useQueryStates(analyticsRangeParsers, {
    shallow: false,
  });

  function selectPreset(preset: string) {
    void setParams({ range: preset, from: null, to: null });
  }

  function applyCustomRange(from: string, to: string) {
    void setParams({ range: "custom", from, to });
  }

  return {
    range: params.range,
    from: params.from,
    to: params.to,
    selectPreset,
    applyCustomRange,
    setParams,
  };
}
