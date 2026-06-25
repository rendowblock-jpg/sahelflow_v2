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

interface DualBarChartProps {
  data: Array<{ month: string; revenue: number; expenses: number }>;
  /** Label for the revenue series (legend). */
  revenueLabel?: string;
  /** Label for the expenses series (legend). */
  expensesLabel?: string;
}

export function DualBarChart({
  data,
  revenueLabel = "Revenue",
  expensesLabel = "Expenses",
}: DualBarChartProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="month" className="text-xs" />
        <YAxis className="text-xs" />
        <Tooltip
          formatter={(value: number) => formatDZD(value)}
          contentStyle={{ borderRadius: "8px" }}
        />
        <Legend />
        <Bar dataKey="revenue" fill="#22c55e" radius={[4, 4, 0, 0]} name={revenueLabel} />
        <Bar dataKey="expenses" fill="#ef4444" radius={[4, 4, 0, 0]} name={expensesLabel} />
      </BarChart>
    </ResponsiveContainer>
  );
}
