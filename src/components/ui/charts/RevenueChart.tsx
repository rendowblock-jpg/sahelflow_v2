"use client";

import {
	AreaChart,
	Area,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip,
	ResponsiveContainer,
} from "recharts";
import { useReducedMotion } from "framer-motion";
import {
	tooltipStyle,
	tooltipLabelStyle,
	tooltipItemStyle,
	gridStroke,
	axisTickStyle,
	axisLineStyle,
	formatCompact,
	formatCurrencyTooltip,
} from "./chart-utils";

interface DayEntry {
	day: string;
	revenue: number;
}

interface RevenueChartProps {
	data: DayEntry[];
}

export function RevenueChart({ data }: RevenueChartProps) {
	const prefersReducedMotion = useReducedMotion();
	const isRtl = typeof document !== "undefined" && document.dir === "rtl";

	const formatted = data.map((d) => ({
		...d,
		label: new Date(d.day + "T00:00:00").toLocaleDateString(
			typeof navigator !== "undefined" ? navigator.language : "en",
			{ weekday: "short" },
		),
	}));

	return (
		<ResponsiveContainer width="100%" height="100%">
			<AreaChart
				data={formatted}
				margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
			>
				<defs>
					<linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
						<stop
							offset="0%"
							stopColor="var(--color-brand-400)"
							stopOpacity={0.25}
						/>
						<stop
							offset="100%"
							stopColor="var(--color-brand-400)"
							stopOpacity={0}
						/>
					</linearGradient>
				</defs>
				<CartesianGrid
					stroke={gridStroke}
					strokeDasharray="3 3"
					vertical={false}
				/>
				<XAxis
					dataKey="label"
					tick={axisTickStyle}
					axisLine={axisLineStyle}
					tickLine={false}
					reversed={isRtl}
				/>
				<YAxis
					tick={axisTickStyle}
					axisLine={false}
					tickLine={false}
					tickFormatter={formatCompact}
					width={50}
				/>
				<Tooltip
					contentStyle={tooltipStyle}
					labelStyle={tooltipLabelStyle}
					itemStyle={tooltipItemStyle}
					formatter={(value) => [
						formatCurrencyTooltip(Number(value)),
						"Revenue",
					]}
					separator=": "
				/>
				<Area
					type="monotone"
					dataKey="revenue"
					stroke="var(--color-brand-400)"
					strokeWidth={2}
					fill="url(#revenueGradient)"
					animationDuration={prefersReducedMotion ? 0 : 900}
					animationEasing="ease-out"
					dot={{ r: 3, fill: "var(--color-brand-400)", strokeWidth: 0 }}
					activeDot={{
						r: 5,
						fill: "var(--color-brand-500)",
						stroke: "var(--color-surface-secondary)",
						strokeWidth: 2,
					}}
				/>
			</AreaChart>
		</ResponsiveContainer>
	);
}
