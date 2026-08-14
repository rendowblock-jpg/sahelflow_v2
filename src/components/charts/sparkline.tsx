"use client";

/**
 * Sparkline — tiny inline area chart for stat cards and table cells.
 * No axes, no tooltip — purely decorative trend indication.
 */
import { Area, AreaChart, ResponsiveContainer, YAxis } from "recharts";
import { useGradientId } from "./chart-primitives";

interface SparklineProps {
  data: Array<{ value: number }>;
  color?: string;
  height?: number;
  width?: number | string;
}

export function Sparkline({
  data,
  color = "var(--color-chart-1)",
  height = 40,
  width = "100%",
}: SparklineProps) {
  const gradientId = useGradientId("spark");
  if (!data.length) return null;

  return (
    <ResponsiveContainer width={width} height={height}>
      <AreaChart data={data} margin={{ top: 4, right: 2, bottom: 6, left: 2 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.32} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        {/* Small padding keeps extrema visible without letting spline math invent
            values outside the observed range. */}
        <YAxis domain={["dataMin - 1", "dataMax + 1"]} hide />
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={1.6}
          fill={`url(#${gradientId})`}
          isAnimationActive={false}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
