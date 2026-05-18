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
	CHART_PALETTE,
	tooltipStyle,
	tooltipLabelStyle,
	tooltipItemStyle,
	gridStroke,
	axisTickStyle,
	axisLineStyle,
	formatCurrencyTooltip,
} from "./chart-utils";

interface WilayaEntry {
	wilaya: string;
	orders: number;
	revenue: number;
}

interface WilayaBarChartProps {
	data: WilayaEntry[];
}

export function WilayaBarChart({ data }: WilayaBarChartProps) {
	const prefersReducedMotion = useReducedMotion();
	const isRtl = typeof document !== "undefined" && document.dir === "rtl";

	const sorted = [...data].sort((a, b) => b.revenue - a.revenue).slice(0, 10);

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
					tickFormatter={(v: number) => `${Math.round(v / 1000)}k`}
					reversed={isRtl}
				/>
				<YAxis
					type="category"
					dataKey="wilaya"
					tick={axisTickStyle}
					axisLine={false}
					tickLine={false}
					width={90}
				/>
				<Tooltip
					cursor={{ fill: "var(--color-surface-hover)", opacity: 0.5 }}
					contentStyle={tooltipStyle}
					labelStyle={tooltipLabelStyle}
					itemStyle={tooltipItemStyle}
					formatter={(value, _name, props) => [
						formatCurrencyTooltip(Number(value)),
						`${(props?.payload as WilayaEntry | undefined)?.orders ?? 0} orders`,
					]}
				/>
				<Bar
					dataKey="revenue"
					radius={[0, 6, 6, 0]}
					animationDuration={prefersReducedMotion ? 0 : 700}
				>
					{sorted.map((_, i) => (
						<Cell
							key={i}
							fill={
								i < 3
									? "var(--color-brand-400)"
									: CHART_PALETTE[i % CHART_PALETTE.length]
							}
						/>
					))}
				</Bar>
			</BarChart>
		</ResponsiveContainer>
	);
}
