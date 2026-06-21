"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { formatDZD } from "@/lib/utils";

interface RevenueChartProps {
  data: Array<{ day: string; revenue: number; orders?: number }>;
  dataKey?: string;
  color?: string;
  name?: string;
}

export function RevenueChart({
  data,
  dataKey = "revenue",
  color = "#22c55e",
  name = "Revenu",
}: RevenueChartProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="day" className="text-xs" />
        <YAxis className="text-xs" />
        <Tooltip
          formatter={(value: number) => [formatDZD(value), name]}
          contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))" }}
        />
        <Bar dataKey={dataKey} fill={color} radius={[4, 4, 0, 0]} name={name} />
      </BarChart>
    </ResponsiveContainer>
  );
}
