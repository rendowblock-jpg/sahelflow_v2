"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { useReducedMotion } from "framer-motion";
import {
	STATUS_COLORS,
	tooltipStyle,
	tooltipLabelStyle,
	tooltipItemStyle,
} from "./chart-utils";

interface StatusEntry {
	status: string;
	count: number;
}

interface StatusDonutProps {
	data: StatusEntry[];
	total: number;
	tStatus: Record<string, string>;
}

export function StatusDonut({ data, total, tStatus }: StatusDonutProps) {
	const prefersReducedMotion = useReducedMotion();

	return (
		<ResponsiveContainer width="100%" height="100%">
			<PieChart>
				<Pie
					data={data}
					cx="50%"
					cy="50%"
					innerRadius={60}
					outerRadius={90}
					paddingAngle={3}
					dataKey="count"
					animationBegin={0}
					animationDuration={prefersReducedMotion ? 0 : 800}
					stroke="none"
				>
					{data.map((entry) => (
						<Cell
							key={entry.status}
							fill={STATUS_COLORS[entry.status] || "var(--color-brand-400)"}
							cursor="pointer"
						/>
					))}
				</Pie>
				<Tooltip
					contentStyle={tooltipStyle}
					labelStyle={tooltipLabelStyle}
					itemStyle={tooltipItemStyle}
					formatter={(value, _name, props) => {
						const num = Number(value ?? 0);
						const pct = total > 0 ? Math.round((num / total) * 100) : 0;
						const payloadStatus =
							(props?.payload as { name?: string; status?: string } | undefined)
								?.status ?? "";
						const label = tStatus[payloadStatus] || payloadStatus;
						return [`${num} (${pct}%)`, label];
					}}
				/>
			</PieChart>
		</ResponsiveContainer>
	);
}
