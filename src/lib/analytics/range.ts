/**
 * Analytics range authority (R4-d).
 *
 * One shared resolver for the analytics workspace date window. The URL contract
 * follows the R2-a orders filter pattern (URL-persisted, shareable, back/forward
 * safe):
 *   /analytics?range=7d|30d|90d|custom&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Presets are rolling windows inclusive of today — identical semantics to the
 * orders filter bar (7d = today minus 6 days through today). The legacy
 * `?days=N` links keep working: 7/30/90 map to presets, any other positive N
 * resolves to an equivalent custom window so old shares never change meaning.
 *
 * Pure and timezone-local: every consumer (page RSC, client controls, tests)
 * derives the exact same window from the same params + clock.
 */

export type AnalyticsRangePreset = "7d" | "30d" | "90d" | "custom";

export type AnalyticsRangePresetKey = Exclude<AnalyticsRangePreset, "custom">;

export const ANALYTICS_RANGE_PRESETS: readonly AnalyticsRangePresetKey[] = [
  "7d",
  "30d",
  "90d",
] as const;

export const DEFAULT_ANALYTICS_RANGE_PRESET: AnalyticsRangePresetKey = "30d";

export const ANALYTICS_PRESET_DAYS: Record<AnalyticsRangePresetKey, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

/**
 * Longest custom window we will compute (spans beyond a year are not useful
 * for COD operating decisions and would unbound the window buckets).
 */
export const MAX_ANALYTICS_RANGE_DAYS = 366;

/** Longest look-back for a custom window start (keeps SQLite scans bounded). */
const MAX_LOOKBACK_DAYS = 730;

export interface ResolvedAnalyticsRange {
  preset: AnalyticsRangePreset;
  /** Inclusive window start (start of the from-day, local time). */
  from: Date;
  /** Inclusive window end (start of the to-day, local time). */
  to: Date;
  /** Exclusive upper bound for queries (start of the day after `to`). */
  toExclusive: Date;
  /** Inclusive day count of the window (both ends counted). */
  days: number;
  fromIso: string;
  toIso: string;
}

export interface AnalyticsRangeParams {
  range?: string | null;
  from?: string | null;
  to?: string | null;
  /** Legacy pre-R4-d contract (`?days=30`) — still honored. */
  days?: string | null;
}

function startOfDay(value: Date): Date {
  const result = new Date(value);
  result.setHours(0, 0, 0, 0);
  return result;
}

function addDays(value: Date, count: number): Date {
  const result = new Date(value);
  result.setDate(result.getDate() + count);
  return result;
}

/** Local YYYY-MM-DD for URL params and drill-down links. */
export function toIsoDate(value: Date): string {
  const offset = value.getTimezoneOffset() * 60000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 10);
}

/** Strict YYYY-MM-DD parser — anything else (including "2026-1-5") is invalid. */
function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, year, month, day] = match;
  const parsed = new Date(
    Number.parseInt(year!, 10),
    Number.parseInt(month!, 10) - 1,
    Number.parseInt(day!, 10),
  );
  // Reject calendar-impossible dates (e.g. 2026-02-31) that Date rolls over.
  if (
    parsed.getFullYear() !== Number.parseInt(year!, 10) ||
    parsed.getMonth() !== Number.parseInt(month!, 10) - 1 ||
    parsed.getDate() !== Number.parseInt(day!, 10)
  ) {
    return null;
  }
  return startOfDay(parsed);
}

function buildRange(
  preset: AnalyticsRangePreset,
  from: Date,
  to: Date,
): ResolvedAnalyticsRange {
  const toExclusive = addDays(startOfDay(to), 1);
  const days = Math.max(
    1,
    Math.round((toExclusive.getTime() - from.getTime()) / 86_400_000),
  );
  return {
    preset,
    from,
    to: startOfDay(to),
    toExclusive,
    days,
    fromIso: toIsoDate(from),
    toIso: toIsoDate(to),
  };
}

function presetRange(
  preset: AnalyticsRangePresetKey,
  now: Date,
): ResolvedAnalyticsRange {
  const days = ANALYTICS_PRESET_DAYS[preset];
  const to = startOfDay(now);
  return buildRange(preset, addDays(to, -(days - 1)), to);
}

