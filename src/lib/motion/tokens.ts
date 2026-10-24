/**
 * TypeScript mirror of the motion tokens in src/app/motion-system.css.
 * CSS and Tailwind read the custom properties; framer-motion and ECharts
 * cannot, so they read these numbers. motion-system-contract.test.ts fails
 * if the two sides drift apart.
 */

/** Durations in milliseconds (CSS: --sf-dur-*). */
export const MOTION_MS = {
  micro: 100,
  fast: 150,
  base: 200,
  page: 250,
  panel: 300,
} as const;

/** Cubic-bezier control points (CSS: --sf-ease-*). */
export const MOTION_EASE = {
  out: [0.2, 0, 0, 1],
  in: [0.4, 0, 1, 1],
  standard: [0.4, 0, 0.2, 1],
  expo: [0.16, 1, 0.3, 1],
} as const;

/**
 * Chart animation budget. Canvas redraws are the costliest motion on a weak
 * GPU, so the first draw is short and an update shorter still.
 */
export const CHART_MOTION_MS = {
  firstDraw: 300,
  update: 220,
} as const;

/** framer-motion takes seconds. */
export const toSeconds = (ms: number): number => ms / 1000;
