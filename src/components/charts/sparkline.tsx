"use client";

import * as React from "react";

export interface SparklinePoint {
  value: number;
  /** ISO day the point describes — enables the interactive read-out. */
  date?: string;
}

interface SparklineProps {
  data: SparklinePoint[];
  color?: string;
  height?: number;
  width?: number | string;
  /**
   * Operational count/money trends should not exaggerate small changes by
   * treating the observed minimum as the visual floor. Keep this opt-in for
   * generic callers that genuinely need extent-only geometry.
   */
  zeroBaseline?: boolean;
  /**
   * Hover / arrow-key exploration. The chart reports the explored index and
   * draws a guide + marker; the caller owns what the index means (the stat
   * card turns it into the headline value and date).
   */
  interactive?: boolean;
  activeIndex?: number | null;
  onActiveIndexChange?: (index: number | null) => void;
  /** Accessible name for the explorable chart. */
  label?: string;
  /** Floating read-out for the active point (already localized by the caller). */
  readout?: React.ReactNode;
  /** Spoken value for the explored point (aria-valuetext). */
  valueText?: string;
}

const VIEW_WIDTH = 100;
const VIEW_HEIGHT = 40;
const PAD_X = 2;
const PAD_Y = 4;

export function Sparkline({
  data,
  color = "var(--color-chart-1)",
  height = 40,
  width = "100%",
  zeroBaseline = false,
  interactive = false,
  activeIndex = null,
  onActiveIndexChange,
  label,
  readout,
  valueText,
}: SparklineProps) {
  const gradientId = React.useId().replace(/:/g, "");
  const frameRef = React.useRef<HTMLDivElement | null>(null);
  if (data.length < 2) return null;

  const values = data.map((entry) =>
    Number.isFinite(entry.value) ? entry.value : 0,
  );
  const observedMin = Math.min(...values);
  const min = zeroBaseline ? Math.min(0, observedMin) : observedMin;
  const max = Math.max(...values);
  const range = Math.max(max - min, 1);
  const usableWidth = VIEW_WIDTH - PAD_X * 2;
  const usableHeight = VIEW_HEIGHT - PAD_Y * 2;
  const yFor = (value: number) =>
    PAD_Y + (1 - (value - min) / range) * usableHeight;
  const points = values.map((value, index) => {
    const x =
      PAD_X + (index / Math.max(values.length - 1, 1)) * usableWidth;
    return [x, yFor(value)] as const;
  });
  const linePath = points
    .map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(" ");
  const baselineY = zeroBaseline && min <= 0 && max >= 0 ? yFor(0) : VIEW_HEIGHT;
  const areaPath = `${linePath} L${points.at(-1)![0].toFixed(2)} ${baselineY.toFixed(2)} L${points[0]![0].toFixed(2)} ${baselineY.toFixed(2)} Z`;
  const firstPoint = points[0]!;
  const lastPoint = points.at(-1)!;

  const chart = (
    <svg
      viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
      preserveAspectRatio="none"
      style={{ width, height, display: "block" }}
      aria-hidden="true"
      focusable="false"
      data-chart-engine="native-svg"
      data-sparkline-zero-baseline={zeroBaseline ? "true" : "false"}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {zeroBaseline ? (
        <line
          x1={PAD_X}
          x2={VIEW_WIDTH - PAD_X}
          y1={baselineY}
          y2={baselineY}
          stroke="currentColor"
          strokeOpacity="0.14"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
          data-sparkline-zero-line="true"
        />
      ) : null}
      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle
        cx={firstPoint[0]}
        cy={firstPoint[1]}
        r="1.6"
        fill={color}
        opacity="0.5"
        data-sparkline-start="true"
      />
      <circle
        cx={lastPoint[0]}
        cy={lastPoint[1]}
        r="2.35"
        fill={color}
        stroke="var(--card)"
        strokeWidth="1.2"
        vectorEffect="non-scaling-stroke"
        data-sparkline-latest="true"
      />
    </svg>
  );

  if (!interactive) return chart;

  const indexFromPointer = (clientX: number) => {
    const frame = frameRef.current;
    if (!frame) return null;
    const rect = frame.getBoundingClientRect();
    if (rect.width <= 0) return null;
    const ratio = (clientX - rect.left) / rect.width;
    const viewX = ratio * VIEW_WIDTH;
    const step = usableWidth / Math.max(values.length - 1, 1);
    const index = Math.round((viewX - PAD_X) / step);
    return Math.min(values.length - 1, Math.max(0, index));
  };
  const active =
    activeIndex !== null ? (points[activeIndex] ?? null) : null;
  const leftPct = active ? (active[0] / VIEW_WIDTH) * 100 : 0;
  const topPct = active ? (active[1] / VIEW_HEIGHT) * 100 : 0;

  return (
    <div
      ref={frameRef}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={values.length - 1}
      aria-valuenow={activeIndex ?? values.length - 1}
      aria-valuetext={valueText ?? (typeof readout === "string" ? readout : undefined)}
      data-sparkline-interactive="true"
      className="relative cursor-crosshair touch-none rounded-control outline-none focus-visible:ring-2 focus-visible:ring-ring"
      style={{ width, height }}
      onPointerMove={(event) => onActiveIndexChange?.(indexFromPointer(event.clientX))}
      onPointerDown={(event) => onActiveIndexChange?.(indexFromPointer(event.clientX))}
      onPointerLeave={() => onActiveIndexChange?.(null)}
      onBlur={() => onActiveIndexChange?.(null)}
      onKeyDown={(event) => {
        const current = activeIndex ?? values.length - 1;
        // The time axis runs oldest → latest left to right in every locale.
        if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
          event.preventDefault();
          onActiveIndexChange?.(Math.max(0, current - 1));
        } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
          event.preventDefault();
          onActiveIndexChange?.(Math.min(values.length - 1, current + 1));
        } else if (event.key === "Home") {
          event.preventDefault();
          onActiveIndexChange?.(0);
        } else if (event.key === "End") {
          event.preventDefault();
          onActiveIndexChange?.(values.length - 1);
        } else if (event.key === "Escape") {
          onActiveIndexChange?.(null);
        }
      }}
    >
      {chart}
      {active ? (
        <>
          <span
            aria-hidden="true"
            data-sparkline-guide="true"
            className="pointer-events-none absolute inset-y-0 w-px bg-foreground/25"
            style={{ left: `${leftPct}%` }}
          />
          <span
            aria-hidden="true"
            data-sparkline-marker="true"
            className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card"
            style={{ left: `${leftPct}%`, top: `${topPct}%`, background: color }}
          />
          {readout ? (
            <span
              data-sparkline-readout="true"
              className="pointer-events-none absolute bottom-full z-10 mb-1.5 whitespace-nowrap rounded-control border border-border bg-popover px-2 py-1 text-caption font-medium text-popover-foreground shadow-(--elevation-2)"
              style={{
                left: `${Math.min(Math.max(leftPct, 12), 88)}%`,
                transform: "translateX(-50%)",
              }}
            >
              {readout}
            </span>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
