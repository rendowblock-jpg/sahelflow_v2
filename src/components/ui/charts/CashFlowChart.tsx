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
import { useReducedMotion } from "framer-motion";
import {
	tooltipStyle,
	tooltipLabelStyle,
	tooltipItemStyle,
	gridStroke,
	axisTickStyle,
	axisLineStyle,
	formatCurrencyTooltip,
} from "./chart-utils";

interface CashFlowData {
	label: string;
	inTransit: number;
	cleared: number;
	pending: number;
	atRisk: number;
}

interface CashFlowChartProps {
	data: CashFlowData[];
}

export function CashFlowChart({ data }: CashFlowChartProps) {
	const prefersReducedMotion = useReducedMotion();
	const isRtl = typeof document !== "undefined" && document.dir === "rtl";

	return (
		<ResponsiveContainer width="100%" height="100%">
			<BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
					tickFormatter={(v: number) => `${Math.round(v / 1000)}k`}
					width={50}
				/>
				<Tooltip
					contentStyle={tooltipStyle}
					labelStyle={tooltipLabelStyle}
					itemStyle={tooltipItemStyle}
					formatter={(value) => [formatCurrencyTooltip(Number(value)), ""]}
				/>
				<Legend
					wrapperStyle={{
						fontSize: "11px",
						color: "var(--color-content-secondary)",
					}}
				/>
				<Bar
					dataKey="inTransit"
					name="In Transit"
					stackId="a"
					fill="var(--color-brand-400)"
					radius={[0, 0, 0, 0]}
					animationDuration={prefersReducedMotion ? 0 : 600}
				/>
				<Bar
					dataKey="cleared"
					name="Cleared"
					stackId="a"
					fill="var(--color-accent-400)"
					animationDuration={prefersReducedMotion ? 0 : 600}
				/>
				<Bar
					dataKey="pending"
					name="Pending"
					stackId="a"
					fill="var(--color-warn-400)"
					animationDuration={prefersReducedMotion ? 0 : 600}
				/>
				<Bar
					dataKey="atRisk"
					name="At Risk"
					stackId="a"
					fill="var(--color-danger-400)"
					radius={[6, 6, 0, 0]}
					animationDuration={prefersReducedMotion ? 0 : 600}
				/>
			</BarChart>
		</ResponsiveContainer>
	);
}
