"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { ArrowRight, ArrowLeft, Receipt, Tag, AlertCircle } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useLayout } from "@/components/providers/Providers";
import {
	PageTransition,
	FadeIn,
	StaggerContainer,
} from "@/components/ui/motion";
import { SkeletonCard, SkeletonTable } from "@/components/ui/Skeleton";
import type { PnLSummary, ProductProfitability, Expense } from "@/types";
import { PnLCard } from "@/components/accounting/PnLCard";
import {
	ChartContainer,
	ProfitTrendChart,
	ExpensesPieChart,
} from "@/components/ui/charts";

type Period = "7d" | "30d" | "90d" | "year";

export default function AccountingDashboardPage() {
	const { locale, formatCurrency } = useI18n();
	const { isMobile } = useLayout();
	const [period, setPeriod] = useState<Period>("30d");
	const [loading, setLoading] = useState(true);
	const [pnl, setPnl] = useState<PnLSummary | null>(null);
	const [trend, setTrend] = useState<
		Array<{
			date: string;
			revenue: number;
			totalExpenses: number;
			netProfit: number;
		}>
	>([]);
	const [products, setProducts] = useState<ProductProfitability[]>([]);
	const [expenses, setExpenses] = useState<Expense[]>([]);
	const [error, setError] = useState<string | null>(null);

	const isAr = locale === "ar";
	const isFr = locale === "fr";

	// Quick dictionary for accounting strings
	const dict = useMemo(
		() => ({
			title: isAr
				? "إدارة الحسابات والمالية"
				: isFr
					? "Gestion Financière"
					: "Financial Management",
			subtitle: isAr
				? "تتبع الأرباح، الإيرادات، المصاريف وعوائد المنتجات"
				: isFr
					? "Suivez vos bénéfices, revenus, dépenses et rentabilité"
					: "Track profits, revenues, expenses, and product margins",
			revenue: isAr
				? "إجمالي الإيرادات"
				: isFr
					? "Revenu Global"
					: "Total Revenue",
			expenses: isAr
				? "المصاريف الكلية"
				: isFr
					? "Total Dépenses"
					: "Total Expenses",
			netProfit: isAr ? "صافي الربح" : isFr ? "Bénéfice Net" : "Net Profit",
			profitabilityRatio: isAr
				? "نسبة الربحية"
				: isFr
					? "Ratio de Rentabilité"
					: "Profitability Ratio",
			financialBreakdown: isAr
				? "تفاصيل البيان المالي"
				: isFr
					? "Détails du Bilan Financier"
					: "Financial Breakdown",
			cog: isAr
				? "تكلفة البضائع المباعة"
				: isFr
					? "Coût des Marchandises"
					: "Cost of Goods Sold",
			deliveryCosts: isAr
				? "تكاليف التوصيل"
				: isFr
					? "Coûts de Livraison"
					: "Delivery Costs",
			returnLosses: isAr
				? "خسائر المرتجعات"
				: isFr
					? "Pertes sur Retours"
					: "Return Losses",
			operatingExpenses: isAr
				? "المصاريف التشغيلية"
				: isFr
					? "Dépenses Opérationnelles"
					: "Operating Expenses",
			refunds: isAr ? "المبالغ المستردة" : isFr ? "Remboursements" : "Refunds",
			performance: isAr
				? "مؤشرات الأداء"
				: isFr
					? "Indicateurs de Performance"
					: "Performance Indicators",
			deliveredOrders: isAr
				? "الطلبات المسلمة"
				: isFr
					? "Commandes Livrées"
					: "Delivered Orders",
			returnedOrders: isAr
				? "الطلبات المسترجعة"
				: isFr
					? "Commandes Retournées"
					: "Returned Orders",
			deliveryRate: isAr
				? "معدل التوصيل"
				: isFr
					? "Taux de Livraison"
					: "Delivery Rate",
			recentExpenses: isAr
				? "آخر المصاريف"
				: isFr
					? "Dépenses Récentes"
					: "Recent Expenses",
			manageExpenses: isAr
				? "إدارة المصاريف"
				: isFr
					? "Gérer les Dépenses"
					: "Manage Expenses",
			productProfitability: isAr
				? "ربحية المنتجات"
				: isFr
					? "Rentabilité des Produits"
					: "Product Profitability",
			viewAllProducts: isAr
				? "عرض كل المنتجات"
				: isFr
					? "Voir tous les produits"
					: "View All Products",
			noExpenses: isAr
				? "لا توجد مصاريف مسجلة"
				: isFr
					? "Aucune dépense enregistrée"
					: "No expenses recorded",
			noProducts: isAr
				? "لا توجد منتجات مسجلة"
				: isFr
					? "Aucun produit trouvé"
					: "No products found",
			failedToLoad: isAr
				? "فشل تحميل البيانات المالية"
				: isFr
					? "Échec du chargement des données"
					: "Failed to load financial data",
			days7: isAr ? "آخر 7 أيام" : isFr ? "7 Derniers Jours" : "Last 7 Days",
			days30: isAr ? "آخر 30 يوم" : isFr ? "30 Derniers Jours" : "Last 30 Days",
			days90: isAr ? "آخر 90 يوم" : isFr ? "90 Derniers Jours" : "Last 90 Days",
			year: isAr ? "هذا العام" : isFr ? "Cette Année" : "This Year",
			// New dictionary keys for charts and translations
			profitTrend: isAr
				? "اتجاهات الأرباح والخسائر"
				: isFr
					? "Évolution des Profits & Pertes"
					: "P&L Trend Overview",
			expenseAllocation: isAr
				? "توزيع المصاريف"
				: isFr
					? "Allocation des Dépenses"
					: "Expense Allocation",
			revenueLabel: isAr ? "الإيرادات" : isFr ? "Revenu" : "Revenue",
			expensesLabel: isAr
				? "إجمالي المصاريف"
				: isFr
					? "Total Dépenses"
					: "Total Expenses",
			profitLabel: isAr ? "صافي الربح" : isFr ? "Bénéfice Net" : "Net Profit",
			cogsLabel: isAr
				? "تكلفة البضائع"
				: isFr
					? "Coût Marchandises"
					: "Cost of Goods",
			deliveryLabel: isAr
				? "تكاليف التوصيل"
				: isFr
					? "Coûts Livraison"
					: "Delivery Costs",
			returnsLabel: isAr
				? "خسائر المرتجعات"
				: isFr
					? "Pertes Retours"
					: "Return Losses",
			operatingLabel: isAr
				? "المصاريف التشغيلية"
				: isFr
					? "Dépenses Opérationnelles"
					: "Operating Expenses",
			refundsLabel: isAr
				? "المبالغ المستردة"
				: isFr
					? "Remboursements"
					: "Refunds",
		}),
		[isAr, isFr],
	);

	const loadData = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);

			// Fetch P&L summary, trend, products, and expenses in parallel
			const [pnlRes, trendRes, prodRes, expRes] = await Promise.all([
				fetch(`/api/accounting/pnl?period=${period}`),
				fetch(`/api/accounting/trend?period=${period}`),
				fetch("/api/accounting/products"),
				fetch("/api/expenses?limit=5"),
			]);

			if (!pnlRes.ok) throw new Error("Failed to fetch P&L summary");
			if (!trendRes.ok) throw new Error("Failed to fetch trend data");
			if (!prodRes.ok) throw new Error("Failed to fetch products ranking");
			if (!expRes.ok) throw new Error("Failed to fetch recent expenses");

			const [pnlData, trendData, prodData, expData] = await Promise.all([
				pnlRes.json(),
				trendRes.json(),
				prodRes.json(),
				expRes.json(),
			]);

			setPnl(pnlData.summary);
			setTrend(trendData.trend || []);
			setProducts(prodData.products?.slice(0, 5) || []);
			setExpenses(expData.expenses || []);
		} catch (err: unknown) {
			setError(err instanceof Error ? err.message : dict.failedToLoad);
		} finally {
			setLoading(false);
		}
	}, [period, dict]);

	useEffect(() => {
		loadData();
	}, [loadData]);

	// Calculate Profitability Ratio
	const revenue = pnl?.revenue || 0;
	const netProfit =
		revenue -
		(pnl?.cost_of_goods || 0) -
		(pnl?.delivery_costs || 0) -
		(pnl?.expenses || 0) -
		(pnl?.refunds || 0);
	const profitMarginPercent =
		revenue > 0 ? Math.round((netProfit / revenue) * 100) : 0;

	// Calculate return losses rate
	const _returnRate = pnl
		? Math.round(
				(pnl.orders_returned /
					(pnl.orders_delivered + pnl.orders_returned || 1)) *
					100,
			)
		: 0;

	// Calculate expense allocation data for the pie chart
	const expenseData = [
		{
			name: dict.cogsLabel,
			value: pnl?.cost_of_goods || 0,
			color: "var(--color-brand-400)",
		},
		{
			name: dict.deliveryLabel,
			value: pnl?.delivery_costs || 0,
			color: "var(--color-accent-400)",
		},
		{
			name: dict.returnsLabel,
			value: pnl?.return_losses || 0,
			color: "var(--color-danger-400)",
		},
		{
			name: dict.operatingLabel,
			value: pnl?.expenses || 0,
			color: "var(--color-warn-400)",
		},
		{
			name: dict.refundsLabel,
			value: pnl?.refunds || 0,
			color: "var(--color-content-tertiary)",
		},
	];

	return (
		<PageTransition>
			<div
				className="sf-accounting-layout"
				style={{ direction: isAr ? "rtl" : "ltr" }}
			>
				{/* Header Section */}
				<div
					style={{
						display: "flex",
						flexDirection: isMobile ? "column" : "row",
						justifyContent: "space-between",
						alignItems: isMobile ? "flex-start" : "center",
						gap: 16,
					}}
				>
					<div>
						<h1
							className="sf-page-title"
							style={{ margin: 0, fontSize: 24, fontWeight: 800 }}
						>
							{dict.title}
						</h1>
						<p
							style={{
								color: "var(--color-content-tertiary)",
								fontSize: 14,
								margin: "4px 0 0 0",
							}}
						>
							{dict.subtitle}
						</p>
					</div>

					{/* Period Filter */}
					<div className="sf-period-filter-bar">
						{(["7d", "30d", "90d", "year"] as Period[]).map((p) => (
							<button
								key={p}
								onClick={() => setPeriod(p)}
								className={`sf-period-btn ${period === p ? "is-active" : ""}`}
							>
								{p === "7d"
									? dict.days7
									: p === "30d"
										? dict.days30
										: p === "90d"
											? dict.days90
											: dict.year}
							</button>
						))}
					</div>
				</div>

				{error && (
					<div
						className="sf-card"
						style={{
							display: "flex",
							alignItems: "center",
							gap: 12,
							borderColor: "var(--color-danger-300)",
							background: "rgba(239, 68, 68, 0.05)",
						}}
					>
						<AlertCircle color="var(--color-danger-400)" size={20} />
						<span style={{ color: "var(--color-danger-400)", fontWeight: 600 }}>
							{error}
						</span>
					</div>
				)}

				{loading ? (
					<>
						{/* KPI Cards Skeletons */}
						<div className="sf-pnl-metrics-grid">
							<SkeletonCard />
							<SkeletonCard />
							<SkeletonCard />
						</div>

						{/* Chart Skeleton */}
						<div style={{ marginTop: 24 }}>
							<SkeletonCard />
						</div>

						{/* Panels Skeletons */}
						<div className="sf-accounting-panels" style={{ marginTop: 24 }}>
							<SkeletonTable rows={4} />
							<SkeletonCard />
						</div>
					</>
				) : (
					<StaggerContainer>
						{/* KPI Cards Grid */}
						<FadeIn>
							<div className="sf-pnl-metrics-grid">
								<PnLCard
									title={dict.revenue}
									value={revenue}
									type="revenue"
									subText={
										isAr
											? "المبيعات المستلمة"
											: isFr
												? "Ventes encaissées"
												: "Collected sales"
									}
								/>
								<PnLCard
									title={dict.expenses}
									value={
										(pnl?.cost_of_goods || 0) +
										(pnl?.delivery_costs || 0) +
										(pnl?.expenses || 0) +
										(pnl?.refunds || 0)
									}
									type="expenses"
									subText={
										isAr
											? "البضائع + التوصيل + مصاريف تشغيلية"
											: isFr
												? "Biens + Livraisons + Opérationnel"
												: "Goods + Deliveries + Operations"
									}
								/>
								<PnLCard
									title={dict.netProfit}
									value={netProfit}
									type="profit"
									subText={
										isAr
											? `هامش الربح الكلي: ${profitMarginPercent}%`
											: isFr
												? `Marge globale : ${profitMarginPercent}%`
												: `Overall Margin: ${profitMarginPercent}%`
									}
								/>
							</div>
						</FadeIn>

						{/* Profit Trend Chart Panel */}
						<FadeIn delay={0.05}>
							<div style={{ marginTop: 24 }}>
								<ChartContainer
									title={dict.profitTrend}
									empty={trend.length === 0}
									emptyTitle={
										isAr ? "لا توجد بيانات كافية" : "Pas assez de données"
									}
									emptyDescription={
										isAr
											? "سيتم عرض البيانات عند توفر الطلبات والمصاريف"
											: "Les données s'afficheront ici"
									}
									height={320}
								>
									<ProfitTrendChart
										data={trend}
										revenueLabel={dict.revenueLabel}
										expensesLabel={dict.expensesLabel}
										profitLabel={dict.profitLabel}
									/>
								</ChartContainer>
							</div>
						</FadeIn>

						{/* Main panels layout */}
						<FadeIn delay={0.1}>
							<div className="sf-accounting-panels" style={{ marginTop: 24 }}>
								{/* Left Panel: Financial Statement Details */}
								<div className="sf-panel">
									<div className="sf-panel-title">
										<span>{dict.financialBreakdown}</span>
										<span
											style={{
												fontSize: 12,
												color: "var(--color-content-tertiary)",
												fontWeight: 500,
											}}
										>
											{period === "7d"
												? dict.days7
												: period === "30d"
													? dict.days30
													: period === "90d"
														? dict.days90
														: dict.year}
										</span>
									</div>

									<div
										style={{
											display: "flex",
											flexDirection: isMobile ? "column" : "row",
											gap: 24,
											marginTop: 8,
											alignItems: "center",
										}}
									>
										<div
											style={{
												flex: 1,
												display: "flex",
												flexDirection: "column",
												gap: 16,
												width: "100%",
											}}
										>
											{/* Item: Total Revenue */}
											<div
												style={{
													display: "flex",
													flexDirection: "column",
													gap: 6,
												}}
											>
												<div
													style={{
														display: "flex",
														justifyContent: "space-between",
														fontSize: 14,
													}}
												>
													<span style={{ fontWeight: 600 }}>
														{dict.revenue}
													</span>
													<span
														style={{
															fontWeight: 700,
															color: "var(--color-content-primary)",
														}}
													>
														{formatCurrency(revenue)}
													</span>
												</div>
												<div
													style={{
														height: 6,
														background: "var(--color-surface-tertiary)",
														borderRadius: 3,
														overflow: "hidden",
													}}
												>
													<div
														style={{
															width: "100%",
															height: "100%",
															background:
																"linear-gradient(90deg, #6366f1, #3b82f6)",
															borderRadius: 3,
														}}
													/>
												</div>
											</div>

											{/* Item: Cost of Goods */}
											<div
												style={{
													display: "flex",
													flexDirection: "column",
													gap: 6,
												}}
											>
												<div
													style={{
														display: "flex",
														justifyContent: "space-between",
														fontSize: 14,
													}}
												>
													<span
														style={{ color: "var(--color-content-secondary)" }}
													>
														{dict.cog}
													</span>
													<span style={{ fontWeight: 600 }}>
														{formatCurrency(pnl?.cost_of_goods || 0)}
													</span>
												</div>
												<div
													style={{
														height: 6,
														background: "var(--color-surface-tertiary)",
														borderRadius: 3,
														overflow: "hidden",
													}}
												>
													<div
														style={{
															width: `${revenue > 0 ? Math.min(100, ((pnl?.cost_of_goods || 0) / revenue) * 100) : 0}%`,
															height: "100%",
															background: "var(--color-brand-400)",
															borderRadius: 3,
														}}
													/>
												</div>
											</div>

											{/* Item: Delivery Costs */}
											<div
												style={{
													display: "flex",
													flexDirection: "column",
													gap: 6,
												}}
											>
												<div
													style={{
														display: "flex",
														justifyContent: "space-between",
														fontSize: 14,
													}}
												>
													<span
														style={{ color: "var(--color-content-secondary)" }}
													>
														{dict.deliveryCosts}
													</span>
													<span style={{ fontWeight: 600 }}>
														{formatCurrency(pnl?.delivery_costs || 0)}
													</span>
												</div>
												<div
													style={{
														height: 6,
														background: "var(--color-surface-tertiary)",
														borderRadius: 3,
														overflow: "hidden",
													}}
												>
													<div
														style={{
															width: `${revenue > 0 ? Math.min(100, ((pnl?.delivery_costs || 0) / revenue) * 100) : 0}%`,
															height: "100%",
															background: "var(--color-accent-400)",
															borderRadius: 3,
														}}
													/>
												</div>
											</div>

											{/* Item: Return Losses */}
											<div
												style={{
													display: "flex",
													flexDirection: "column",
													gap: 6,
												}}
											>
												<div
													style={{
														display: "flex",
														justifyContent: "space-between",
														fontSize: 14,
													}}
												>
													<span
														style={{ color: "var(--color-content-secondary)" }}
													>
														{dict.returnLosses}
													</span>
													<span
														style={{
															fontWeight: 600,
															color: "var(--color-danger-400)",
														}}
													>
														{formatCurrency(pnl?.return_losses || 0)}
													</span>
												</div>
												<div
													style={{
														height: 6,
														background: "var(--color-surface-tertiary)",
														borderRadius: 3,
														overflow: "hidden",
													}}
												>
													<div
														style={{
															width: `${revenue > 0 ? Math.min(100, ((pnl?.return_losses || 0) / revenue) * 100) : 0}%`,
															height: "100%",
															background: "var(--color-danger-400)",
															borderRadius: 3,
														}}
													/>
												</div>
											</div>

											{/* Item: Operating Expenses */}
											<div
												style={{
													display: "flex",
													flexDirection: "column",
													gap: 6,
												}}
											>
												<div
													style={{
														display: "flex",
														justifyContent: "space-between",
														fontSize: 14,
													}}
												>
													<span
														style={{ color: "var(--color-content-secondary)" }}
													>
														{dict.operatingExpenses}
													</span>
													<span style={{ fontWeight: 600 }}>
														{formatCurrency(pnl?.expenses || 0)}
													</span>
												</div>
												<div
													style={{
														height: 6,
														background: "var(--color-surface-tertiary)",
														borderRadius: 3,
														overflow: "hidden",
													}}
												>
													<div
														style={{
															width: `${revenue > 0 ? Math.min(100, ((pnl?.expenses || 0) / revenue) * 100) : 0}%`,
															height: "100%",
															background: "var(--color-warn-400)",
															borderRadius: 3,
														}}
													/>
												</div>
											</div>

											{/* Item: Refunds */}
											<div
												style={{
													display: "flex",
													flexDirection: "column",
													gap: 6,
												}}
											>
												<div
													style={{
														display: "flex",
														justifyContent: "space-between",
														fontSize: 14,
													}}
												>
													<span
														style={{ color: "var(--color-content-secondary)" }}
													>
														{dict.refunds}
													</span>
													<span style={{ fontWeight: 600 }}>
														{formatCurrency(pnl?.refunds || 0)}
													</span>
												</div>
												<div
													style={{
														height: 6,
														background: "var(--color-surface-tertiary)",
														borderRadius: 3,
														overflow: "hidden",
													}}
												>
													<div
														style={{
															width: `${revenue > 0 ? Math.min(100, ((pnl?.refunds || 0) / revenue) * 100) : 0}%`,
															height: "100%",
															background: "var(--color-content-tertiary)",
															borderRadius: 3,
														}}
													/>
												</div>
											</div>
										</div>

										{/* Expense Allocation Pie Chart */}
										<div
											style={{
												width: isMobile ? "100%" : 240,
												height: 240,
												display: "flex",
												flexDirection: "column",
												alignItems: "center",
												justifyContent: "center",
												position: "relative",
											}}
										>
											<span
												style={{
													fontSize: 12,
													fontWeight: 600,
													color: "var(--color-content-secondary)",
													marginBottom: 8,
													textAlign: "center",
												}}
											>
												{dict.expenseAllocation}
											</span>
											<ExpensesPieChart data={expenseData} />
										</div>
									</div>
								</div>

								{/* Right Panel: Profitability & Margins */}
								<div
									className="sf-panel"
									style={{
										justifyContent: "center",
										alignItems: "center",
										position: "relative",
										overflow: "hidden",
									}}
								>
									<div
										style={{
											position: "absolute",
											top: 16,
											left: 16,
											right: 16,
										}}
									>
										<div className="sf-panel-title">
											{dict.profitabilityRatio}
										</div>
									</div>

									{/* Premium Progressive Ring */}
									<div
										style={{
											display: "flex",
											flexDirection: "column",
											alignItems: "center",
											gap: 16,
											marginTop: 32,
										}}
									>
										<div
											style={{
												position: "relative",
												width: 140,
												height: 140,
												display: "flex",
												alignItems: "center",
												justifyItems: "center",
											}}
										>
											<svg
												width="140"
												height="140"
												viewBox="0 0 140 140"
												style={{ transform: "rotate(-90deg)" }}
											>
												<circle
													cx="70"
													cy="70"
													r="55"
													stroke="var(--color-surface-tertiary)"
													strokeWidth="10"
													fill="transparent"
												/>
												<circle
													cx="70"
													cy="70"
													r="55"
													stroke={
														netProfit > 0
															? "var(--color-accent-400)"
															: "var(--color-danger-400)"
													}
													strokeWidth="10"
													fill="transparent"
													strokeDasharray={2 * Math.PI * 55}
													strokeDashoffset={
														2 *
														Math.PI *
														55 *
														(1 -
															Math.max(0, Math.min(100, profitMarginPercent)) /
																100)
													}
													strokeLinecap="round"
													style={{
														transition:
															"stroke-dashoffset 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)",
													}}
												/>
											</svg>
											<div
												style={{
													position: "absolute",
													inset: 0,
													display: "flex",
													flexDirection: "column",
													alignItems: "center",
													justifyContent: "center",
												}}
											>
												<span
													style={{
														fontSize: 24,
														fontWeight: 800,
														color: "var(--color-content-primary)",
													}}
												>
													{profitMarginPercent}%
												</span>
												<span
													style={{
														fontSize: 10,
														color: "var(--color-content-tertiary)",
														textTransform: "uppercase",
														letterSpacing: 0.5,
													}}
												>
													Margin
												</span>
											</div>
										</div>

										<div style={{ textAlign: "center" }}>
											<p
												style={{
													margin: 0,
													fontSize: 14,
													fontWeight: 700,
													color: "var(--color-content-secondary)",
												}}
											>
												{netProfit > 0
													? isAr
														? "نشاطك التجاري مربح"
														: isFr
															? "Votre commerce est rentable"
															: "Your business is profitable"
													: isAr
														? "نشاطك يواجه خسائر"
														: isFr
															? "Déficit financier"
															: "Your business faces losses"}
											</p>
											<span
												style={{
													fontSize: 12,
													color: "var(--color-content-tertiary)",
												}}
											>
												{isAr
													? "صافي الربح الفعلي"
													: isFr
														? "Bénéfice net réel"
														: "Actual net profit"}
												: {formatCurrency(netProfit)}
											</span>
										</div>
									</div>
								</div>
							</div>
						</FadeIn>

						{/* Section 2: Recent Expenses & Top Products */}
						<FadeIn delay={0.2}>
							<div className="sf-accounting-panels" style={{ marginTop: 24 }}>
								{/* Recent Expenses List */}
								<div className="sf-panel">
									<div className="sf-panel-title">
										<span>{dict.recentExpenses}</span>
										<Link
											href="/dashboard/accounting/expenses"
											style={{
												fontSize: 12,
												fontWeight: 600,
												color: "var(--color-brand-500)",
												display: "flex",
												alignItems: "center",
												gap: 4,
											}}
										>
											{dict.manageExpenses}
											{isAr ? (
												<ArrowLeft size={14} />
											) : (
												<ArrowRight size={14} />
											)}
										</Link>
									</div>

									<div
										style={{
											display: "flex",
											flexDirection: "column",
											gap: 10,
											marginTop: 8,
										}}
									>
										{expenses.length === 0 ? (
											<div
												style={{
													textAlign: "center",
													padding: "32px 0",
													color: "var(--color-content-tertiary)",
													fontSize: 13,
												}}
											>
												<Receipt
													size={24}
													style={{
														opacity: 0.5,
														marginBottom: 8,
														marginInline: "auto",
													}}
												/>
												{dict.noExpenses}
											</div>
										) : (
											expenses.map((exp) => (
												<div key={exp.id} className="sf-expense-row">
													<div className="sf-expense-info">
														<span className="sf-expense-description">
															{exp.description ||
																(isAr ? "مصاريف عامة" : "General expense")}
														</span>
														<div className="sf-expense-meta">
															<span
																className={`sf-badge sf-badge-expense-${exp.category}`}
																style={{
																	fontSize: 10,
																	padding: "2px 6px",
																	borderRadius: 4,
																	textTransform: "capitalize",
																}}
															>
																{exp.category}
															</span>
															<span>•</span>
															<span>{exp.expense_date}</span>
														</div>
													</div>
													<span
														className="sf-expense-amount"
														style={{ color: "var(--color-danger-400)" }}
													>
														-{formatCurrency(exp.amount)}
													</span>
												</div>
											))
										)}
									</div>
								</div>

								{/* Top Products profitability rankings */}
								<div className="sf-panel">
									<div className="sf-panel-title">
										<span>{dict.productProfitability}</span>
										<Link
											href="/dashboard/accounting/products"
											style={{
												fontSize: 12,
												fontWeight: 600,
												color: "var(--color-brand-500)",
												display: "flex",
												alignItems: "center",
												gap: 4,
											}}
										>
											{dict.viewAllProducts}
											{isAr ? (
												<ArrowLeft size={14} />
											) : (
												<ArrowRight size={14} />
											)}
										</Link>
									</div>

									<div
										style={{
											display: "flex",
											flexDirection: "column",
											gap: 8,
											marginTop: 8,
										}}
									>
										{products.length === 0 ? (
											<div
												style={{
													textAlign: "center",
													padding: "32px 0",
													color: "var(--color-content-tertiary)",
													fontSize: 13,
												}}
											>
												<Tag
													size={24}
													style={{
														opacity: 0.5,
														marginBottom: 8,
														marginInline: "auto",
													}}
												/>
												{dict.noProducts}
											</div>
										) : (
											<>
												<div className="sf-profitability-row is-header">
													<span>{isAr ? "المنتج" : "Produit"}</span>
													<span style={{ textAlign: "end" }}>
														{isAr ? "المبيعات" : "Sold"}
													</span>
													<span style={{ textAlign: "end" }}>
														{isAr ? "الربح" : "Profit"}
													</span>
													<span style={{ textAlign: "end" }}>
														{isAr ? "التوصيل" : "Deliv."}
													</span>
												</div>
												{products.map((p) => (
													<div key={p.id} className="sf-profitability-row">
														<span
															className="sf-profitability-name"
															title={p.name}
														>
															{p.name}
														</span>
														<span className="sf-profitability-stat">
															{p.units_sold}
														</span>
														<span className="sf-profitability-profit">
															{formatCurrency(p.total_profit)}
														</span>
														<span
															className={`sf-profitability-rate ${p.delivery_rate >= 75 ? "is-high" : p.delivery_rate >= 50 ? "is-medium" : "is-low"}`}
														>
															{p.delivery_rate}%
														</span>
													</div>
												))}
											</>
										)}
									</div>
								</div>
							</div>
						</FadeIn>
					</StaggerContainer>
				)}
			</div>
		</PageTransition>
	);
}
