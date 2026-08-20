"use client";

import * as React from "react";

interface SparklineProps {
  data: Array<{ value: number }>;
  color?: string;
  height?: number;
  width?: number | string;
  /**
   * Operational count/money trends should not exaggerate small changes by
   * treating the observed minimum as the visual floor. Keep this opt-in for
   * generic callers that genuinely need extent-only geometry.
   */
  zeroBaseline?: boolean;
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
}: SparklineProps) {
  const gradientId = React.useId().replace(/:/g, "");
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

  return (
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
}
