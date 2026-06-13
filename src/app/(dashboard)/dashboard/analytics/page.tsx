"use client";

import { useState, useEffect, useCallback } from "react";
import {
	TrendingUp,
	DollarSign,
	ShoppingCart,
	Users,
	Package,
	Truck,
	Download,
} from "lucide-react";
import { getDashboardStats, getAnalyticsData } from "@/lib/data/service";
import { exportAnalyticsCSV } from "@/lib/data/export";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/components/dashboard/ToastProvider";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCard, SkeletonTable } from "@/components/ui/Skeleton";
import {
	ChartContainer,
	RevenueChart,
	StatusDonut,
	WilayaBarChart,
} from "@/components/ui/charts";
import {
	PageTransition,
	StaggerContainer,
	StaggerItem,
} from "@/components/ui/motion";
import { AnimatedStatCard } from "@/components/ui/AnimatedStatCard";

interface StatusEntry {
	status: string;
	count: number;
}
interface WilayaEntry {
	wilaya: string;
	orders: number;
	revenue: number;
	delivered: number;
	returned: number;
}
interface DayEntry {
	day: string;
	revenue: number;
}
interface ProductEntry {
	name: string;
	quantity: number;
}
interface AnalyticsResult {
	keyMetrics: {
		totalOrders: number;
		totalRevenue: number;
		totalDeliveryCost: number;
		deliveredCount: number;
		returnedCount: number;
		confirmedCount: number;
		nonDraftCount: number;
		avgOrderValue: number;
		deliveryRate: number;
		returnRate: number;
		confirmationRate: number;
		netProfit: number;
		profitMargin: number;
		totalCustomers: number;
		lowStockProducts: number;
	};
	statusDistribution: StatusEntry[];
	wilayaBreakdown: WilayaEntry[];
	revenueByDay: DayEntry[];
	topProducts: ProductEntry[];
	range: string;
}

