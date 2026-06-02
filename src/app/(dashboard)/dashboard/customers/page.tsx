"use client";

import { useState, useEffect, useCallback } from "react";
import {
	Users,
	Search,
	DollarSign,
	Download,
	X,
	Phone,
	MapPin,
	MessageCircle,
	Ban,
	TrendingUp,
	Loader2,
} from "lucide-react";
import {
	getCustomers,
	updateCustomer,
	deleteCustomer,
	getOrdersByCustomer,
} from "@/lib/data/service";
import { calculateAllCustomerRisks, type RiskResult } from "@/lib/data/risk";
import { exportCustomersCSV } from "@/lib/data/export";
import { useI18n } from "@/lib/i18n";
import type { Customer, Order } from "@/types/database";
import { useLayout } from "@/components/providers/Providers";
import { useToast } from "@/components/dashboard/ToastProvider";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { SkeletonCard, SkeletonTable } from "@/components/ui/Skeleton";
import { PageTransition } from "@/components/ui/motion";
import { getWilayaName } from "@/lib/data/wilayas";

interface EnrichedCustomer extends Customer {
	ordersCount: number;
	totalSpent: number;
	lastOrder: string | null;
	confirmationRate: number;
	returnRate: number;
	avgOrderValue: number;
	custOrders: Order[];
	riskLevel: string;
}

