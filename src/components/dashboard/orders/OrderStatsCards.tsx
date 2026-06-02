"use client";

import { useI18n } from "@/lib/i18n";
import type { OrderStats } from "./types";
import { AnimatedStatCard } from "@/components/ui/AnimatedStatCard";
import { ShoppingCart, AlertTriangle, TrendingUp, DollarSign } from "lucide-react";
import { StaggerContainer, StaggerItem } from "@/components/ui/motion";

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
	const rateVariant =
		rate >= 85
			? ("success" as const)
			: rate >= 70
				? ("warning" as const)
				: ("danger" as const);

	return (
		<StaggerContainer className="sf-orders-stats-grid sf-grid-4 sf-gap-md" stagger={0.05}>
			<StaggerItem>
				<AnimatedStatCard
					label={t.orders.totalOrders}
					value={String(stats.total)}
					variant="brand"
					icon={ShoppingCart}
					delay={0}
				/>
			</StaggerItem>
			<StaggerItem>
				<AnimatedStatCard
					label={t.orders.pendingCount}
					value={String(stats.pending)}
					variant="warning"
					icon={AlertTriangle}
					delay={80}
				/>
			</StaggerItem>
			<StaggerItem>
				<AnimatedStatCard
					label={t.orders.confirmationRate}
					value={`${rate}%`}
					variant={rateVariant}
					icon={TrendingUp}
					delay={160}
				/>
			</StaggerItem>
			<StaggerItem>
				<AnimatedStatCard
					label={t.dashboard.revenue}
					value={formatCurrency(stats.revenue)}
					variant="success"
					icon={DollarSign}
					delay={240}
				/>
			</StaggerItem>
		</StaggerContainer>
	);
}