export default function AnalyticsPage() {
	const { t, formatCurrency } = useI18n();
	const { toast } = useToast();
	const [loading, setLoading] = useState(true);
	const [_stats, setStats] = useState<Record<string, number> | null>(null);
	const [analytics, setAnalytics] = useState<AnalyticsResult | null>(null);
	const [range, setRange] = useState<"today" | "7d" | "30d" | "all">("30d");

	const loadData = useCallback(async () => {
		try {
			setLoading(true);
			const [s, a] = await Promise.all([
				getDashboardStats(),
				getAnalyticsData(range),
			]);
			setStats(s as unknown as Record<string, number>);
			setAnalytics(a as unknown as AnalyticsResult);
		} catch {
			toast({
				type: "error",
				title: t.analytics?.loadFailed || t.common.error,
			});
		} finally {
			setLoading(false);
		}
	}, [range, toast, t.analytics?.loadFailed, t.common.error]);

	useEffect(() => {
		loadData();
	}, [loadData]);

	if (loading) {
		return (
			<div className="sf-flex-col sf-gap-xl sf-animate-fade">
				<div>
					<div className="sf-skeleton sf-skeleton-title" />
					<div className="sf-skeleton sf-skeleton-subtitle" />
				</div>
				<div className="sf-stats-grid">
					{Array.from({ length: 7 }).map((_, i) => (
						<SkeletonCard key={i} />
					))}
				</div>
				<div className="sf-chart-row sf-items-start">
					<SkeletonTable rows={5} />
					<SkeletonTable rows={5} />
				</div>
			</div>
		);
	}

	if (
		!analytics ||
		!analytics.keyMetrics ||
		analytics.keyMetrics.totalOrders === 0
	) {
		return (
			<div className="sf-flex-col sf-gap-lg sf-slide-up">
				<div>
					<h1 className="sf-page-title">{t.analytics.title}</h1>
				</div>
				<EmptyState
					icon={TrendingUp}
					title={t.analytics.noDataYet}
					description={t.analytics.noDataDesc}
				/>
			</div>
		);
	}

	const m = analytics.keyMetrics;
	const statusEntries = analytics.statusDistribution;
	const topWilayas = analytics.wilayaBreakdown;
	const revenueByDay = analytics.revenueByDay;
	const topProducts = analytics.topProducts;

	return (
		<PageTransition className="sf-flex-col sf-gap-xl">
			<div className="sf-page-header">
				<div>
					<h1 className="sf-page-title">{t.analytics.title}</h1>
					<p className="sf-page-subtitle">{t.analytics.overview}</p>
				</div>
				<div className="sf-range-filters" style={{ display: "flex", gap: "8px", alignItems: "center" }}>
					<div className="sf-seg">
						{(["today", "7d", "30d", "all"] as const).map((r) => {
							const isActive = range === r;
							return (
								<button
									key={r}
									onClick={() => setRange(r)}
									className={`sf-seg-btn ${isActive ? "sf-seg-btn--active" : ""}`}
									type="button"
								>
									{r === "today"
										? t.analytics.today
										: r === "7d"
											? t.analytics.last7Days
											: r === "30d"
												? t.analytics.last30Days
												: t.common.all}
								</button>
							);
						})}
					</div>
					<button
						className="sf-btn sf-btn-ghost"
						onClick={() =>
							exportAnalyticsCSV({
								totalOrders: m.totalOrders,
								totalRevenue: m.totalRevenue,
								totalDeliveryCost: m.totalDeliveryCost,
								netProfit: m.netProfit,
								confirmationRate: m.confirmationRate,
								deliveryRate: m.deliveryRate,
								returnRate: m.returnRate,
								avgOrderValue: m.avgOrderValue,
								topWilayas: topWilayas.map((w) => ({
									wilaya: w.wilaya,
									orders: w.orders,
									revenue: w.revenue,
									delivered: w.delivered,
									returned: w.returned,
								})),
								topProducts: topProducts.map((p) => ({
									name: p.name,
									quantity: p.quantity,
								})),
							})
						}
						title={t.analytics.exportCSV}
					>
						<Download size={16} />
					</button>
				</div>
			</div>

			{/* Key Metrics Row */}
			<StaggerContainer className="sf-grid-4" stagger={0.05}>
				{[
					{
						label: t.dashboard.totalOrders,
						value: String(m.totalOrders),
						icon: ShoppingCart,
						variant: "brand" as const,
						pct: 100,
					},
					{
						label: t.dashboard.revenue,
						value: formatCurrency(m.totalRevenue),
						icon: DollarSign,
						variant: "success" as const,
						pct: 100,
					},
					{
						label: t.analytics.confirmationRate,
						value: `${m.confirmationRate}%`,
						icon: TrendingUp,
						variant:
							m.confirmationRate >= 85
								? ("success" as const)
								: m.confirmationRate >= 70
									? ("warning" as const)
									: ("danger" as const),
						pct: m.confirmationRate,
					},
					{
						label: t.analytics.avgOrderValue,
						value: formatCurrency(m.avgOrderValue),
						icon: TrendingUp,
						variant: "warning" as const,
						pct: Math.min(100, (m.avgOrderValue / 6000) * 100),
					},
					{
						label: t.dashboard.customers,
						value: String(m.totalCustomers || 0),
						icon: Users,
						variant: "brand" as const,
						pct: 100,
					},
					{
						label: t.analytics.deliveryRate,
						value: `${m.deliveryRate}%`,
						icon: Truck,
						variant:
							m.deliveryRate >= 70
								? ("success" as const)
								: ("warning" as const),
						pct: m.deliveryRate,
					},
					{
						label: t.analytics.lowStockItems,
						value: String(m.lowStockProducts),
						icon: Package,
						variant:
							m.lowStockProducts > 0
								? ("danger" as const)
								: ("success" as const),
						pct: m.lowStockProducts > 0 ? 30 : 100,
					},
				].map((s, i) => (
					<StaggerItem key={s.label}>
						<AnimatedStatCard
							label={s.label}
							value={s.value}
							variant={s.variant}
							icon={s.icon}
							delay={i * 80}
							sparklinePercent={s.pct}
						/>
					</StaggerItem>
				))}
			</StaggerContainer>

			{/* Charts Row */}
			<StaggerContainer className="sf-chart-row sf-items-start" stagger={0.1}>
				<StaggerItem>
					<ChartContainer
						title={t.analytics.revenueLast7Days ? t.analytics.revenueLast7Days.replace("7", range === "7d" ? "7" : range === "today" ? "1" : "30") : "Revenue Trend"}
						empty={revenueByDay.length === 0}
						emptyTitle={t.analytics.noDataYet}
						emptyDescription={t.analytics.noDataDesc}
						height={280}
					>
						<RevenueChart data={revenueByDay} />
					</ChartContainer>
				</StaggerItem>
				<StaggerItem>
					<ChartContainer
						title={t.analytics.orderPipeline}
						empty={statusEntries.length === 0}
						emptyTitle={t.analytics.noDataYet}
						emptyDescription={t.analytics.noDataDesc}
						height={280}
					>
						<StatusDonut
							data={statusEntries}
							total={m.totalOrders}
							tStatus={t.status as Record<string, string>}
						/>
					</ChartContainer>
				</StaggerItem>
			</StaggerContainer>

			{/* Profit Waterfall Section */}
			<div className="sf-card sf-card-padded">
				<h3 className="sf-section-title">{t.analytics.profitOverview}</h3>
				<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px", marginTop: "16px" }}>
					{/* Revenue (Add) */}
					<div style={{ background: "var(--color-surface-tertiary)", padding: "16px", borderRadius: "8px", border: "1px solid var(--color-line-primary)" }}>
						<span style={{ fontSize: "11px", fontWeight: 600, color: "var(--color-content-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
							{t.dashboard.revenue}
						</span>
						<h2 style={{ fontSize: "24px", fontWeight: 700, color: "var(--color-accent-400)", marginTop: "6px" }}>
							+ {formatCurrency(m.totalRevenue)}
						</h2>
						<div style={{ height: "4px", background: "var(--color-accent-500)", borderRadius: "2px", marginTop: "12px" }} />
					</div>

					{/* Delivery Cost (Subtract) */}
					<div style={{ background: "var(--color-surface-tertiary)", padding: "16px", borderRadius: "8px", border: "1px solid var(--color-line-primary)" }}>
						<span style={{ fontSize: "11px", fontWeight: 600, color: "var(--color-content-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
							{t.analytics.deliveryCosts}
						</span>
						<h2 style={{ fontSize: "24px", fontWeight: 700, color: "var(--color-danger-400)", marginTop: "6px" }}>
							- {formatCurrency(m.totalDeliveryCost)}
						</h2>
						<div style={{ height: "4px", background: "var(--color-surface-hover)", borderRadius: "2px", marginTop: "12px" }}>
							<div style={{ height: "100%", background: "var(--color-danger-500)", borderRadius: "2px", width: m.totalRevenue > 0 ? `${Math.min(100, (m.totalDeliveryCost / m.totalRevenue) * 100)}%` : "0%" }} />
						</div>
					</div>

					{/* Net Profit (Result) */}
					<div style={{ background: "var(--gradient-brand-subtle)", padding: "16px", borderRadius: "8px", border: "1px solid rgba(59, 158, 255, 0.15)" }}>
						<span style={{ fontSize: "11px", fontWeight: 600, color: "var(--color-brand-400)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
							{t.analytics.netProfit}
						</span>
						<h2 style={{ fontSize: "24px", fontWeight: 700, color: m.netProfit >= 0 ? "var(--color-accent-400)" : "var(--color-danger-400)", marginTop: "6px" }}>
							{formatCurrency(m.netProfit)}
						</h2>
						<div style={{ height: "4px", background: "var(--color-surface-hover)", borderRadius: "2px", marginTop: "12px" }}>
							<div style={{ height: "100%", background: m.netProfit >= 0 ? "var(--color-accent-500)" : "var(--color-danger-500)", borderRadius: "2px", width: m.totalRevenue > 0 ? `${Math.min(100, Math.max(0, m.netProfit / m.totalRevenue) * 100)}%` : "0%" }} />
						</div>
					</div>
				</div>
				<div style={{ display: "flex", justifyContent: "flex-end", marginTop: "12px" }}>
					<span className="sf-text-xs-tertiary">
						{t.analytics.profitMargin}: {m.profitMargin}%
					</span>
				</div>
			</div>

			{/* Second Charts Row */}
			<div className="sf-chart-row sf-items-start">
				<ChartContainer
					title={t.analytics.topWilayasByRevenue}
					empty={topWilayas.length === 0}
					emptyTitle={t.analytics.noWilayaData}
					emptyDescription={t.analytics.noDataDesc}
					height={320}
				>
					<WilayaBarChart data={topWilayas} />
				</ChartContainer>

				<div
					className="sf-card sf-card-padded sf-flex-col sf-gap-md"
					style={{
						flex: 1,
						minHeight: 320,
						background: "var(--sf-bg-panel)",
						border: "1px solid var(--sf-border-subtle)",
					}}
				>
					<h3 className="sf-section-title sf-section-title--flush">
						{t.analytics.topProductsByOrders}
					</h3>
					{topProducts.length === 0 ? (
						<div className="sf-empty sf-p-xl">
							<p className="sf-empty-title">{t.analytics.noProductData}</p>
							<p className="sf-empty-desc">{t.analytics.noDataDesc}</p>
						</div>
					) : (
						<div className="sf-flex-col sf-gap-lg sf-mt-sm">
							{topProducts.slice(0, 5).map((p, idx) => {
								const maxQty = Math.max(
									...topProducts.map((tp) => tp.quantity),
									1,
								);
								const pct = Math.round((p.quantity / maxQty) * 100);
								return (
									<div key={p.name} className="sf-flex-col sf-gap-xs">
										<div className="sf-flex-between">
											<div className="sf-flex sf-gap-sm sf-items-center">
												<span
													className="sf-text-xs sf-font-semibold sf-text-tertiary"
													style={{ width: 18 }}
												>
													#{idx + 1}
												</span>
												<span className="sf-text-sm sf-font-medium sf-text-primary">
													{p.name}
												</span>
											</div>
											<span
												className="sf-text-sm sf-font-bold sf-text-brand sf-text-tabular"
												style={{ color: "var(--sf-accent-primary)" }}
											>
												{p.quantity} {t.analytics.sold}
											</span>
										</div>
										<div
											className="sf-profit-bar"
											style={{ height: 6, background: "var(--sf-bg-elevated)" }}
										>
											<div
												className="sf-profit-bar-fill"
												style={{
													width: `${pct}%`,
													background:
														"linear-gradient(to right, var(--sf-accent-solid), var(--sf-accent-primary))",
													borderRadius: "var(--sf-radius-full)",
													height: "100%",
												}}
											/>
										</div>
									</div>
								);
							})}
						</div>
					)}
				</div>
			</div>

			{/* Wilaya Table */}
			<div className="sf-card sf-card-flat">
				<h3 className="sf-section-title sf-px-md sf-pt-md sf-pb-sm">
					{t.ai.topWilayas}
				</h3>
				<div className="sf-table-wrap">
					<table className="sf-table-aaa">
						<thead>
							<tr>
								<th>#</th>
								<th>{t.dashboard.wilaya}</th>
								<th className="sf-text-center">{t.dashboard.totalOrders}</th>
								<th className="sf-text-end">{t.dashboard.revenue}</th>
								<th className="sf-text-center">{t.orders.delivered}</th>
								<th className="sf-text-center">{t.orders.returned}</th>
								<th className="sf-text-center">{t.analytics.successRate}</th>
							</tr>
						</thead>
						<tbody>
							{topWilayas.map((w, i) => {
								const successRate =
									w.orders > 0 ? Math.round((w.delivered / w.orders) * 100) : 0;
								const maxWilayaRevenue = Math.max(...topWilayas.map((w) => w.revenue), 1);
								const pct = Math.round((w.revenue / maxWilayaRevenue) * 100);
								return (
									<tr key={w.wilaya}>
										<td className="sf-font-semibold sf-text-tertiary sf-text-tabular">
											{i + 1}
										</td>
										<td>
											<div className="sf-flex-col sf-gap-xs">
												<span className="sf-font-medium">{w.wilaya}</span>
												<div className="sf-progress" style={{ height: 4, width: 120 }}>
													<div
														className="sf-progress-bar"
														style={{ width: `${pct}%`, background: "var(--color-brand-400)" }}
													/>
												</div>
											</div>
										</td>
										<td className="sf-text-center sf-text-tabular">
											{w.orders}
										</td>
										<td className="sf-text-end sf-font-semibold sf-text-tabular">
											{formatCurrency(w.revenue)}
										</td>
										<td className="sf-text-center sf-text-tabular">
											<span className="sf-badge sf-badge-success">
												{w.delivered}
											</span>
										</td>
										<td className="sf-text-center sf-text-tabular">
											<span className="sf-badge sf-badge-danger">
												{w.returned}
											</span>
										</td>
										<td
											className="sf-text-center sf-font-semibold sf-text-tabular"
											style={{
												color:
													successRate >= 70
														? "#10b981"
														: successRate >= 40
															? "#f59e0b"
															: "#ef4444",
											}}
										>
											{successRate}%
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			</div>
		</PageTransition>
	);
}

