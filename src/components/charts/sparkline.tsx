"use client";

import * as React from "react";

interface SparklineProps {
  data: Array<{ value: number }>;
  color?: string;
  height?: number;
  width?: number | string;
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
}: SparklineProps) {
  const gradientId = React.useId().replace(/:/g, "");
  if (data.length < 2) return null;

  const values = data.map((entry) =>
    Number.isFinite(entry.value) ? entry.value : 0,
  );
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 1);
  const usableWidth = VIEW_WIDTH - PAD_X * 2;
  const usableHeight = VIEW_HEIGHT - PAD_Y * 2;
  const points = values.map((value, index) => {
    const x =
      PAD_X + (index / Math.max(values.length - 1, 1)) * usableWidth;
    const y = PAD_Y + (1 - (value - min) / range) * usableHeight;
    return [x, y] as const;
  });
  const linePath = points
    .map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(" ");
  const areaPath = `${linePath} L${points.at(-1)![0].toFixed(2)} ${VIEW_HEIGHT} L${points[0]![0].toFixed(2)} ${VIEW_HEIGHT} Z`;

  return (
    <svg
      viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
      preserveAspectRatio="none"
      style={{ width, height, display: "block" }}
      aria-hidden="true"
      focusable="false"
      data-chart-engine="native-svg"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.26" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
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
    </svg>
  );
}
