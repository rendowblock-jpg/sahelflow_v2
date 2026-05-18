"use client";

import {
	BarChart,
	Bar,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip,
	ResponsiveContainer,
	Cell,
} from "recharts";
import { useReducedMotion } from "framer-motion";
import {
	tooltipStyle,
	tooltipLabelStyle,
	tooltipItemStyle,
	gridStroke,
	axisTickStyle,
	axisLineStyle,
} from "./chart-utils";

interface ProductEntry {
	name: string;
	quantity: number;
}

interface ProductBarChartProps {
	data: ProductEntry[];
	soldLabel: string;
}

export function ProductBarChart({ data, soldLabel }: ProductBarChartProps) {
	const prefersReducedMotion = useReducedMotion();
	const isRtl = typeof document !== "undefined" && document.dir === "rtl";

	const sorted = [...data].sort((a, b) => b.quantity - a.quantity).slice(0, 10);

	return (
		<ResponsiveContainer width="100%" height="100%">
			<BarChart
				data={sorted}
				layout="vertical"
				margin={{ top: 4, right: 24, left: 4, bottom: 4 }}
			>
				<CartesianGrid
					stroke={gridStroke}
					strokeDasharray="3 3"
					horizontal={false}
				/>
				<XAxis
					type="number"
					tick={axisTickStyle}
					axisLine={axisLineStyle}
					tickLine={false}
					reversed={isRtl}
				/>
				<YAxis
					type="category"
					dataKey="name"
					tick={axisTickStyle}
					axisLine={false}
					tickLine={false}
					width={110}
					tickFormatter={(v: string) =>
						v.length > 16 ? v.slice(0, 15) + "…" : v
					}
				/>
				<Tooltip
					cursor={{ fill: "var(--color-surface-hover)", opacity: 0.5 }}
					contentStyle={tooltipStyle}
					labelStyle={tooltipLabelStyle}
					itemStyle={tooltipItemStyle}
					formatter={(value) => [`${Number(value)} ${soldLabel}`, ""]}
				/>
				<Bar
					dataKey="quantity"
					radius={[0, 6, 6, 0]}
					fill="var(--color-accent-400)"
					animationDuration={prefersReducedMotion ? 0 : 700}
				>
					{sorted.map((_, i) => (
						<Cell
							key={i}
							fill={
								i < 3 ? "var(--color-accent-400)" : "var(--color-accent-500)"
							}
						/>
					))}
				</Bar>
			</BarChart>
		</ResponsiveContainer>
	);
}
