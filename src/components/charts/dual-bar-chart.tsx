"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { formatDZD } from "@/lib/utils";
import { useI18n } from "@/hooks/use-i18n";
import { CHART_COLORS, useGradientId } from "./chart-primitives";

interface DualBarChartProps {
  data: Array<{ month: string; revenue: number; expenses: number }>;
  revenueLabel?: string;
  expensesLabel?: string;
}

function formatAxis(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return String(value);
}

export function DualBarChart({
  data,
  revenueLabel = "Revenue",
  expensesLabel = "Expenses",
}: DualBarChartProps) {
  const { dir, locale } = useI18n();
  const isRtl = dir === "rtl";
  const revenueGradientId = useGradientId("revenue");
  const expenseGradientId = useGradientId("expenses");
  const maxValue = Math.max(...data.map((d) => Math.max(d.revenue, d.expenses)), 1);
  const yMax = Math.max(1_000, Math.ceil((maxValue * 1.15) / 1000) * 1000);

  return (
    <div dir="ltr" className="w-full" data-slot="chart">
      <ResponsiveContainer width="100%" height={300}>
        <BarChart
          data={data}
          barGap={6}
          barCategoryGap="20%"
          margin={{
            left: isRtl ? 14 : 6,
            right: isRtl ? 6 : 14,
            top: 10,
            bottom: 2,
          }}
          accessibilityLayer
        >
          <defs>
            <linearGradient id={revenueGradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_COLORS.chart4} stopOpacity={1} />
              <stop offset="100%" stopColor={CHART_COLORS.chart4} stopOpacity={0.68} />
            </linearGradient>
            <linearGradient id={expenseGradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_COLORS.chart3} stopOpacity={1} />
              <stop offset="100%" stopColor={CHART_COLORS.chart3} stopOpacity={0.68} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 5"
            vertical={false}
            className="stroke-border/60"
          />
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={false}
            dy={6}
            reversed={isRtl}
            tick={{ fill: "var(--muted-foreground)", fontSize: 13 }}
          />
          <YAxis
            tickFormatter={formatAxis}
            tickLine={false}
            axisLine={false}
            width={48}
            domain={[0, yMax]}
            orientation={isRtl ? "right" : "left"}
            tick={{ fill: "var(--muted-foreground)", fontSize: 13 }}
          />
          <Tooltip
            formatter={(value: number) => (
              <bdi dir="ltr" className="numeric-value">
                {formatDZD(value, locale)}
              </bdi>
            )}
            cursor={{ fill: "oklch(from var(--muted) l c h / 0.35)" }}
            wrapperStyle={{
              direction: isRtl ? "rtl" : "ltr",
              textAlign: isRtl ? "right" : "left",
              unicodeBidi: "isolate",
            }}
            contentStyle={{
              borderRadius: "12px",
              border: "1px solid var(--border)",
              background: "var(--popover)",
              boxShadow: "var(--shadow-popover)",
              fontSize: "14px",
              padding: "10px 12px",
            }}
          />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{
              fontSize: "13px",
              paddingTop: "10px",
              direction: isRtl ? "rtl" : "ltr",
            }}
          />
          <Bar
            dataKey="revenue"
            fill={`url(#${revenueGradientId})`}
            radius={[6, 6, 2, 2]}
            name={revenueLabel}
            maxBarSize={44}
          />
          <Bar
            dataKey="expenses"
            fill={`url(#${expenseGradientId})`}
            radius={[6, 6, 2, 2]}
            name={expensesLabel}
            maxBarSize={44}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
