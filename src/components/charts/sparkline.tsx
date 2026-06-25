"use client";

/**
 * Sparkline — tiny inline area chart for stat cards and table cells.
 * No axes, no tooltip — purely decorative trend indication.
 * 
 * Premium: gradient fill 0.4→0, smooth natural curve, unique gradient ID.
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
      <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.4} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <YAxis domain={["dataMin", "dataMax"]} hide />
        <Area
          type="natural"
          dataKey="value"
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#${gradientId})`}
          isAnimationActive={false}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
