"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
	ArrowRight,
	ArrowLeft,
	Tag,
	AlertCircle,
	Award,
	ShoppingBag,
	Percent,
	Search,
} from "lucide-react";
import type { ProductProfitability } from "@/types";
import { useI18n } from "@/lib/i18n";
import { useLayout } from "@/components/providers/Providers";
import {
	PageTransition,
	FadeIn,
	StaggerContainer,
} from "@/components/ui/motion";
import { SkeletonTable, SkeletonCard } from "@/components/ui/Skeleton";

export default function ProductProfitabilityPage() {
	const { locale, formatCurrency } = useI18n();
	const { isMobile } = useLayout();

	const [products, setProducts] = useState<ProductProfitability[]>([]);
	const [loading, setLoading] = useState(true);
	const [search, setSearch] = useState("");
	const [error, setError] = useState<string | null>(null);

	const isAr = locale === "ar";
	const isFr = locale === "fr";

	// Translation dictionary
	const dict = {
		title: isAr
			? "ربحية المنتجات"
			: isFr
				? "Rentabilité des Produits"
				: "Product Profitability",
		subtitle: isAr
			? "تحليل الأداء المالي، التكاليف ومعدل تسليم كل منتج"
			: isFr
				? "Analysez les performances financières, coûts et livraisons par produit"
				: "Analyze financial performance, costs, and delivery rates per product",
		backToDashboard: isAr
			? "العودة للوحة التحكم"
			: isFr
				? "Retour au tableau"
				: "Back to dashboard",
		searchPlaceholder: isAr
			? "البحث عن منتج بالاسم..."
			: isFr
				? "Rechercher un produit..."
				: "Search product by name...",
		name: isAr ? "المنتج" : isFr ? "Produit" : "Product",
		price: isAr ? "سعر البيع" : isFr ? "Prix de vente" : "Selling Price",
		cost: isAr ? "التكلفة" : isFr ? "Coût" : "Cost",
		sold: isAr ? "الوحدات المباعة" : isFr ? "Unités vendues" : "Units Sold",
		revenue: isAr ? "الإيرادات" : isFr ? "Revenu" : "Revenue",
		profit: isAr ? "صافي الربح" : isFr ? "Bénéfice" : "Net Profit",
		deliveryRate: isAr
			? "معدل التوصيل"
			: isFr
				? "Taux de livraison"
				: "Delivery Rate",
		noProducts: isAr
			? "لا توجد منتجات مطابقة للبحث"
			: isFr
				? "Aucun produit trouvé"
				: "No products found matching the search",
		failedToLoad: isAr
			? "فشل تحميل ربحية المنتجات"
			: isFr
				? "Échec du chargement des rentabilités"
				: "Failed to load product profitability data",

		// Quick KPI widgets
		mostProfitable: isAr
			? "المنتج الأكثر ربحاً"
			: isFr
				? "Plus Rentable"
				: "Most Profitable Product",
		topSeller: isAr
			? "المنتج الأكثر مبيعاً"
			: isFr
				? "Meilleure Vente"
				: "Top Seller (Volume)",
		avgDeliveryRate: isAr
			? "متوسط معدل التوصيل"
			: isFr
				? "Taux Moyen Liv."
				: "Avg. Delivery Rate",
		returned: isAr ? "المرتجع" : isFr ? "Retours" : "Returns",
		units: isAr ? "وحدة" : isFr ? "unités" : "units",
	};

	const loadData = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);

			const res = await fetch("/api/accounting/products");
			if (!res.ok) throw new Error("Failed to fetch product ranks");
			const data = await res.json();
			setProducts(data.products || []);
		} catch (err: unknown) {
			setError(err instanceof Error ? err.message : dict.failedToLoad);
		} finally {
			setLoading(false);
		}
	}, [dict]);

	useEffect(() => {
		loadData();
	}, [loadData]);

	// Filter products by search query
	const filteredProducts = products.filter((p) =>
		p.name.toLowerCase().includes(search.toLowerCase()),
	);

	// Calculate quick summary metrics
	const mostProfitableProduct =
		products.length > 0
			? products.reduce((prev, current) =>
					prev.total_profit > current.total_profit ? prev : current,
				)
			: null;
	const topSellerProduct =
		products.length > 0
			? products.reduce((prev, current) =>
					prev.units_sold > current.units_sold ? prev : current,
				)
			: null;

	const avgDeliveryRate =
		products.length > 0
			? Math.round(
					products.reduce((acc, p) => acc + Number(p.delivery_rate || 0), 0) /
						products.length,
				)
			: 0;

	return (
		<PageTransition>
			<div
				className="sf-accounting-layout"
				style={{ direction: isAr ? "rtl" : "ltr" }}
			>
				{/* Header */}
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
						<div
							style={{
								display: "flex",
								alignItems: "center",
								gap: 8,
								marginBottom: 4,
							}}
						>
							<Link
								href="/dashboard/accounting"
								style={{
									display: "flex",
									alignItems: "center",
									gap: 4,
									fontSize: 13,
									color: "var(--color-brand-500)",
									fontWeight: 600,
								}}
							>
								{isAr ? <ArrowRight size={14} /> : <ArrowLeft size={14} />}
								{dict.backToDashboard}
							</Link>
						</div>
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
						{/* Skeletons */}
						<div className="sf-pnl-metrics-grid">
							<SkeletonCard />
							<SkeletonCard />
							<SkeletonCard />
						</div>
						<SkeletonTable rows={8} />
					</>
				) : (
					<StaggerContainer>
						{/* Quick Stats Grid */}
						<FadeIn>
							<div className="sf-pnl-metrics-grid">
								{/* Stat 1: Most Profitable */}
								<div
									className="sf-pnl-card is-profit"
									style={{ minHeight: 120 }}
								>
									<div className="sf-pnl-card-label">
										<span>{dict.mostProfitable}</span>
										<Award size={18} color="var(--color-accent-400)" />
									</div>
									{mostProfitableProduct ? (
										<>
											<div
												className="sf-pnl-card-value"
												style={{
													fontSize: 20,
													whiteSpace: "nowrap",
													overflow: "hidden",
													textOverflow: "ellipsis",
												}}
												title={mostProfitableProduct.name}
											>
												{mostProfitableProduct.name}
											</div>
											<span
												style={{
													fontSize: 12,
													color: "var(--color-content-tertiary)",
												}}
											>
												{isAr ? "صافي الربح" : "Profit"}:{" "}
												<strong style={{ color: "var(--color-accent-400)" }}>
													{formatCurrency(mostProfitableProduct.total_profit)}
												</strong>
											</span>
										</>
									) : (
										<div
											style={{
												color: "var(--color-content-tertiary)",
												fontSize: 13,
												marginTop: 8,
											}}
										>
											-
										</div>
									)}
								</div>

								{/* Stat 2: Top Seller */}
								<div
									className="sf-pnl-card is-revenue"
									style={{ minHeight: 120 }}
								>
									<div className="sf-pnl-card-label">
										<span>{dict.topSeller}</span>
										<ShoppingBag size={18} color="#3b82f6" />
									</div>
									{topSellerProduct ? (
										<>
											<div
												className="sf-pnl-card-value"
												style={{
													fontSize: 20,
													whiteSpace: "nowrap",
													overflow: "hidden",
													textOverflow: "ellipsis",
												}}
												title={topSellerProduct.name}
											>
												{topSellerProduct.name}
											</div>
											<span
												style={{
													fontSize: 12,
													color: "var(--color-content-tertiary)",
												}}
											>
												{dict.sold}:{" "}
												<strong style={{ color: "#3b82f6" }}>
													{topSellerProduct.units_sold} {dict.units}
												</strong>
											</span>
										</>
									) : (
										<div
											style={{
												color: "var(--color-content-tertiary)",
												fontSize: 13,
												marginTop: 8,
											}}
										>
											-
										</div>
									)}
								</div>

								{/* Stat 3: Avg. Delivery Success */}
								<div className="sf-pnl-card" style={{ minHeight: 120 }}>
									<div className="sf-pnl-card-label">
										<span>{dict.avgDeliveryRate}</span>
										<Percent size={18} color="var(--color-warn-400)" />
									</div>
									<div
										className="sf-pnl-card-value"
										style={{ color: "var(--color-warn-400)" }}
									>
										{avgDeliveryRate}%
									</div>
									<span
										style={{
											fontSize: 12,
											color: "var(--color-content-tertiary)",
										}}
									>
										{isAr
											? "متوسط تسليم جميع المنتجات"
											: "Average delivery rate overall"}
									</span>
								</div>
							</div>
						</FadeIn>

						{/* Search Input */}
						<FadeIn delay={0.1}>
							<div
								className="sf-card"
								style={{
									display: "flex",
									gap: 12,
									padding: "10px 16px",
									alignItems: "center",
									marginTop: 24,
								}}
							>
								<Search
									size={18}
									style={{
										color: "var(--color-content-tertiary)",
										flexShrink: 0,
									}}
								/>
								<input
									type="text"
									placeholder={dict.searchPlaceholder}
									value={search}
									onChange={(e) => setSearch(e.target.value)}
									style={{
										background: "transparent",
										border: "none",
										width: "100%",
										fontSize: 14,
										color: "var(--color-content-primary)",
										outline: "none",
									}}
								/>
							</div>
						</FadeIn>

						{/* Profitability Table */}
						<FadeIn delay={0.15}>
							<div
								className="sf-card"
								style={{ padding: 0, overflow: "hidden", marginTop: 16 }}
							>
								<div style={{ overflowX: "auto" }}>
									<table className="sf-table">
										<thead>
											<tr>
												<th style={{ textAlign: isAr ? "right" : "left" }}>
													{dict.name}
												</th>
												<th style={{ textAlign: "center" }}>{dict.price}</th>
												<th style={{ textAlign: "center" }}>{dict.cost}</th>
												<th style={{ textAlign: "center" }}>{dict.sold}</th>
												<th style={{ textAlign: "center" }}>{dict.returned}</th>
												<th style={{ textAlign: "right" }}>{dict.revenue}</th>
												<th style={{ textAlign: "right" }}>{dict.profit}</th>
												<th style={{ textAlign: "center", width: 120 }}>
													{dict.deliveryRate}
												</th>
											</tr>
										</thead>
										<tbody>
											{filteredProducts.length === 0 ? (
												<tr>
													<td
														colSpan={8}
														style={{
															textAlign: "center",
															padding: "48px 0",
															color: "var(--color-content-tertiary)",
														}}
													>
														<Tag
															size={32}
															style={{
																opacity: 0.3,
																marginBottom: 8,
																marginInline: "auto",
															}}
														/>
														{dict.noProducts}
													</td>
												</tr>
											) : (
												filteredProducts.map((p) => (
													<tr key={p.id}>
														<td
															style={{
																fontWeight: 600,
																maxWidth: 200,
																whiteSpace: "nowrap",
																overflow: "hidden",
																textOverflow: "ellipsis",
															}}
															title={p.name}
														>
															{p.name}
														</td>
														<td style={{ textAlign: "center" }}>
															{formatCurrency(p.price)}
														</td>
														<td
															style={{
																textAlign: "center",
																color: "var(--color-content-secondary)",
															}}
														>
															{formatCurrency(p.cost_price)}
														</td>
														<td
															style={{ textAlign: "center", fontWeight: 600 }}
														>
															{p.units_sold}
														</td>
														<td
															style={{
																textAlign: "center",
																color: "var(--color-danger-400)",
															}}
														>
															{p.units_returned}
														</td>
														<td
															style={{
																textAlign: "right",
																color: "var(--color-content-primary)",
															}}
														>
															{formatCurrency(p.total_revenue)}
														</td>
														<td
															style={{
																textAlign: "right",
																fontWeight: 700,
																color:
																	p.total_profit >= 0
																		? "var(--color-accent-400)"
																		: "var(--color-danger-400)",
															}}
														>
															{formatCurrency(p.total_profit)}
														</td>
														<td style={{ textAlign: "center" }}>
															<span
																className={`sf-profitability-rate ${p.delivery_rate >= 75 ? "is-high" : p.delivery_rate >= 50 ? "is-medium" : "is-low"}`}
																style={{
																	display: "inline-block",
																	marginInline: "auto",
																}}
															>
																{p.delivery_rate}%
															</span>
														</td>
													</tr>
												))
											)}
										</tbody>
									</table>
								</div>
							</div>
						</FadeIn>
					</StaggerContainer>
				)}
			</div>
		</PageTransition>
	);
}
