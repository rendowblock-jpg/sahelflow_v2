"use client";

import {
	Area,
	Line,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip,
	ResponsiveContainer,
	Legend,
	ComposedChart,
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
	getLocaleTag,
} from "./chart-utils";

interface TrendEntry {
	date: string;
	revenue: number;
	totalExpenses: number;
	netProfit: number;
}

interface ProfitTrendChartProps {
	data: TrendEntry[];
	revenueLabel: string;
	expensesLabel: string;
	profitLabel: string;
	locale?: string; // Phase 6.4: App locale for date/number formatting
}

export function ProfitTrendChart({
	data,
	revenueLabel,
	expensesLabel,
	profitLabel,
	locale = "fr",
}: ProfitTrendChartProps) {
	const prefersReducedMotion = useReducedMotion();
	const isRtl = typeof document !== "undefined" && document.dir === "rtl";
	const dateLocale = getLocaleTag(locale);

	const formatted = data.map((d) => {
		let label = d.date;
		try {
			if (d.date.length === 10) {
				// YYYY-MM-DD
				label = new Date(d.date + "T00:00:00").toLocaleDateString(dateLocale, {
					month: "short",
					day: "numeric",
				});
			} else if (d.date.length === 7) {
				// YYYY-MM
				const [year, month] = d.date.split("-");
				label = new Date(Number(year), Number(month) - 1, 1).toLocaleDateString(
					dateLocale,
					{ month: "short" },
				);
			}
		} catch {
			// Fallback to raw string
		}
		return { ...d, label };
	});

	return (
		<ResponsiveContainer width="100%" height="100%">
			<ComposedChart
				data={formatted}
				margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
			>
				<defs>
					<linearGradient id="trendRevenueGradient" x1="0" y1="0" x2="0" y2="1">
						<stop
							offset="0%"
							stopColor="var(--color-brand-400)"
							stopOpacity={0.2}
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
					width={55}
				/>
				<Tooltip
					contentStyle={tooltipStyle}
					labelStyle={tooltipLabelStyle}
					itemStyle={tooltipItemStyle}
					formatter={(value, name) => [
						formatCurrencyTooltip(Number(value), "DZD", locale),
						name,
					]}
					separator=": "
				/>
				<Legend
					wrapperStyle={{
						fontSize: "11px",
						color: "var(--color-content-secondary)",
						paddingTop: "12px",
					}}
				/>
				<Area
					type="monotone"
					dataKey="revenue"
					name={revenueLabel}
					stroke="var(--color-brand-400)"
					strokeWidth={2}
					fill="url(#trendRevenueGradient)"
					animationDuration={prefersReducedMotion ? 0 : 800}
				/>
				<Line
					type="monotone"
					dataKey="totalExpenses"
					name={expensesLabel}
					stroke="var(--color-danger-400)"
					strokeWidth={2}
					dot={{ r: 3, fill: "var(--color-danger-400)", strokeWidth: 0 }}
					animationDuration={prefersReducedMotion ? 0 : 800}
				/>
				<Line
					type="monotone"
					dataKey="netProfit"
					name={profitLabel}
					stroke="var(--color-accent-400)"
					strokeWidth={3}
					dot={{ r: 4, fill: "var(--color-accent-400)", strokeWidth: 0 }}
					animationDuration={prefersReducedMotion ? 0 : 800}
				/>
			</ComposedChart>
		</ResponsiveContainer>
	);
}
