"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDZD } from "@/lib/utils";
import { useI18n } from "@/hooks/use-i18n";
import {
  CHART_COLORS,
  DEFAULT_CHART_HEIGHT,
  normalizeChartHeight,
  type ChartHeight,
  useGradientId,
} from "./chart-primitives";
import { useChartMotion } from "./chart-motion";

interface DualBarChartProps {
  data: Array<{ month: string; revenue: number; expenses: number }>;
  revenueLabel?: string;
  expensesLabel?: string;
  height?: ChartHeight;
}

export function DualBarChart({
  data,
  revenueLabel = "Revenue",
  expensesLabel = "Expenses",
  height = DEFAULT_CHART_HEIGHT,
}: DualBarChartProps) {
  const { dir, locale } = useI18n();
  const { isAnimationActive, baseDuration } = useChartMotion();
  const isRtl = dir === "rtl";
  const chartHeight = normalizeChartHeight(height);
  const revenueGradientId = useGradientId("revenue");
  const expenseGradientId = useGradientId("expenses");
  const maxValue = Math.max(
    ...data.map((entry) => Math.max(entry.revenue, entry.expenses)),
    1,
  );
  const yMax = Math.max(1_000, Math.ceil((maxValue * 1.15) / 1000) * 1000);
  const axisFormatter = new Intl.NumberFormat(
    locale === "ar" ? "ar-DZ" : locale === "en" ? "en-GB" : "fr-DZ",
    { notation: "compact", maximumFractionDigits: 1 },
  );

  return (
    <div
      dir={dir}
      className="w-full"
      data-slot="chart"
      style={{ height: chartHeight }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          barGap={6}
          barCategoryGap="22%"
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
              <stop offset="100%" stopColor={CHART_COLORS.chart4} stopOpacity={0.70} />
            </linearGradient>
            <linearGradient id={expenseGradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_COLORS.chart3} stopOpacity={1} />
              <stop offset="100%" stopColor={CHART_COLORS.chart3} stopOpacity={0.70} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={false}
            dy={8}
            tick={{
              fill: "var(--sf-chart-axis)",
              fontSize: isRtl ? 13 : 12,
            }}
          />
          <YAxis
            tickFormatter={(value: number) => axisFormatter.format(value)}
            tickLine={false}
            axisLine={false}
            width={isRtl ? 68 : 60}
            domain={[0, yMax]}
            orientation={isRtl ? "right" : "left"}
            tick={{
              fill: "var(--sf-chart-axis)",
              fontSize: isRtl ? 13 : 12,
            }}
          />
          <Tooltip
            formatter={(value: number) => (
              <bdi dir="auto" className="numeric-value">
                {formatDZD(value, locale)}
              </bdi>
            )}
            cursor={{ fill: "var(--muted)", opacity: 0.26 }}
            wrapperStyle={{
              direction: isRtl ? "rtl" : "ltr",
              textAlign: isRtl ? "right" : "left",
              unicodeBidi: "isolate",
            }}
            contentStyle={{
              borderRadius: "12px",
              border: "1px solid var(--border)",
              background: "color-mix(in oklch, var(--popover) 94%, transparent)",
              boxShadow: "var(--shadow-popover)",
              fontSize: isRtl ? "14px" : "13px",
              padding: "10px 12px",
              backdropFilter: "blur(14px)",
            }}
          />
          <Legend
            iconType="circle"
            iconSize={7}
            wrapperStyle={{
              fontSize: isRtl ? "13px" : "12px",
              paddingTop: "12px",
              direction: isRtl ? "rtl" : "ltr",
            }}
          />
          <Bar
            dataKey="revenue"
            fill={`url(#${revenueGradientId})`}
            radius={[7, 7, 2, 2]}
            name={revenueLabel}
            maxBarSize={44}
            isAnimationActive={isAnimationActive}
            animationDuration={baseDuration}
            animationEasing="ease-out"
          />
          <Bar
            dataKey="expenses"
            fill={`url(#${expenseGradientId})`}
            radius={[7, 7, 2, 2]}
            name={expensesLabel}
            maxBarSize={44}
            isAnimationActive={isAnimationActive}
            animationDuration={baseDuration}
            animationEasing="ease-out"
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
