import { z } from "zod";

import {
  UI_TIMING_BYTES_KEYS,
  UI_TIMING_COUNT_KEYS,
  UI_TIMING_MAX_BYTES,
  UI_TIMING_MAX_COUNT,
  UI_TIMING_MAX_MS,
  UI_TIMING_MS_KEYS,
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

const shape: Record<string, ReturnType<typeof wholeNumber>> = {};
for (const key of UI_TIMING_MS_KEYS) shape[key] = wholeNumber(UI_TIMING_MAX_MS);
for (const key of UI_TIMING_COUNT_KEYS) shape[key] = wholeNumber(UI_TIMING_MAX_COUNT);
for (const key of UI_TIMING_BYTES_KEYS) shape[key] = wholeNumber(UI_TIMING_MAX_BYTES);

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
  const source = parsed.data.timing as Record<string, number | undefined>;
  const result: UiTiming = {};
  for (const key of KEYS) {
    const value = source[key];
    if (value !== undefined) result[key] = value;
  }
  return Object.keys(result).length > 0 ? result : null;
}
