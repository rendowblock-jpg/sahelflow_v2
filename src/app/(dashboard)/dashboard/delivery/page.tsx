"use client";

import { useState, useEffect, useCallback } from "react";
import { Truck, Loader2, Download, X, Trash2, CheckCircle2, AlertCircle, TrendingUp } from "lucide-react";
import { getDeliveries, deleteDelivery } from "@/lib/data/service";
import {
	exportDeliveryBulkCSV,
	exportMaystroCSV,
	exportZRExpressCSV,
} from "@/lib/data/export";
import { useI18n } from "@/lib/i18n";
import { useLayout } from "@/components/providers/Providers";
import { useToast } from "@/components/dashboard/ToastProvider";
import { getWilayaName } from "@/lib/data/wilayas";
import { SearchInput } from "@/components/dashboard/SearchInput";
import { AnimatedStatCard } from "@/components/ui/AnimatedStatCard";
import { PageTransition } from "@/components/ui/motion";
import { SkeletonCard, SkeletonTable } from "@/components/ui/Skeleton";
import type { Delivery, Order, Customer } from "@/types/database";

interface DeliveryWithOrder extends Delivery {
	order?: (Order & { customer?: Customer | null }) | null;
	updated_at?: string;
}

interface ProviderInfo {
	id: string;
	name: string;
	logo: string;
	isSkeleton: boolean;
}

