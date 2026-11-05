/**
 * One rule for "change versus a baseline", shared by the dashboard and the analytics page (F-0048, F-0049).
 *  - there is a baseline: the plain percentage;
 *  - no baseline and nothing now: 0 (nothing happened on either side);
 *  - no baseline but something now: null. Growth from nothing has no meaningful percentage ("+100 %" would be
 *    false), so the page shows a dash instead.
 * Reaching zero from something is a real -100 %.
 */
export function percentChange(value: number, baseline: number): number | null {
  if (baseline === 0) return value > 0 ? null : 0;
  return ((value - baseline) / baseline) * 100;
}

/** The dashboard card shows whole percents. `|| 0` turns a rounded -0 into 0. */
export function roundedPercentChange(value: number, baseline: number): number | null {
  const change = percentChange(value, baseline);
  return change === null ? null : Math.round(change) || 0;
}
