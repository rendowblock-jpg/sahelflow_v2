"use client";

import { useI18n } from "@/lib/i18n";
import type { OrderStats } from "./types";

interface Props {
	stats: OrderStats;
	draftCount: number;
}

export default function OrderStatsCards({ stats, draftCount }: Props) {
	const { t, formatCurrency } = useI18n();
	if (stats.total === 0) return null;

	const nonDraft = stats.total - draftCount;
	const confirmedTotal = stats.confirmed + stats.shipped + stats.delivered;
	const rate = nonDraft > 0 ? Math.round((confirmedTotal / nonDraft) * 100) : 0;
	const rateClass =
		rate >= 85
			? "sf-orders-stat-value--success"
			: rate >= 70
				? "sf-orders-stat-value--warn"
				: "sf-orders-stat-value--danger";

	return (
		<div className="sf-orders-stats-grid">
			<div className="sf-card sf-orders-stat-card">
				<p className="sf-orders-stat-label">{t.orders.totalOrders}</p>
				<p className="sf-orders-stat-value">{stats.total}</p>
			</div>
			<div className="sf-card sf-orders-stat-card">
				<p className="sf-orders-stat-label">{t.orders.pendingCount}</p>
				<p className="sf-orders-stat-value sf-orders-stat-value--warn">
					{stats.pending}
				</p>
			</div>
			<div className="sf-card sf-orders-stat-card">
				<p className="sf-orders-stat-label">{t.orders.confirmationRate}</p>
				<p className={`sf-orders-stat-value ${rateClass}`}>{rate}%</p>
			</div>
			<div className="sf-card sf-orders-stat-card">
				<p className="sf-orders-stat-label">{t.dashboard.revenue}</p>
				<p className="sf-orders-stat-value">{formatCurrency(stats.revenue)}</p>
			</div>
		</div>
	);
}