/**
 * Resolve the analytics window from URL params.
 *
 * Order of authority:
 *  1. `range` preset (7d/30d/90d) — rolling window ending today;
 *  2. `range=custom` (or any from/to present) — explicit window, sanitized:
 *     a lone `from` ends today, reversed bounds are swapped, the future is
 *     clamped to today and the span to MAX_ANALYTICS_RANGE_DAYS;
 *  3. legacy `days` — 7/30/90 map to presets, other positive values become the
 *     equivalent trailing custom window;
 *  4. anything invalid falls back to the 30d preset (never throws — analytics
 *     must render for a dirty URL, not 500).
 */
export function resolveAnalyticsRange(
  params: AnalyticsRangeParams,
  now: Date = new Date(),
): ResolvedAnalyticsRange {
  const today = startOfDay(now);
  const rangeParam = params.range?.trim();
  const fromParam = parseIsoDate(params.from);
  const toParam = parseIsoDate(params.to);

  if (rangeParam === "7d" || rangeParam === "30d" || rangeParam === "90d") {
    return presetRange(rangeParam, now);
  }

  if (rangeParam === "custom" || fromParam || toParam) {
    if (fromParam && toParam) {
      const [from, to] =
        fromParam.getTime() <= toParam.getTime()
          ? [fromParam, toParam]
          : [toParam, fromParam];
      // Clamp: no future windows, bounded span, bounded look-back.
      const cappedTo =
        to.getTime() > today.getTime() ? new Date(today) : new Date(to);
      const cappedFrom = new Date(cappedTo);
      cappedFrom.setDate(cappedFrom.getDate() - (MAX_ANALYTICS_RANGE_DAYS - 1));
      const flooredFrom = addDays(today, -MAX_LOOKBACK_DAYS);
      const fromFinal =
        from.getTime() < cappedFrom.getTime()
          ? new Date(cappedFrom)
          : from.getTime() < flooredFrom.getTime()
            ? new Date(flooredFrom)
            : new Date(from);
      return buildRange("custom", fromFinal, cappedTo);
    }
    if (fromParam) {
      // A lone `from` opens a window that ends today (a future `from` clamps
      // to today so the window is never empty/reversed).
      const from =
        fromParam.getTime() > today.getTime()
          ? new Date(today)
          : new Date(fromParam);
      return buildRange("custom", from, new Date(today));
    }
    if (toParam) {
      // A lone `to` anchors the window's end; keep a sane 30d span.
      const to =
        toParam.getTime() > today.getTime()
          ? new Date(today)
          : new Date(toParam);
      return buildRange("custom", addDays(to, -29), to);
    }
    return presetRange(DEFAULT_ANALYTICS_RANGE_PRESET, now);
  }

  const legacyDays = Number.parseInt(params.days?.trim() ?? "", 10);
  if (Number.isSafeInteger(legacyDays) && legacyDays > 0) {
    if (
      legacyDays === ANALYTICS_PRESET_DAYS["7d"] ||
      legacyDays === ANALYTICS_PRESET_DAYS["30d"] ||
      legacyDays === ANALYTICS_PRESET_DAYS["90d"]
    ) {
      const preset = (Object.keys(
        ANALYTICS_PRESET_DAYS,
      ) as AnalyticsRangePresetKey[]).find(
        (key) => ANALYTICS_PRESET_DAYS[key] === legacyDays,
      )!;
      return presetRange(preset, now);
    }
    return buildRange(
      "custom",
      addDays(today, -(Math.min(legacyDays, MAX_ANALYTICS_RANGE_DAYS) - 1)),
      today,
    );
  }

  return presetRange(DEFAULT_ANALYTICS_RANGE_PRESET, now);
}

/**
 * The comparison window: the equally-sized period immediately before `range`.
 * Day-aligned so a custom 12-day window compares against the previous 12 days.
 */
export function resolvePreviousRange(
  range: ResolvedAnalyticsRange,
): ResolvedAnalyticsRange {
  const from = addDays(range.from, -range.days);
  return buildRange(range.preset, from, addDays(range.from, -1));
}

/**
 * Drill-down target for the orders list (R2-a URL contract: status/from/to).
 * The orders workbench reads `from`/`to` as inclusive YYYY-MM-DD days.
 */
export function buildOrdersDrillDownUrl(options: {
  fromIso: string;
  toIso: string;
  status?: string;
  /** Wilaya code (wilayas.json) — the orders list filters by code, not name. */
  wilayaCode?: number;
}): string {
  const params = new URLSearchParams();
  if (options.status) params.set("status", options.status);
  if (options.wilayaCode !== undefined) {
    params.set("wilaya", String(options.wilayaCode));
  }
  params.set("from", options.fromIso);
  params.set("to", options.toIso);
  return `/orders?${params.toString()}`;
}
