import React from "react";
import { useI18n } from "@/lib/i18n";
import { getLocaleTag } from "@/components/ui/charts/chart-utils";

interface PnLCardProps {
	title: string;
	value: number;
	subText?: string;
	type: "revenue" | "expenses" | "profit";
	trend?: {
		value: number;
		isPositive: boolean;
	};
}

export const PnLCard: React.FC<PnLCardProps> = ({
	title,
	value,
	subText,
	type,
	trend,
}) => {
	const { locale } = useI18n();
	const formatCurrency = (val: number) => {
		return new Intl.NumberFormat(getLocaleTag(locale), {
			style: "currency",
			currency: "DZD",
			maximumFractionDigits: 0,
		})
			.format(val)
			.replace("DZD", "DA");
	};

	return (
		<div className={`sf-pnl-card is-${type}`}>
			<div className="sf-pnl-card-label">
				<span>{title}</span>
				<span className="sf-icon">
					{type === "revenue" && "📊"}
					{type === "expenses" && "💸"}
					{type === "profit" && "📈"}
				</span>
			</div>
			<div className="sf-pnl-card-value">{formatCurrency(value)}</div>
			{(subText || trend) && (
				<div className="sf-pnl-card-meta">
					{trend && (
						<span
							className={`sf-pnl-card-trend ${
								trend.isPositive ? "is-up" : "is-down"
							}`}
						>
							{trend.isPositive ? "▲" : "▼"} {trend.value}%
						</span>
					)}
					{subText && <span>{subText}</span>}
				</div>
			)}
		</div>
	);
};