export default function DeliveryPage() {
	const { t, formatTimeAgo, locale } = useI18n();
	const { isMobile } = useLayout();
	const { toast } = useToast();
	const PAGE_SIZE = 50;
	const [deliveries, setDeliveries] = useState<DeliveryWithOrder[]>([]);
	const [loading, setLoading] = useState(true);
	const [search, setSearch] = useState("");
	const [filter, setFilter] = useState<
		"all" | "pending" | "picked_up" | "in_transit" | "delivered" | "returned"
	>("all");
	const [providerFilter, setProviderFilter] = useState<
		"all" | "yalidine" | "manual"
	>("all");
	const [exporting, setExporting] = useState(false);
	const [creatingShipment, setCreatingShipment] = useState<string | null>(null);
	const [page, setPage] = useState(0);
	const [totalCount, setTotalCount] = useState(0);
	const [hasMore, setHasMore] = useState(true);
	const [shipmentModal, setShipmentModal] = useState<{
		orderId: string;
		orderNumber?: string;
	} | null>(null);
	const [providers, setProviders] = useState<ProviderInfo[]>([]);
	const [selectedProvider, setSelectedProvider] = useState("yalidine");
	const [estimatedCost, setEstimatedCost] = useState<number | null>(null);
	const [costLoading, setCostLoading] = useState(false);
	const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
	const [deleting, setDeleting] = useState(false);

	const loadData = useCallback(async () => {
		try {
			setLoading(true);
			const result = await getDeliveries({
				limit: PAGE_SIZE,
				offset: page * PAGE_SIZE,
			});
			if (page === 0) {
				setDeliveries(result.data as DeliveryWithOrder[]);
			} else {
				setDeliveries((prev) => [
					...prev,
					...(result.data as DeliveryWithOrder[]),
				]);
			}
			setTotalCount(result.total);
			setHasMore(result.data.length === PAGE_SIZE);
		} catch {
			toast({
				type: "error",
				title: t.delivery?.loadFailed || t.common.error,
			});
		} finally {
			setLoading(false);
		}
	}, [page, toast, t.delivery?.loadFailed, t.common.error]);

	useEffect(() => {
		loadData();
	}, [loadData]);

	useEffect(() => {
		fetch("/api/delivery/create-shipment")
			.then((r) => r.json())
			.then((data) => setProviders(data.providers || []))
			.catch(() => {});
	}, []);

	async function handleCreateShipment(orderId: string) {
		setCreatingShipment(orderId);
		try {
			const res = await fetch("/api/delivery/create-shipment", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ orderId, provider: selectedProvider }),
			});
			const data = await res.json();
			if (!res.ok) {
				toast({
					type: "error",
					title: data.error || t.delivery.shipmentCreateFailed,
				});
			} else {
				toast({
					type: "success",
					title: `${t.delivery.shipmentCreated} ${t.delivery.trackingLabel}: ${data.trackingId}`,
				});
				setShipmentModal(null);
				loadData();
			}
		} catch (e) {
			toast({ type: "error", title: (e as Error).message });
		} finally {
			setCreatingShipment(null);
		}
	}

	async function fetchEstimatedCost(providerId: string, orderId: string) {
		setCostLoading(true);
		setEstimatedCost(null);
		try {
			const res = await fetch("/api/delivery/estimate-cost", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ orderId, provider: providerId }),
			});
			const data = await res.json();
			if (res.ok && data.cost) {
				setEstimatedCost(data.cost);
			}
		} catch {
			/* non-blocking */
		} finally {
			setCostLoading(false);
		}
	}

	function openShipmentModal(orderId: string, orderNumber?: string) {
		setSelectedProvider("yalidine");
		setEstimatedCost(null);
		setShipmentModal({ orderId, orderNumber });
	}

	function handleProviderSelect(providerId: string) {
		setSelectedProvider(providerId);
		if (shipmentModal && !PROVIDERS_WITHOUT_API.has(providerId)) {
			fetchEstimatedCost(providerId, shipmentModal.orderId);
		} else {
			setEstimatedCost(null);
		}
	}

	async function handleBulkExport() {
		setExporting(true);
		try {
			const count = await exportDeliveryBulkCSV();
			toast({
				type: "success",
				title: `${count} ${t.delivery.ordersExported}`,
			});
		} catch (e) {
			toast({ type: "error", title: (e as Error).message });
		} finally {
			setExporting(false);
		}
	}

	// Build set of skeleton providers from API-driven list so the shipment modal
	// disables the "Create" button for providers without a live API integration.
	const PROVIDERS_WITHOUT_API = new Set(
		providers.filter((p) => p.isSkeleton).map((p) => p.id),
	);

	if (loading) {
		return (
			<div className="sf-flex-col sf-gap-xl sf-animate-fade">
				<div>
					<div className="sf-skeleton sf-orders-skeleton-title" />
					<div className="sf-skeleton sf-orders-skeleton-subtitle" />
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

	const statusColors: Record<string, string> = {
		pending: "sf-badge-warning",
		picked_up: "sf-badge-brand",
		in_transit: "sf-badge-brand",
		delivered: "sf-badge-success",
		returned: "sf-badge-danger",
	};

	const today = new Date().toISOString().split("T")[0];
	const inTransit = deliveries.filter(
		(d) => d.status === "in_transit" || d.status === "picked_up",
	).length;
	const deliveredToday = deliveries.filter(
		(d) => d.status === "delivered" && d.updated_at?.startsWith(today),
	).length;
	const returnedToday = deliveries.filter(
		(d) => d.status === "returned" && d.updated_at?.startsWith(today),
	).length;
	const totalCompleted = deliveries.filter(
		(d) => d.status === "delivered" || d.status === "returned",
	).length;
	const successRate =
		totalCompleted > 0
			? Math.round(
					(deliveries.filter((d) => d.status === "delivered").length /
						totalCompleted) *
						100,
				)
			: 0;

	const filtered = deliveries
		.filter((d) => filter === "all" || d.status === filter)
		.filter((d) => providerFilter === "all" || d.provider === providerFilter)
		.filter((d) => {
			if (!search) return true;
			const q = search.toLowerCase();
			return (
				d.tracking_number?.toLowerCase().includes(q) ||
				d.provider?.toLowerCase().includes(q) ||
				d.order?.order_number?.toLowerCase().includes(q) ||
				d.order?.customer?.name?.toLowerCase().includes(q) ||
				d.order?.wilaya?.toLowerCase().includes(q)
			);
		});

	return (
		<PageTransition className="sf-flex-col sf-gap-xl">
			<div className="sf-page-header">
				<div>
					<h1 className="sf-page-title">{t.delivery.title}</h1>
					<p className="sf-page-subtitle">{t.delivery.trackShipments}</p>
				</div>
				<button
					className="sf-btn sf-btn-primary"
					onClick={handleBulkExport}
					disabled={exporting}
				>
					{exporting ? (
						<Loader2 size={16} className="sf-animate-spin" />
					) : (
						<Download size={16} />
					)}
					{t.delivery.bulkExport}
				</button>
				<button
					className="sf-btn sf-btn-ghost"
					onClick={async () => {
						setExporting(true);
						try {
							const n = await exportMaystroCSV();
							toast({
								type: "success",
								title: `${t.delivery.maystroCsv}: ${t.delivery.exportedOrdersShort.replace("{n}", String(n))}`,
							});
						} catch (e) {
							toast({ type: "error", title: (e as Error).message });
						} finally {
							setExporting(false);
						}
					}}
					disabled={exporting}
				>
					<Download size={14} /> {t.delivery.maystroCsv}
				</button>
				<button
					className="sf-btn sf-btn-ghost"
					onClick={async () => {
						setExporting(true);
						try {
							const n = await exportZRExpressCSV();
							toast({
								type: "success",
								title: `${t.delivery.zrexpressCsv}: ${t.delivery.exportedOrdersShort.replace("{n}", String(n))}`,
							});
						} catch (e) {
							toast({ type: "error", title: (e as Error).message });
						} finally {
							setExporting(false);
						}
					}}
					disabled={exporting}
				>
					<Download size={14} /> {t.delivery.zrexpressCsv}
				</button>
			</div>

			{/* Stats */}
			<div className="sf-stats-grid">
				<AnimatedStatCard
					label={t.delivery.inTransit}
					value={String(inTransit)}
					variant="brand"
					icon={Truck}
					delay={0}
				/>
				<AnimatedStatCard
					label={t.delivery.deliveredToday}
					value={String(deliveredToday)}
					variant="success"
					icon={CheckCircle2}
					delay={60}
				/>
				<AnimatedStatCard
					label={t.delivery.returnedToday}
					value={String(returnedToday)}
					variant="danger"
					icon={AlertCircle}
					delay={120}
				/>
				<AnimatedStatCard
					label={t.delivery.successRate}
					value={`${successRate}%`}
					variant={successRate >= 80 ? "success" : "warning"}
					icon={TrendingUp}
					delay={180}
				/>
			</div>

			{/* Search + Filters */}
			<div className="sf-flex sf-gap-sm sf-items-center sf-flex-wrap">
				<SearchInput
					placeholder={t.delivery.searchDeliveries}
					value={search}
					onChange={setSearch}
					flex={isMobile ? "1" : "0 0 280px"}
				/>
				<div className="sf-filter-group">
					{(
						["all", "pending", "in_transit", "delivered", "returned"] as const
					).map((s) => (
						<button
							key={s}
							onClick={() => setFilter(s)}
							className={`sf-range-filter ${filter === s ? "is-active" : ""}`}
						>
							{s === "all"
								? t.common.all
								: t.delivery[s as keyof typeof t.delivery] || s}
						</button>
					))}
					<span className="sf-filter-divider" />
					{(["all", "yalidine", "manual"] as const).map((p) => (
						<button
							key={p}
							onClick={() => setProviderFilter(p)}
							className={`sf-range-filter ${providerFilter === p ? "is-active" : ""}`}
						>
							{p === "all"
								? t.delivery.allProviders
								: p.charAt(0).toUpperCase() + p.slice(1)}
						</button>
					))}
				</div>
			</div>

			{deliveries.length === 0 ? (
				<div className="sf-card sf-flex-center sf-flex-col sf-delivery-empty-state">
					<Truck size={48} className="sf-delivery-empty-icon" />
					<h3 className="sf-delivery-empty-title">{t.delivery.noDeliveries}</h3>
					<p className="sf-delivery-empty-desc">
						{t.delivery.noDeliveriesDesc}
					</p>
				</div>
			) : filtered.length === 0 ? (
				<div className="sf-card sf-text-center sf-p-xl">
					<p className="sf-empty-title">{t.common.noResults}</p>
				</div>
			) : isMobile ? (
				<div className="sf-flex-col sf-gap-md">
					{filtered.map((d) => (
						<div key={d.id} className="sf-card sf-product-card-padded">
							<div className="sf-flex-between sf-mb-xs">
								<span className="sf-td-mono sf-font-semibold">
									{d.tracking_number || "—"}
								</span>
								<span
									className={`sf-badge ${statusColors[d.status] || "sf-badge-brand"}`}
								>
									{t.delivery[d.status as keyof typeof t.delivery] || d.status}
								</span>
							</div>
							<p className="sf-text-xs sf-font-medium">
								{d.order?.order_number || "—"} •{" "}
								{d.order?.customer?.name || "—"}
							</p>
							<p className="sf-text-xs-secondary">
								{d.order?.wilaya ? getWilayaName(d.order.wilaya, locale) : ""} •{" "}
								{d.provider || "—"}
							</p>
							{!d.tracking_number && d.order?.id && (
								<button
									onClick={() =>
										openShipmentModal(d.order!.id, d.order?.order_number)
									}
									className="sf-delivery-create-btn"
								>
									🚚 {t.delivery.createShipment}
								</button>
							)}
							<p className="sf-text-xs-tertiary sf-mt-xs">
								{d.created_at ? formatTimeAgo(d.created_at) : ""}
							</p>
						</div>
					))}
				</div>
			) : (
				<div className="sf-card sf-card-p-0">
					<div className="sf-table-wrap">
						<table className="sf-table">
							<thead>
								<tr>
									<th>{t.delivery.trackingNumber}</th>
									<th>{t.dashboard.orderId}</th>
									<th>{t.dashboard.customer}</th>
									<th>{t.dashboard.wilaya}</th>
									<th>{t.delivery.provider}</th>
									<th>{t.common.status}</th>
									<th>{t.delivery.date}</th>
									<th></th>
								</tr>
							</thead>
							<tbody>
								{filtered.map((d) => (
									<tr key={d.id}>
										<td className="sf-td-mono">{d.tracking_number || "—"}</td>
										<td className="sf-td-mono">
											{d.order?.order_number || "—"}
										</td>
										<td>{d.order?.customer?.name || "—"}</td>
										<td className="sf-text-secondary">
											{d.order?.wilaya
												? getWilayaName(d.order.wilaya, locale)
												: "—"}
										</td>
										<td className="sf-text-secondary">{d.provider || "—"}</td>
										<td>
											<span
												className={`sf-badge ${statusColors[d.status] || ""}`}
											>
												{t.delivery[d.status as keyof typeof t.delivery] ||
													d.status}
											</span>
										</td>
										<td className="sf-text-xs-tertiary">
											{d.created_at ? formatTimeAgo(d.created_at) : "—"}
										</td>
										<td>
											<button
												className="sf-btn sf-btn-ghost sf-btn-compress-sm sf-text-danger"
												onClick={() => setDeleteTarget(d.id)}
											>
												<Trash2 size={14} />
											</button>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
			)}

			{/* Load More */}
			{hasMore && !loading && deliveries.length > 0 && (
				<div className="sf-text-center sf-p-lg">
					<button
						className="sf-btn sf-btn-ghost"
						onClick={() => setPage((p) => p + 1)}
					>
						{t.common.loadMore} ({deliveries.length} / {totalCount})
					</button>
				</div>
			)}

			{/* Shipment Provider Selection Modal */}
			{shipmentModal && (
				<div
					className="sf-delivery-modal-backdrop sf-animate-fade"
					style={{ animationDuration: "0.25s" }}
				>
					<div
						className="sf-delivery-modal sf-animate-fade"
						style={{
							animationDuration: "0.2s",
							transform: "scale(1)",
							transition: "transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
						}}
					>
						<div className="sf-delivery-modal__header">
							<h2 className="sf-delivery-modal__title">
								{t.delivery.createShipment}
							</h2>
							<button
								onClick={() => setShipmentModal(null)}
								className="sf-delivery-modal__close"
							>
								<X size={20} />
							</button>
						</div>

						{shipmentModal.orderNumber && (
							<p className="sf-delivery-modal__order">
								{t.delivery.orderLabel}: {shipmentModal.orderNumber}
							</p>
						)}

						<label className="sf-delivery-modal__label">
							{t.delivery.provider}
						</label>
						<div className="sf-delivery-provider-list">
							{providers.map((p) => {
								const isActive = selectedProvider === p.id;
								return (
									<button
										key={p.id}
										onClick={() => handleProviderSelect(p.id)}
										className={`sf-delivery-provider ${isActive ? "is-active" : ""} ${p.isSkeleton ? "is-disabled" : ""} sf-card-interactive`}
										style={{
											transition: "all 0.2s ease",
											border: isActive
												? "2px solid var(--sf-accent-solid)"
												: "1px solid var(--sf-border-subtle)",
											boxShadow: isActive
												? "0 0 12px var(--sf-accent-muted)"
												: "none",
											transform: isActive ? "translateY(-2px)" : "none",
										}}
									>
										<span className="sf-delivery-provider__logo">{p.logo}</span>
										<div className="sf-delivery-provider__content">
											<p className="sf-delivery-provider__name">{p.name}</p>
											{p.isSkeleton && (
												<p className="sf-delivery-provider__hint">
													{t.delivery.apiComingSoonUseCsv}
												</p>
											)}
										</div>
										{isActive && !p.isSkeleton && (
											<span
												className="sf-delivery-provider__dot"
												style={{ background: "var(--sf-accent-solid)" }}
											/>
										)}
									</button>
								);
							})}
						</div>

						{costLoading && (
							<p
								className="sf-delivery-modal__meta sf-animate-fade"
								style={{ animationDuration: "0.2s" }}
							>
								<Loader2
									size={12}
									className="sf-animate-spin sf-align-middle"
								/>{" "}
								{t.delivery.estimatingCost}
							</p>
						)}
						{estimatedCost !== null && !costLoading && (
							<p
								className="sf-delivery-modal__estimate sf-animate-fade"
								style={{ animationDuration: "0.2s" }}
							>
								{t.delivery.estimatedCost}:{" "}
								<span className="sf-delivery-modal__estimate-value">
									{estimatedCost.toLocaleString(
										locale === "ar"
											? "ar-DZ"
											: locale === "en"
												? "en-US"
												: "fr-DZ",
									)}{" "}
									DA
								</span>
							</p>
						)}

						<button
							className="sf-btn sf-btn-primary sf-delivery-modal__submit"
							onClick={() => handleCreateShipment(shipmentModal.orderId)}
							disabled={
								!!creatingShipment ||
								PROVIDERS_WITHOUT_API.has(selectedProvider)
							}
						>
							{creatingShipment ? (
								<>
									<Loader2 size={16} className="sf-animate-spin" />{" "}
									{t.delivery.creatingShipment}
								</>
							) : (
								<>
									<Truck size={16} /> {t.delivery.createShipment}
								</>
							)}
						</button>
					</div>
				</div>
			)}

			{deleteTarget && (
				<div className="sf-modal-overlay" onClick={() => setDeleteTarget(null)}>
					<div
						className="sf-modal-confirm"
						onClick={(e) => e.stopPropagation()}
					>
						<h3 className="sf-modal-title-sm">{t.common.confirmDelete}</h3>
						<p className="sf-modal-desc">{t.delivery.deleteWarning}</p>
						<div className="sf-modal-actions">
							<button
								className="sf-btn sf-btn-ghost"
								onClick={() => setDeleteTarget(null)}
							>
								{t.common.cancel}
							</button>
							<button
								className="sf-btn-danger"
								disabled={deleting}
								onClick={async () => {
									setDeleting(true);
									try {
										await deleteDelivery(deleteTarget);
										setDeleteTarget(null);
										loadData();
										toast({ type: "success", title: t.common.deleted });
									} catch (e) {
										toast({ type: "error", title: (e as Error).message });
									} finally {
										setDeleting(false);
									}
								}}
							>
								{deleting ? t.common.loading : t.common.delete}
							</button>
						</div>
					</div>
				</div>
			)}
		</PageTransition>
	);
}