export default function CustomersPage() {
	const { t, formatCurrency, formatTimeAgo, locale } = useI18n();
	const { isMobile } = useLayout();
	const [customers, setCustomers] = useState<Customer[]>([]);
	const [loading, setLoading] = useState(true);
	const [search, setSearch] = useState("");
	const { toast } = useToast();
	const [selectedCustomer, setSelectedCustomer] =
		useState<EnrichedCustomer | null>(null);
	const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
	const [editing, setEditing] = useState(false);
	const [saving, setSaving] = useState(false);
	const customerPanelRef = useFocusTrap(!!selectedCustomer, () => {
		setSelectedCustomer(null);
		setEditing(false);
		setShowDeleteConfirm(false);
	});
	const [blocking, setBlocking] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [editForm, setEditForm] = useState({
		name: "",
		phone: "",
		wilaya: "",
		commune: "",
		address: "",
	});
	const [segment, setSegment] = useState<
		"all" | "vip" | "at_risk" | "new" | "blocked"
	>("all");
	const [riskMap, setRiskMap] = useState<Record<string, RiskResult>>({});
	const [loadingDetail, setLoadingDetail] = useState(false);

	const loadData = useCallback(async () => {
		try {
			setLoading(true);
			const [cResult, risks] = await Promise.all([
				getCustomers({ limit: 500 }),
				calculateAllCustomerRisks().catch(() => []),
			]);
			const c = cResult.data;
			setCustomers(c as Customer[]);
			const rm: Record<string, RiskResult> = {};
			(risks as Array<{ id: string; risk: RiskResult }>).forEach((r) => {
				rm[r.id] = r.risk;
			});
			setRiskMap(rm);
		} catch {
			toast({
				type: "error",
				title: t.customers?.loadFailed || t.common.error,
			});
		} finally {
			setLoading(false);
		}
	}, [toast, t.customers?.loadFailed, t.common.error]);

	useEffect(() => {
		loadData();
	}, [loadData]);

	async function selectCustomer(c: Customer) {
		const risk = riskMap[c.id];
		const riskLevel = c.is_blocked ? "blocked" : risk?.level || "low";
		const enriched: EnrichedCustomer = {
			...c,
			ordersCount: c.order_count,
			totalSpent: Number(c.total_spent) || 0,
			lastOrder: null,
			confirmationRate: 0,
			returnRate: 0,
			avgOrderValue:
				c.order_count > 0
					? Math.round(Number(c.total_spent) / c.order_count)
					: 0,
			custOrders: [],
			riskLevel,
		};
		setSelectedCustomer(enriched);
		setLoadingDetail(true);
		try {
			const custOrders = (await getOrdersByCustomer(c.id)) as Order[];
			const totalSpent = custOrders.reduce(
				(s, o) => s + Number(o.total_price || 0),
				0,
			);
			const lastOrder = custOrders.length > 0 ? custOrders[0].created_at : null;
			const confirmedOrders = custOrders.filter((o) =>
				["confirmed", "shipped", "delivered"].includes(o.status),
			).length;
			const returnedOrders = custOrders.filter((o) =>
				["returned", "refused"].includes(o.status),
			).length;
			const nonDraftOrders = custOrders.filter(
				(o) => o.status !== "draft",
			).length;
			const confirmationRate =
				nonDraftOrders > 0
					? Math.round((confirmedOrders / nonDraftOrders) * 100)
					: 0;
			const returnRate =
				nonDraftOrders > 0
					? Math.round((returnedOrders / nonDraftOrders) * 100)
					: 0;
			const avgOrderValue =
				custOrders.length > 0 ? Math.round(totalSpent / custOrders.length) : 0;
			setSelectedCustomer({
				...c,
				ordersCount: custOrders.length,
				totalSpent,
				lastOrder,
				confirmationRate,
				returnRate,
				avgOrderValue,
				custOrders,
				riskLevel,
			});
		} catch {
			toast({
				type: "error",
				title: t.customers?.detailFailed || t.common.error,
			});
		} finally {
			setLoadingDetail(false);
		}
	}

	const enriched = customers.map((c) => {
		const risk = riskMap[c.id];
		const riskLevel = c.is_blocked
			? "blocked"
			: risk?.level || (c.order_count <= 1 ? "new" : "low");
		const totalSpent = Number(c.total_spent) || 0;
		const avgOrderValue =
			c.order_count > 0 ? Math.round(totalSpent / c.order_count) : 0;
		return {
			...c,
			ordersCount: c.order_count,
			totalSpent,
			lastOrder: null,
			confirmationRate: 0,
			returnRate: 0,
			avgOrderValue,
			custOrders: [],
			riskLevel,
		} as EnrichedCustomer;
	});

	const segmented =
		segment === "all"
			? enriched
			: segment === "vip"
				? enriched.filter(
						(c) => c.totalSpent >= 10000 && c.riskLevel !== "high",
					)
				: segment === "at_risk"
					? enriched.filter((c) => c.riskLevel === "high")
					: segment === "new"
						? enriched.filter((c) => c.ordersCount <= 1)
						: segment === "blocked"
							? enriched.filter((c) => c.is_blocked)
							: enriched;

	const filtered = segmented.filter((c) => {
		if (!search) return true;
		return (
			c.name?.toLowerCase().includes(search.toLowerCase()) ||
			c.phone?.includes(search) ||
			c.wilaya?.toLowerCase().includes(search.toLowerCase())
		);
	});

	const totalCustomers = customers.length;
	const totalOrdersCount = enriched.reduce((s, c) => s + c.ordersCount, 0);
	const totalSpent = enriched.reduce((s, c) => s + c.totalSpent, 0);

	async function toggleBlock(customer: EnrichedCustomer) {
		setBlocking(true);
		try {
			await updateCustomer(customer.id, { is_blocked: !customer.is_blocked });
			setCustomers((prev) =>
				prev.map((c) =>
					c.id === customer.id ? { ...c, is_blocked: !customer.is_blocked } : c,
				),
			);
			setSelectedCustomer((prev: EnrichedCustomer | null) =>
				prev ? { ...prev, is_blocked: !prev.is_blocked } : null,
			);
			toast({
				type: "success",
				title: customer.is_blocked
					? t.customers.customerUnblocked
					: t.customers.customerBlocked,
			});
		} catch (e) {
			toast({ type: "error", title: (e as Error).message });
		} finally {
			setBlocking(false);
		}
	}

	function startEditing() {
		if (!selectedCustomer) return;
		setEditForm({
			name: selectedCustomer.name || "",
			phone: selectedCustomer.phone || "",
			wilaya: selectedCustomer.wilaya || "",
			commune: selectedCustomer.commune || "",
			address: selectedCustomer.address || "",
		});
		setEditing(true);
	}

	async function saveEdits() {
		if (!selectedCustomer) return;
		setSaving(true);
		try {
			await updateCustomer(selectedCustomer.id, editForm);
			setCustomers((prev) =>
				prev.map((c) =>
					c.id === selectedCustomer.id ? { ...c, ...editForm } : c,
				),
			);
			setSelectedCustomer((prev) => (prev ? { ...prev, ...editForm } : null));
			setEditing(false);
			toast({ type: "success", title: t.customers.editCustomer });
		} catch (e) {
			toast({ type: "error", title: (e as Error).message });
		} finally {
			setSaving(false);
		}
	}

	async function confirmDeleteCustomer() {
		if (!selectedCustomer) return;
		setDeleting(true);
		try {
			await deleteCustomer(selectedCustomer.id);
			setCustomers((prev) => prev.filter((c) => c.id !== selectedCustomer.id));
			setSelectedCustomer(null);
			setShowDeleteConfirm(false);
			toast({ type: "success", title: t.customers.customerDeleted });
		} catch (e) {
			toast({ type: "error", title: (e as Error).message });
		} finally {
			setDeleting(false);
		}
	}

	if (loading) {
		return (
			<div className="sf-flex-col sf-gap-xl sf-animate-fade">
				<div>
					<div className="sf-skeleton sf-skeleton-title" />
					<div className="sf-skeleton sf-skeleton-subtitle" />
				</div>
				<div className="sf-stats-grid">
					{Array.from({ length: 4 }).map((_, i) => (
						<SkeletonCard key={i} />
					))}
				</div>
				<SkeletonTable rows={6} />
			</div>
		);
	}

	return (
		<PageTransition className="sf-flex-col sf-gap-xl">
			{/* Header */}
			<div className="sf-page-header">
				<div>
					<h1 className="sf-page-title">{t.customers.title}</h1>
					<p className="sf-page-subtitle">
						{totalCustomers} {t.customers.title.toLowerCase()}
					</p>
				</div>
				<button
					className="sf-btn sf-btn-ghost"
					onClick={() => exportCustomersCSV()}
					title="Export CSV"
				>
					<Download size={16} />
				</button>
			</div>

			{/* Stats */}
			<div className="sf-stats-grid">
				{[
					{
						label: t.customers.totalCustomers,
						value: String(totalCustomers),
						variant: "brand",
					},
					{
						label: t.customers.totalOrders,
						value: String(totalOrdersCount),
						variant: "success",
					},
					{
						label: t.customers.totalSpent,
						value: formatCurrency(totalSpent),
						variant: "warning",
					},
					{
						label: t.customers.avgOrder,
						value: formatCurrency(
							totalOrdersCount > 0
								? Math.round(totalSpent / totalOrdersCount)
								: 0,
						),
						variant: "brand",
					},
				].map((s, i) => (
					<div
						key={s.label}
						className={`sf-card sf-stat sf-stat-${s.variant} sf-animate-in sf-stagger-${i + 1}`}
					>
						<p className="sf-stat-label">{s.label}</p>
						<p className="sf-stat-value sf-text-tabular">{s.value}</p>
					</div>
				))}
			</div>

			{/* Search */}
			<div className="sf-search-wrap">
				<Search size={16} className="sf-search-icon" />
				<input
					className="sf-input sf-input--icon-start"
					placeholder={t.customers.searchCustomers}
					value={search}
					onChange={(e) => setSearch(e.target.value)}
				/>
			</div>

			{/* Segment Tabs */}
			<div className="sf-segment-pills">
				{(
					[
						{ key: "all", label: t.common.all, count: enriched.length },
						{
							key: "vip",
							label: t.customers.vip,
							count: enriched.filter(
								(c) => c.totalSpent >= 10000 && c.riskLevel !== "high",
							).length,
						},
						{
							key: "at_risk",
							label: t.customers.atRisk,
							count: enriched.filter((c) => c.riskLevel === "high").length,
						},
						{
							key: "new",
							label: t.customers.newCustomers,
							count: enriched.filter((c) => c.ordersCount <= 1).length,
						},
						{
							key: "blocked",
							label: t.customers.blockedTab,
							count: enriched.filter((c) => c.is_blocked).length,
						},
					] as const
				).map((tab) => (
					<button
						key={tab.key}
						onClick={() => setSegment(tab.key)}
						className={`sf-segment-pill ${segment === tab.key ? "sf-segment-pill--active" : ""}`}
					>
						{tab.label} ({tab.count})
					</button>
				))}
			</div>

			{/* Empty */}
			{customers.length === 0 ? (
				<div className="sf-card sf-empty">
					<Users size={48} className="sf-text-tertiary sf-mb-md" />
					<h3 className="sf-text-lg sf-font-semibold sf-mb-sm">
						{t.customers.noCustomers}
					</h3>
					<p className="sf-text-secondary" style={{ maxWidth: 400 }}>
						{t.customers.noCustomersDesc}
					</p>
				</div>
			) : isMobile ? (
				/* Mobile: Cards */
				<div className="sf-flex-col sf-gap-md">
					{filtered.map((c) => (
						<div
							key={c.id}
							className="sf-card sf-card-hover sf-p-sm sf-cursor-pointer"
							onClick={() => selectCustomer(c)}
						>
							<div className="sf-flex-between sf-mb-sm">
								<span className="sf-font-semibold sf-text-sm">
									{c.name || "—"}
								</span>
								<div className="sf-flex sf-gap-sm">
									<span
										className={`sf-risk-badge ${
											c.riskLevel === "blocked"
												? "sf-risk-badge--blocked"
												: c.riskLevel === "high"
													? "sf-risk-badge--high"
													: c.riskLevel === "medium"
														? "sf-risk-badge--medium"
														: c.riskLevel === "new"
															? "sf-risk-badge--new"
															: "sf-risk-badge--low"
										}`}
									>
										<span
											title={c.riskLevel}
											aria-label={c.riskLevel}
											aria-hidden="true"
										>
											{c.riskLevel === "blocked"
												? "🚫"
												: c.riskLevel === "high"
													? "🔴"
													: c.riskLevel === "medium"
														? "🟡"
														: c.riskLevel === "new"
															? "🆕"
															: "🟢"}
										</span>
										<span className="sr-only">{c.riskLevel}</span>
									</span>
									<span className="sf-badge sf-badge-brand">
										{c.ordersCount} {t.customers.ordersCount.toLowerCase()}
									</span>
								</div>
							</div>
							<p className="sf-text-xs-tertiary sf-mb-sm" dir="ltr">
								{c.phone || "—"}
							</p>
							<p className="sf-text-xs-tertiary">
								{c.wilaya ? getWilayaName(c.wilaya, locale) : ""}
								{c.commune ? `, ${c.commune}` : ""}
							</p>
							<div className="sf-flex-between sf-mt-sm">
								<span className="sf-text-xs-secondary">
									<DollarSign size={12} className="sf-inline sf-align-middle" />{" "}
									{formatCurrency(c.totalSpent)}
								</span>
								{c.lastOrder && (
									<span className="sf-text-xs-tertiary">
										{formatTimeAgo(c.lastOrder)}
									</span>
								)}
							</div>
						</div>
					))}
				</div>
			) : (
				/* Desktop: Table */
				<div className="sf-card" style={{ padding: 0 }}>
					<div className="sf-table-wrap">
						<table className="sf-table">
							<thead>
								<tr>
									<th>{t.customers.name}</th>
									<th>{t.customers.risk}</th>
									<th>{t.customers.phone}</th>
									<th>{t.customers.location}</th>
									<th className="sf-text-center">{t.customers.ordersCount}</th>
									<th className="sf-text-end">{t.customers.spent}</th>
									<th>{t.customers.lastOrder}</th>
								</tr>
							</thead>
							<tbody>
								{filtered.map((c) => (
									<tr
										key={c.id}
										onClick={() => selectCustomer(c)}
										className="sf-cursor-pointer"
									>
										<td className="sf-font-medium">{c.name || "—"}</td>
										<td>
											<span
												className={`sf-risk-badge ${
													c.riskLevel === "blocked"
														? "sf-risk-badge--blocked"
														: c.riskLevel === "high"
															? "sf-risk-badge--high"
															: c.riskLevel === "medium"
																? "sf-risk-badge--medium"
																: c.riskLevel === "new"
																	? "sf-risk-badge--new"
																	: "sf-risk-badge--low"
												}`}
											>
												{c.riskLevel === "blocked"
													? "🚫"
													: c.riskLevel === "high"
														? "🔴"
														: c.riskLevel === "medium"
															? "🟡"
															: c.riskLevel === "new"
																? "🆕"
																: "🟢"}{" "}
												{c.riskLevel === "new"
													? t.customers.newCustomers
													: c.riskLevel}
											</span>
										</td>
										<td className="sf-text-mono sf-text-xs" dir="ltr">
											{c.phone || "—"}
										</td>
										<td className="sf-text-secondary">
											{c.wilaya ? getWilayaName(c.wilaya, locale) : "—"}
											{c.commune ? `, ${c.commune}` : ""}
										</td>
										<td className="sf-text-center">
											<span className="sf-badge sf-badge-brand">
												{c.ordersCount}
											</span>
										</td>
										<td className="sf-text-end sf-font-semibold sf-text-tabular">
											{formatCurrency(c.totalSpent)}
										</td>
										<td className="sf-text-xs-tertiary">
											{c.lastOrder ? formatTimeAgo(c.lastOrder) : "—"}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
			)}

			{/* Customer Detail Slide-Out */}
			{selectedCustomer && (
				<div
					className="sf-slideout-backdrop"
					onClick={() => setSelectedCustomer(null)}
					role="presentation"
				>
					<div
						ref={customerPanelRef}
						className="sf-slideout"
						onClick={(e) => e.stopPropagation()}
						role="dialog"
						aria-modal="true"
						aria-label="Customer details"
					>
						<div className="sf-slideout__header">
							<div>
								<h2 className="sf-heading-sm">
									{selectedCustomer.name || "—"}
								</h2>
								{selectedCustomer.is_blocked && (
									<span className="sf-risk-badge sf-risk-badge--blocked">
										{t.customers.blocked}
									</span>
								)}
							</div>
							<button
								onClick={() => setSelectedCustomer(null)}
								aria-label={t.common.closePanel}
								className="sf-btn-ghost sf-p-0"
								style={{ background: "none", border: "none" }}
							>
								<X size={20} />
							</button>
						</div>

						<div className="sf-slideout__body">
							{/* Contact Info */}
							<div className="sf-slideout__section">
								<h4 className="sf-section-label">{t.customers.contactInfo}</h4>
								<div className="sf-flex-col sf-gap-sm">
									{selectedCustomer.phone && (
										<a
											href={`tel:${selectedCustomer.phone}`}
											className="sf-contact-link"
											dir="ltr"
										>
											<Phone size={14} /> {selectedCustomer.phone}
										</a>
									)}
									{selectedCustomer.wilaya && (
										<span className="sf-contact-meta">
											<MapPin size={14} /> {getWilayaName(selectedCustomer.wilaya, locale)}
											{selectedCustomer.commune
												? `, ${selectedCustomer.commune}`
												: ""}
										</span>
									)}
									{selectedCustomer.address && (
										<span className="sf-text-xs-tertiary">
											{selectedCustomer.address}
										</span>
									)}
								</div>
							</div>

							{/* Stats Grid */}
							<div className="sf-slideout__section">
								<h4 className="sf-section-label">
									{t.customers.customerStats}
								</h4>
								{loadingDetail ? (
									<div className="sf-flex-center sf-p-md">
										<Loader2
											size={20}
											className="sf-animate-spin sf-text-tertiary"
										/>
									</div>
								) : (
									<div className="sf-grid-2 sf-gap-sm">
										<div className="sf-card sf-stat-card-sm">
											<p className="sf-stat-label-sm">
												{t.customers.totalOrders}
											</p>
											<p className="sf-stat-value-sm">
												{selectedCustomer.ordersCount}
											</p>
										</div>
										<div className="sf-card sf-stat-card-sm">
											<p className="sf-stat-label-sm">
												{t.customers.totalSpent}
											</p>
											<p className="sf-stat-value-sm sf-text-tabular">
												{formatCurrency(selectedCustomer.totalSpent)}
											</p>
										</div>
										<div className="sf-card sf-stat-card-sm">
											<p className="sf-stat-label-sm">{t.customers.avgOrder}</p>
											<p className="sf-stat-value-sm sf-text-tabular">
												{formatCurrency(selectedCustomer.avgOrderValue)}
											</p>
										</div>
										<div className="sf-card sf-stat-card-sm">
											<p className="sf-stat-label-sm">
												{t.customers.confirmRate}
											</p>
											<p
												className={`sf-stat-value-sm ${
													selectedCustomer.confirmationRate >= 85
														? "sf-text-success"
														: selectedCustomer.confirmationRate >= 70
															? "sf-text-warning"
															: "sf-text-danger"
												}`}
											>
												{selectedCustomer.confirmationRate}%
											</p>
										</div>
									</div>
								)}
							</div>

							{/* Recent Orders */}
							<div className="sf-slideout__section">
								<h4 className="sf-section-label">{t.customers.recentOrders}</h4>
								{selectedCustomer.custOrders &&
								selectedCustomer.custOrders.length > 0 ? (
									<div className="sf-flex-col sf-gap-sm">
										{selectedCustomer.custOrders
											.slice(0, 10)
											.map((order: Order) => (
												<div key={order.id} className="sf-order-row">
													<div>
														<span className="sf-text-mono sf-text-xs sf-font-medium">
															{order.order_number}
														</span>
														<p className="sf-text-xs-tertiary sf-mt-xs">
															{formatTimeAgo(order.created_at)}
														</p>
													</div>
													<div className="sf-text-end">
														<span className="sf-font-semibold sf-text-sm sf-text-tabular">
															{formatCurrency(Number(order.total_price))}
														</span>
														<p
															className={`sf-text-xs sf-mt-xs sf-text-caps ${
																order.status === "delivered"
																	? "sf-status-delivered"
																	: order.status === "returned" ||
																			order.status === "cancelled"
																		? "sf-status-returned"
																		: "sf-status-pending"
															}`}
														>
															{t.status[order.status as keyof typeof t.status] || order.status}
														</p>
													</div>
												</div>
											))}
									</div>
								) : (
									<p className="sf-text-sm-tertiary">{t.customers.noOrders}</p>
								)}
							</div>

							{/* Actions */}
							<div className="sf-slideout__section sf-flex-col sf-gap-sm">
								{editing ? (
									<>
										<div className="sf-flex-col sf-gap-sm">
											<div>
												<label className="sf-label">{t.customers.name}</label>
												<input
													className="sf-input"
													value={editForm.name}
													onChange={(e) =>
														setEditForm((f) => ({
															...f,
															name: e.target.value,
														}))
													}
												/>
											</div>
											<div>
												<label className="sf-label">{t.customers.phone}</label>
												<input
													className="sf-input"
													value={editForm.phone}
													onChange={(e) =>
														setEditForm((f) => ({
															...f,
															phone: e.target.value,
														}))
													}
													dir="ltr"
												/>
											</div>
											<div>
												<label className="sf-label">
													{t.customers.location}
												</label>
												<input
													className="sf-input"
													value={editForm.wilaya}
													onChange={(e) =>
														setEditForm((f) => ({
															...f,
															wilaya: e.target.value,
														}))
													}
													placeholder="Wilaya"
												/>
												<input
													className="sf-input sf-mt-sm"
													value={editForm.commune}
													onChange={(e) =>
														setEditForm((f) => ({
															...f,
															commune: e.target.value,
														}))
													}
													placeholder="Commune"
												/>
											</div>
											<div>
												<label className="sf-label">
													{t.customers.address}
												</label>
												<input
													className="sf-input"
													value={editForm.address}
													onChange={(e) =>
														setEditForm((f) => ({
															...f,
															address: e.target.value,
														}))
													}
												/>
											</div>
										</div>
										<div className="sf-flex sf-gap-sm sf-mt-sm">
											<button
												className="sf-btn sf-btn-primary sf-flex-1"
												disabled={saving}
												onClick={saveEdits}
											>
												{saving ? t.common.loading : t.common.save}
											</button>
											<button
												className="sf-btn sf-btn-ghost sf-flex-1"
												onClick={() => setEditing(false)}
											>
												{t.common.cancel}
											</button>
										</div>
									</>
								) : (
									<>
										{selectedCustomer.phone && (
											<>
												<a
													href={`https://wa.me/${selectedCustomer.phone.replace(/[^0-9]/g, "").replace(/^0/, "213")}`}
													target="_blank"
													rel="noopener noreferrer"
													className="sf-btn sf-btn-ghost sf-btn-full"
													style={{
														color: "#25D366",
													}}
												>
													<MessageCircle size={16} /> WhatsApp
												</a>
												<a
													href={`tel:${selectedCustomer.phone}`}
													className="sf-btn sf-btn-ghost sf-btn-full"
												>
													<Phone size={16} /> {t.customers.call}
												</a>
											</>
										)}
										<button
											className="sf-btn sf-btn-ghost sf-btn-full"
											onClick={startEditing}
										>
											<TrendingUp size={16} /> {t.customers.editCustomer}
										</button>
										<button
											className={`sf-btn ${selectedCustomer.is_blocked ? "sf-btn-ghost" : "sf-btn-danger"} sf-btn-full`}
											disabled={blocking}
											onClick={() => toggleBlock(selectedCustomer)}
										>
											<Ban size={16} />{" "}
											{blocking
												? t.common.loading
												: selectedCustomer.is_blocked
													? t.customers.unblock
													: t.customers.block}
										</button>
										{showDeleteConfirm ? (
											<div className="sf-confirm-box">
												<p className="sf-text-sm-secondary sf-mb-sm">
													{t.customers.deleteCustomerWarning}
												</p>
												<div className="sf-flex sf-gap-sm">
													<button
														className="sf-btn sf-btn-danger sf-flex-1"
														disabled={deleting}
														onClick={confirmDeleteCustomer}
													>
														{deleting ? t.common.loading : t.common.delete}
													</button>
													<button
														className="sf-btn sf-btn-ghost sf-flex-1"
														onClick={() => setShowDeleteConfirm(false)}
													>
														{t.common.cancel}
													</button>
												</div>
											</div>
										) : (
											<button
												className="sf-btn sf-btn-ghost sf-btn-full sf-text-danger"
												onClick={() => setShowDeleteConfirm(true)}
											>
												<X size={16} /> {t.common.delete}
											</button>
										)}
									</>
								)}
							</div>
						</div>
					</div>
				</div>
			)}
		</PageTransition>
	);
}
