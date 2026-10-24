/**
 * Browser timing numbers sent with the "page is ready" signal.
 *
 * Whole numbers only: milliseconds since the navigation started, a file count
 * and byte totals. No URL, file name, title or text is ever read into the
 * result. Every field is optional; one the browser cannot report is left out.
 */

export const UI_TIMING_MAX_MS = 600_000;
export const UI_TIMING_MAX_COUNT = 100_000;
export const UI_TIMING_MAX_BYTES = 1_073_741_824;
export const UI_TIMING_BODY_MAX_BYTES = 2048;

export const UI_TIMING_MS_KEYS = [
  "responseStartMs",
  "responseEndMs",
  "domContentLoadedEventEndMs",
  "loadEventEndMs",
  "firstContentfulPaintMs",
  "beaconMs",
] as const;
export const UI_TIMING_COUNT_KEYS = ["scriptCount", "resourceCount"] as const;
export const UI_TIMING_BYTES_KEYS = ["scriptTransferBytes", "scriptDecodedBytes"] as const;

export type UiTimingKey =
  | (typeof UI_TIMING_MS_KEYS)[number]
  | (typeof UI_TIMING_COUNT_KEYS)[number]
  | (typeof UI_TIMING_BYTES_KEYS)[number];

export type UiTiming = Partial<Record<UiTimingKey, number>>;

function clampWhole(value: number, max: number): number {
  return Math.min(max, Math.max(0, Math.round(value)));
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function field(source: unknown, key: string): unknown {
  return source !== null && typeof source === "object"
    ? (source as Record<string, unknown>)[key]
    : undefined;
}

/** A browser milestone that is still 0 has not happened yet, so it is left out. */
function milestone(value: unknown): number | undefined {
  const number = finiteNumber(value);
  return number !== undefined && number > 0 ? clampWhole(number, UI_TIMING_MAX_MS) : undefined;
}

function entries(performance: unknown, type: string): unknown[] | undefined {
  try {
    const list: unknown = (performance as { getEntriesByType(type: string): unknown }).getEntriesByType(type);
    return Array.isArray(list) ? list : undefined;
  } catch {
    return undefined;
  }
}

function endsWithScriptExtension(name: unknown): boolean {
  if (typeof name !== "string") return false;
  const path = name.split(/[?#]/, 1)[0];
  return path.endsWith(".js") || path.endsWith(".mjs");
}

/** Only the file name's ending is looked at here; the name itself is never kept. */
function isScript(resource: unknown): boolean {
  const initiator = field(resource, "initiatorType");
  if (initiator === "script") return true;
  return (initiator === "link" || initiator === "other") && endsWithScriptExtension(field(resource, "name"));
}

function addMilestones(result: UiTiming, performance: unknown) {
  const navigation = entries(performance, "navigation")?.[0];
  const values: Array<[UiTimingKey, number | undefined]> = [
    ["responseStartMs", milestone(field(navigation, "responseStart"))],
    ["responseEndMs", milestone(field(navigation, "responseEnd"))],
    ["domContentLoadedEventEndMs", milestone(field(navigation, "domContentLoadedEventEnd"))],
    ["loadEventEndMs", milestone(field(navigation, "loadEventEnd"))],
  ];
  const paint = entries(performance, "paint")?.find(
    (entry) => field(entry, "name") === "first-contentful-paint",
  );
  values.push(["firstContentfulPaintMs", milestone(field(paint, "startTime"))]);
  for (const [key, value] of values) {
    if (value !== undefined) result[key] = value;
  }
}

function addBeacon(result: UiTiming, performance: unknown) {
  try {
    const beacon = milestone((performance as { now(): unknown }).now());
    if (beacon !== undefined) result.beaconMs = beacon;
  } catch {
    // The clock is optional.
  }
}

function addScripts(result: UiTiming, performance: unknown) {
  const resources = entries(performance, "resource");
  if (!resources) return;
  let scriptCount = 0;
  let transferBytes = 0;
  let decodedBytes = 0;
  for (const resource of resources) {
    if (!isScript(resource)) continue;
    scriptCount += 1;
    const transfer = finiteNumber(field(resource, "transferSize"));
    const decoded = finiteNumber(field(resource, "decodedBodySize"));
    if (transfer !== undefined && transfer > 0) transferBytes += transfer;
    if (decoded !== undefined && decoded > 0) decodedBytes += decoded;
  }
  result.scriptCount = clampWhole(scriptCount, UI_TIMING_MAX_COUNT);
  result.scriptTransferBytes = clampWhole(transferBytes, UI_TIMING_MAX_BYTES);
  result.scriptDecodedBytes = clampWhole(decodedBytes, UI_TIMING_MAX_BYTES);
  result.resourceCount = clampWhole(resources.length, UI_TIMING_MAX_COUNT);
}

/**
 * Reads the standard navigation, paint and resource entries and the clock of
 * the given `performance` object. Never throws.
 */
export function buildUiTiming(performance: unknown): UiTiming {
  const result: UiTiming = {};
  if (performance === null || typeof performance !== "object") return result;
  addMilestones(result, performance);
  addBeacon(result, performance);
  addScripts(result, performance);
  return result;
}
