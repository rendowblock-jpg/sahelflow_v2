/**
 * Browser timing numbers sent with the "page is ready" signal.
 *
 * Whole numbers: milliseconds since the navigation started, counts and byte
 * totals. The one text field is `slowResources`: the 3 slowest files, each as
 * the static path of an app file (`/_next/...`, no origin, query or fragment)
 * or `other:<kind>` for anything else, so a page path or an API address with an
 * id in it never leaves the browser. Every field is optional; one the browser
 * cannot report is left out.
 */

export const UI_TIMING_MAX_MS = 600_000;
export const UI_TIMING_MAX_COUNT = 100_000;
export const UI_TIMING_MAX_BYTES = 1_073_741_824;
export const UI_TIMING_BODY_MAX_BYTES = 2048;
export const UI_TIMING_SLOW_MAX = 3;
export const UI_TIMING_SLOW_NAME_MAX = 120;

const SLOW_NAME_PATH = /^\/[A-Za-z0-9._~%@()[\]:+,=/-]*$/;
const SLOW_NAME_OTHER = /^other:[a-z]{1,20}$/;

export const UI_TIMING_MS_KEYS = [
  "responseStartMs",
  "responseEndMs",
  "domInteractiveMs",
  "domContentLoadedEventEndMs",
  "loadEventEndMs",
  "firstContentfulPaintMs",
  "largestContentfulPaintMs",
  "beaconMs",
] as const;
export const UI_TIMING_COUNT_KEYS = ["scriptCount", "resourceCount"] as const;
export const UI_TIMING_BYTES_KEYS = [
  "scriptTransferBytes",
  "scriptDecodedBytes",
  "resourceTransferBytes",
] as const;

export type UiTimingKey =
  | (typeof UI_TIMING_MS_KEYS)[number]
  | (typeof UI_TIMING_COUNT_KEYS)[number]
  | (typeof UI_TIMING_BYTES_KEYS)[number];

export type UiSlowResource = { name: string; ms: number };

export type UiTiming = Partial<Record<UiTimingKey, number>> & {
  slowResources?: UiSlowResource[];
};

/** Whether a slow-resource name is a plain app path or `other:<kind>` of allowed length. */
export function isSlowResourceName(name: unknown): name is string {
  return (
    typeof name === "string" &&
    name.length > 0 &&
    name.length <= UI_TIMING_SLOW_NAME_MAX &&
    (SLOW_NAME_PATH.test(name) || SLOW_NAME_OTHER.test(name))
  );
}

/** Whole milliseconds inside the range, or undefined for anything that is not a finite number. */
export function clampMilliseconds(value: unknown): number | undefined {
  return finiteNumber(value) === undefined ? undefined : clampWhole(value as number, UI_TIMING_MAX_MS);
}

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
  const path = name.split(/[?#]/, 1)[0] ?? "";
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
    ["domInteractiveMs", milestone(field(navigation, "domInteractive"))],
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
  let allTransferBytes = 0;
  for (const resource of resources) {
    const everyTransfer = finiteNumber(field(resource, "transferSize"));
    if (everyTransfer !== undefined && everyTransfer > 0) allTransferBytes += everyTransfer;
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
  result.resourceTransferBytes = clampWhole(allTransferBytes, UI_TIMING_MAX_BYTES);
  const slow = slowestResources(resources);
  if (slow.length > 0) result.slowResources = slow;
}

/** A name that is safe to send: the static path of an app file, else only its kind. */
function slowName(resource: unknown): string {
  const name = field(resource, "name");
  if (typeof name === "string") {
    try {
      const path = new URL(name).pathname.slice(0, UI_TIMING_SLOW_NAME_MAX);
      if (path.startsWith("/_next/") && isSlowResourceName(path)) return path;
    } catch {
      // Not an absolute address: only its kind is reported.
    }
  }
  const kind = field(resource, "initiatorType");
  return typeof kind === "string" && /^[a-z]{1,20}$/.test(kind) ? `other:${kind}` : "other:unknown";
}

function slowestResources(resources: unknown[]): UiSlowResource[] {
  const timed: Array<{ duration: number; resource: unknown }> = [];
  for (const resource of resources) {
    const duration = finiteNumber(field(resource, "duration"));
    if (duration !== undefined && duration > 0) timed.push({ duration, resource });
  }
  timed.sort((a, b) => b.duration - a.duration);
  return timed.slice(0, UI_TIMING_SLOW_MAX).map(({ duration, resource }) => ({
    name: slowName(resource),
    ms: clampWhole(duration, UI_TIMING_MAX_MS),
  }));
}

/**
 * The last largest-contentful-paint candidate the browser has, in whole
 * milliseconds, or undefined. Chromium keeps these only for an observer, so one
 * is started with `buffered: true` and read after a single timer tick (the
 * buffered entries arrive in a task queued by `observe`). `win` is the browser
 * window; it never rejects and never waits longer than `settleMs`.
 */
export function readLargestContentfulPaint(win: unknown, settleMs = 0): Promise<number | undefined> {
  return new Promise((resolve) => {
    try {
      const Observer = field(win, "PerformanceObserver") as
        | (new (callback: (list: unknown) => void) => {
            observe(init: unknown): void;
            takeRecords(): unknown;
            disconnect(): void;
          })
        | undefined;
      const wait = field(win, "setTimeout") as ((fn: () => void, ms: number) => unknown) | undefined;
      // A class is a function, so `field` (objects only) cannot read its static list.
      const supported =
        typeof Observer === "function"
          ? (Observer as unknown as { supportedEntryTypes?: unknown }).supportedEntryTypes
          : undefined;
      if (
        typeof Observer !== "function" ||
        typeof wait !== "function" ||
        !Array.isArray(supported) ||
        !supported.includes("largest-contentful-paint")
      ) {
        resolve(undefined);
        return;
      }
      let last: number | undefined;
      const take = (entries: unknown) => {
        if (!Array.isArray(entries)) return;
        for (const entry of entries) {
          const value = milestone(field(entry, "startTime"));
          if (value !== undefined) last = value;
        }
      };
      const observer = new Observer((list) => {
        try {
          take((list as { getEntries(): unknown }).getEntries());
        } catch {
          // A bad list is ignored.
        }
      });
      observer.observe({ type: "largest-contentful-paint", buffered: true });
      wait.call(
        win,
        () => {
          try {
            take(observer.takeRecords());
            observer.disconnect();
          } catch {
            // Keep what was collected.
          }
          resolve(last);
        },
        settleMs,
      );
    } catch {
      resolve(undefined);
    }
  });
}

/**
 * Reads the standard navigation, paint and resource entries and the clock of
 * the given `performance` object, plus the largest-contentful-paint value the
 * caller already read (see `readLargestContentfulPaint`). Never throws.
 */
export function buildUiTiming(
  performance: unknown,
  extra: { largestContentfulPaintMs?: number } = {},
): UiTiming {
  const result: UiTiming = {};
  const lcp = milestone(extra.largestContentfulPaintMs);
  if (lcp !== undefined) result.largestContentfulPaintMs = lcp;
  if (performance === null || typeof performance !== "object") return result;
  addMilestones(result, performance);
  addBeacon(result, performance);
  addScripts(result, performance);
  return result;
}
