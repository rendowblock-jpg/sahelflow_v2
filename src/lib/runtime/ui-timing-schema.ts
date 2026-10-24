import { z } from "zod";

import {
  UI_TIMING_BYTES_KEYS,
  UI_TIMING_COUNT_KEYS,
  UI_TIMING_MAX_BYTES,
  UI_TIMING_MAX_COUNT,
  UI_TIMING_MAX_MS,
  UI_TIMING_MS_KEYS,
  UI_TIMING_SLOW_MAX,
  clampMilliseconds,
  isSlowResourceName,
  type UiSlowResource,
  type UiTiming,
  type UiTimingKey,
} from "@/lib/runtime/ui-timing";

/** A finite number becomes a whole number inside 0..max; anything else is dropped. */
function wholeNumber(max: number) {
  return z
    .unknown()
    .transform((value): number | undefined =>
      typeof value === "number" && Number.isFinite(value)
        ? Math.min(max, Math.max(0, Math.round(value)))
        : undefined,
    )
    .optional();
}

/** One slow file: exactly a plain `name` and a `ms` number, else dropped. */
function slowItem(raw: unknown): UiSlowResource | undefined {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const keys = Object.keys(raw);
  if (keys.length !== 2 || !keys.includes("name") || !keys.includes("ms")) return undefined;
  const { name, ms } = raw as { name: unknown; ms: unknown };
  const whole = clampMilliseconds(ms);
  return isSlowResourceName(name) && whole !== undefined ? { name, ms: whole } : undefined;
}

/** A list of at most 3 valid slow files; a longer list or one with nothing valid is dropped. */
const slowResources = z
  .unknown()
  .transform((value): UiSlowResource[] | undefined => {
    if (!Array.isArray(value) || value.length === 0 || value.length > UI_TIMING_SLOW_MAX) return undefined;
    const items: UiSlowResource[] = [];
    for (const raw of value) {
      const item = slowItem(raw);
      if (item) items.push(item);
    }
    return items.length > 0 ? items : undefined;
  })
  .optional();

const shape: Record<string, z.ZodTypeAny> = {};
for (const key of UI_TIMING_MS_KEYS) shape[key] = wholeNumber(UI_TIMING_MAX_MS);
for (const key of UI_TIMING_COUNT_KEYS) shape[key] = wholeNumber(UI_TIMING_MAX_COUNT);
for (const key of UI_TIMING_BYTES_KEYS) shape[key] = wholeNumber(UI_TIMING_MAX_BYTES);
shape.slowResources = slowResources;

const uiTimingSchema = z.object(shape).strict();
const uiTimingBodySchema = z.object({ timing: uiTimingSchema }).strict();

const KEYS: readonly UiTimingKey[] = [
  ...UI_TIMING_MS_KEYS,
  ...UI_TIMING_COUNT_KEYS,
  ...UI_TIMING_BYTES_KEYS,
];

/**
 * The timing object of a ready report, or null when the body is not exactly
 * `{ "timing": { ...known numbers } }` or holds no usable number. The result
 * has only known keys, each a whole number: a small fixed shape.
 */
export function parseUiTimingBody(text: string): UiTiming | null {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const parsed = uiTimingBodySchema.safeParse(json);
  if (!parsed.success) return null;
  const source = parsed.data.timing as Record<string, unknown>;
  const result: UiTiming = {};
  for (const key of KEYS) {
    const value = source[key];
    if (typeof value === "number") result[key] = value;
  }
  if (Array.isArray(source.slowResources)) result.slowResources = source.slowResources as UiSlowResource[];
  return Object.keys(result).length > 0 ? result : null;
}
