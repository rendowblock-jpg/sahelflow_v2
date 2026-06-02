"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { useReducedMotion } from "framer-motion";
import {
  tooltipStyle,
  tooltipLabelStyle,
  tooltipItemStyle,
  formatCurrencyTooltip,
} from "./chart-utils";

interface ExpenseCategoryEntry {
  name: string;
  value: number;
  color: string;
}

interface ExpensesPieChartProps {
  data: ExpenseCategoryEntry[];
}

export function ExpensesPieChart({ data }: ExpensesPieChartProps) {
  const prefersReducedMotion = useReducedMotion();

  // Filter out categories with 0 values to avoid cluttering the chart
  const activeData = data.filter((d) => d.value > 0);
  const total = data.reduce((sum, d) => sum + d.value, 0);

  // If there's no data, show a neutral placeholder donut chart
  const chartData = activeData.length > 0 
    ? activeData 
    : [{ name: "No Expenses / Pas de dépenses / لا توجد مصاريف", value: 1, color: "var(--color-surface-tertiary)" }];

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={90}
          paddingAngle={activeData.length > 1 ? 3 : 0}
          dataKey="value"
          animationBegin={0}
          animationDuration={prefersReducedMotion ? 0 : 800}
          stroke="none"
        >
          {chartData.map((entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={entry.color}
              cursor={activeData.length > 0 ? "pointer" : "default"}
            />
          ))}
        </Pie>
        {activeData.length > 0 && (
          <Tooltip
            contentStyle={tooltipStyle}
            labelStyle={tooltipLabelStyle}
            itemStyle={tooltipItemStyle}
            formatter={(value, name) => {
              const num = Number(value ?? 0);
              const pct = total > 0 ? Math.round((num / total) * 100) : 0;
              return [`${formatCurrencyTooltip(num)} (${pct}%)`, name];
            }}
          />
        )}
      </PieChart>
    </ResponsiveContainer>
  );
}
