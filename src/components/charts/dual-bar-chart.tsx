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
  Cell,
} from "recharts";
import { formatDZD } from "@/lib/utils";

interface DualBarChartProps {
  data: Array<{ month: string; revenue: number; expenses: number }>;
  revenueLabel?: string;
  expensesLabel?: string;
}

const REVENUE_COLOR = "oklch(0.72 0.19 150)";
const EXPENSE_COLOR = "oklch(0.64 0.22 25)";
const EMPTY_COLOR = "oklch(0.85 0.01 150)";

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
  const maxValue = Math.max(...data.map((d) => Math.max(d.revenue, d.expenses)), 1);
  const yMax = Math.ceil(maxValue * 1.15 / 1000) * 1000;

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} barGap={4} barCategoryGap="25%">
        <defs>
          <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={REVENUE_COLOR} stopOpacity={1} />
            <stop offset="100%" stopColor={REVENUE_COLOR} stopOpacity={0.7} />
          </linearGradient>
          <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={EXPENSE_COLOR} stopOpacity={1} />
            <stop offset="100%" stopColor={EXPENSE_COLOR} stopOpacity={0.7} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border/50" />
        <XAxis
          dataKey="month"
          className="text-xs fill-muted-foreground"
          tickLine={false}
          axisLine={false}
          dy={4}
        />
        <YAxis
          tickFormatter={formatAxis}
          className="text-xs fill-muted-foreground"
          tickLine={false}
          axisLine={false}
          width={45}
          domain={[0, yMax]}
        />
        <Tooltip
          formatter={(value: number) => formatDZD(value)}
          cursor={{ fill: "oklch(from var(--muted) l c h / 0.3)" }}
          contentStyle={{
            borderRadius: "10px",
            border: "1px solid var(--border)",
            background: "var(--popover)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
            fontSize: "13px",
          }}
        />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: "13px", paddingTop: "8px" }}
        />
        <Bar dataKey="revenue" fill="url(#revenueGrad)" radius={[6, 6, 0, 0]} name={revenueLabel} maxBarSize={40}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.revenue === 0 ? EMPTY_COLOR : "url(#revenueGrad)"} />
          ))}
        </Bar>
        <Bar dataKey="expenses" fill="url(#expenseGrad)" radius={[6, 6, 0, 0]} name={expensesLabel} maxBarSize={40}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.expenses === 0 ? EMPTY_COLOR : "url(#expenseGrad)"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
