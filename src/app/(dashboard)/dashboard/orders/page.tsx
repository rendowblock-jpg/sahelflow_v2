"use client";

import { useState, useEffect, useCallback } from "react";
import {
	Plus,
	Loader2,
	X,
	Search,
	Download,
	Sparkles,
	MessageCircle,
	Phone,
	MapPin,
	Clock,
	PackageCheck,
	RotateCcw,
} from "lucide-react";
import {
	getOrders,
	createOrder,
	updateOrderStatus,
	deleteOrder,
	findOrCreateCustomer,
	getShippingCostForWilaya,
	getWhatsAppTemplate,
	getProducts,
} from "@/lib/data/service";
import ReturnModal from "@/components/returns/ReturnModal";
import { exportOrdersCSV } from "@/lib/data/export";
import { createClient } from "@/lib/supabase/client";
import { WILAYA_NAMES } from "@/lib/data/wilayas";
import OrderSlideOut from "@/components/dashboard/orders/OrderSlideOut";
import { useI18n } from "@/lib/i18n";
import { useLayout } from "@/components/providers/Providers";
import { useToast } from "@/components/dashboard/ToastProvider";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { usePermissions } from "@/hooks/usePermissions";
import dynamic from "next/dynamic";
import { SkeletonCard, SkeletonTable } from "@/components/ui/Skeleton";
import { PageTransition } from "@/components/ui/motion";
import ConfirmationPanel from "@/components/dashboard/ConfirmationPanel";
import OrderTable from "@/components/dashboard/orders/OrderTable";
import OrderMobileCards from "@/components/dashboard/orders/OrderMobileCards";
import OrderStatsCards from "@/components/dashboard/orders/OrderStatsCards";
import type { Order, OrderStats } from "@/components/dashboard/orders/types";

const AIOrderImport = dynamic(
	() => import("@/components/orders/AIOrderImport"),
	{ ssr: false },
);

const STATUSES = [
	"all",
	"draft",
	"pending",
	"confirmed",
	"shipped",
	"delivered",
	"returned",
	"cancelled",
];

export default function OrdersPage() {
	const { t, formatCurrency } = useI18n();
	const { isMobile } = useLayout();
	const { toast } = useToast();
	const { hasPermission, canDeleteData, sellerId: activeSellerId } = usePermissions();
	const PAGE_SIZE = 50;
	const [orders, setOrders] = useState<Order[]>([]);
	const [loading, setLoading] = useState(true);
	const [filter, setFilter] = useState("all");
	const [search, setSearch] = useState("");
	const [showCreate, setShowCreate] = useState(false);
	const [showImport, setShowImport] = useState(false);
	const [saving, setSaving] = useState(false);
	const [page, setPage] = useState(0);
	const [totalCount, setTotalCount] = useState(0);
	const [hasMore, setHasMore] = useState(true);
	const [orderStats, setOrderStats] = useState<OrderStats>({
		total: 0,
		pending: 0,
		confirmed: 0,
		shipped: 0,
		delivered: 0,
		returned: 0,
		cancelled: 0,
		revenue: 0,
	});
	const [products, setProducts] = useState<
		Array<{
			id: string;
			name: string;
			price: number;
			cost_price?: number;
			stock?: number;
		}>
	>([]);
	const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
	const orderPanelRef = useFocusTrap(!!selectedOrder, () =>
		setSelectedOrder(null),
	);
	const [confirmOrder, setConfirmOrder] = useState<Order | null>(null);
	const [showReturnModal, setShowReturnModal] = useState<Order | null>(null);
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(
		null,
	);
	const [deleting, setDeleting] = useState(false);

	const [form, setForm] = useState<{
		customerName: string;
		phone: string;
		wilaya: string;
		commune: string;
		address: string;
		items: Array<{
			product_name: string;
			quantity: number;
			unit_price: number;
			product_id?: string;
		}>;
		deliveryCost: number;
		notes: string;
	}>({
		customerName: "",
		phone: "",
		wilaya: "",
		commune: "",
		address: "",
		items: [{ product_name: "", quantity: 1, unit_price: 0 }],
		deliveryCost: 0,
		notes: "",
	});
	const [whatsappTemplate, setWhatsappTemplate] = useState("");

	useEffect(() => {
		getWhatsAppTemplate()
			.then(setWhatsappTemplate)
			.catch((e) => toast({ type: "error", title: (e as Error).message }));
	}, [toast]);

	useEffect(() => {
		getProducts()
			.then((result) => setProducts(result.data as typeof products))
			.catch(() => {});
	}, []);

	async function handleWilayaChange(wilayaName: string) {
		setForm((f) => ({ ...f, wilaya: wilayaName }));
		if (wilayaName) {
			try {
				const rates = await getShippingCostForWilaya(wilayaName);
				setForm((f) => ({
					...f,
					wilaya: wilayaName,
					deliveryCost: rates.home,
				}));
			} catch (e) {
				toast({ type: "error", title: (e as Error).message });
			}
		}
	}

	const loadStats = useCallback(async () => {
		if (!activeSellerId) return;
		try {
			const supabase = createClient();
			const { data } = await supabase
				.from("orders")
				.select("status, total_price")
				.eq("seller_id", activeSellerId)
				.is("deleted_at", null);
			if (data) {
				const stats: OrderStats = {
					total: data.length,
					pending: 0,
					confirmed: 0,
					shipped: 0,
					delivered: 0,
					returned: 0,
					cancelled: 0,
					revenue: 0,
				};
				for (const o of data) {
					if (o.status === "pending") stats.pending++;
					if (o.status === "confirmed") stats.confirmed++;
					if (o.status === "shipped") stats.shipped++;
					if (o.status === "delivered") stats.delivered++;
					if (o.status === "returned") stats.returned++;
					if (o.status === "cancelled") stats.cancelled++;
					stats.revenue += Number(o.total_price || 0);
				}
				setOrderStats(stats);
			}
		} catch {
			/* stats are supplementary */
		}
	}, [activeSellerId]);

	const loadData = useCallback(async () => {
		try {
			setLoading(true);
			const status = filter === "all" ? undefined : filter;
			const result = await getOrders({
				status,
				limit: PAGE_SIZE,
				offset: page * PAGE_SIZE,
			});
			if (page === 0) {
				setOrders(result.data as Order[]);
			} else {
				setOrders((prev) => [...prev, ...(result.data as Order[])]);
			}
			setTotalCount(result.total);
			setHasMore(result.data.length === PAGE_SIZE);
		} catch (e) {
			toast({ type: "error", title: (e as Error).message });
		} finally {
			setLoading(false);
		}
	}, [filter, page, toast]);

	useEffect(() => {
		loadData();
	}, [loadData]);
	useEffect(() => {
		loadStats();
	}, [loadStats]);

	const handleFilterChange = (s: string) => {
		setFilter(s);
		setPage(0);
		setSelectedIds(new Set());
	};

	useEffect(() => {
		if (!activeSellerId) return;
		const supabase = createClient();
		const channel = supabase
			.channel("orders-realtime")
			.on(
				"postgres_changes",
				{
					event: "*",
					schema: "public",
					table: "orders",
					filter: `seller_id=eq.${activeSellerId}`,
				},
				() => {
					loadData();
				},
			)
			.subscribe();
		return () => {
			supabase.removeChannel(channel);
		};
	}, [loadData, activeSellerId]);

	const statusColor: Record<string, string> = {
		draft: "sf-badge-draft",
		pending: "sf-badge-warning",
		confirmed: "sf-badge-brand",
		shipped: "sf-badge-brand",
		delivered: "sf-badge-success",
		returned: "sf-badge-danger",
		cancelled: "sf-badge-danger",
		refused: "sf-badge-danger",
	};

	const translateStatus = (s: string) =>
		(t.status as Record<string, string>)[s] || s;

	const filtered = orders.filter((o) => {
		if (!search) return true;
		const q = search.toLowerCase();
		return (
			o.order_number?.toLowerCase().includes(q) ||
			o.customer?.name?.toLowerCase().includes(q) ||
			o.customer?.phone?.includes(q) ||
			o.wilaya?.toLowerCase().includes(q)
		);
	});

	async function handleCreate() {
		setSaving(true);
		try {
			const customer = await findOrCreateCustomer({
				name: form.customerName,
				phone: form.phone,
				wilaya: form.wilaya,
				commune: form.commune,
				address: form.address,
			});
			const totalItems = form.items.reduce(
				(s, i) => s + i.quantity * i.unit_price,
				0,
			);
			await createOrder({
				customer_id: customer.id,
				items: form.items,
				delivery_cost: form.deliveryCost,
				total_price: totalItems + form.deliveryCost,
				wilaya: form.wilaya,
				commune: form.commune,
				address: form.address,
				notes: form.notes,
			});
			setShowCreate(false);
			setForm({
				customerName: "",
				phone: "",
				wilaya: "",
				commune: "",
				address: "",
				items: [{ product_name: "", quantity: 1, unit_price: 0 }],
				deliveryCost: 0,
				notes: "",
			});
			loadData();
		} catch (e) {
			toast({ type: "error", title: (e as Error).message });
		} finally {
			setSaving(false);
		}
	}

	function handleImportedOrder(data: Record<string, unknown>) {
		const items =
			(data.items as Array<Record<string, unknown>> | undefined) || [];
		setForm({
			customerName: (data.customer_name as string) || "",
			phone: (data.phone as string) || "",
			wilaya: (data.wilaya as string) || "",
			commune: "",
			address: (data.address as string) || "",
			items:
				items.length > 0
					? items.map((i) => {
							const name = (i.product_name as string) || "";
							const matched = products.find((p) => p.name === name);
							return {
								product_name: name,
								quantity: (i.quantity as number) || 1,
								unit_price: matched ? matched.price : 0,
								product_id: matched ? matched.id : undefined,
							};
					  })
					: [{ product_name: "", quantity: 1, unit_price: 0 }],
			deliveryCost: 0,
			notes: "",
		});
		setShowCreate(true);
	}

	function openWhatsApp(order: Order) {
		const phone = order.customer?.phone?.replace(/[^0-9]/g, "") || "";
		if (!phone) return;
		const intlPhone = phone.startsWith("0") ? "213" + phone.slice(1) : phone;
		const productLine = (order.items || [])
			.map((i) => `${i.product_name} x${i.quantity}`)
			.join(", ");
		let msg = whatsappTemplate || t.orders.defaultWhatsappTemplate;
		msg = msg
			.replace(/\{\{customer_name\}\}/g, order.customer?.name || "")
			.replace(/\{\{order_number\}\}/g, order.order_number || "")
			.replace(/\{\{items\}\}/g, productLine)
			.replace(/\{\{total_price\}\}/g, `${order.total_price} DA`)
			.replace(/\{\{wilaya\}\}/g, order.wilaya || "");
		window.open(
			`https://wa.me/${intlPhone}?text=${encodeURIComponent(msg)}`,
			"_blank",
		);
	}

	async function handleStatusUpdate(
		orderId: string,
		newStatus: import("@/types/database").OrderStatus,
	) {
		try {
			await updateOrderStatus(orderId, newStatus);
			loadData();
		} catch (e) {
			toast({ type: "error", title: (e as Error).message });
		}
	}

	async function handleDeleteOrder(orderId: string) {
		setDeleting(true);
		try {
			await deleteOrder(orderId);
			setSelectedOrder(null);
			setShowDeleteConfirm(null);
			loadData();
			toast({ type: "success", title: t.orders.orderDeleted });
		} catch (e) {
			toast({ type: "error", title: (e as Error).message });
		} finally {
			setDeleting(false);
		}
	}

	function handleSelectAll(checked: boolean) {
		if (checked) setSelectedIds(new Set(filtered.map((o) => o.id)));
		else setSelectedIds(new Set());
	}

	function handleSelectOne(id: string, checked: boolean) {
		const next = new Set(selectedIds);
		if (checked) next.add(id);
		else next.delete(id);
		setSelectedIds(next);
	}

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

	return (
		<PageTransition className="sf-flex-col sf-gap-xl">
			{/* Header */}
			<div className="sf-page-header">
				<div>
					<h1 className="sf-page-title">{t.orders.title}</h1>
					<p className="sf-page-subtitle">
						{filtered.length} {t.orders.title.toLowerCase()}
					</p>
				</div>
				<div className="sf-orders-header-actions">
					<button
						className="sf-btn sf-btn-ghost"
						onClick={() => exportOrdersCSV()}
						title={t.analytics.exportCSV}
					>
						<Download size={16} />
					</button>
					{hasPermission("orders:manage") && (
						<>
							<button
								className="sf-btn sf-btn-ghost"
								onClick={() => setShowImport(true)}
							>
								<Sparkles size={16} /> {t.orders.importFromWhatsapp}
							</button>
							<button
								className="sf-btn sf-btn-primary"
								onClick={() => setShowCreate(true)}
							>
								<Plus size={16} /> {t.orders.newOrder}
							</button>
						</>
					)}
				</div>
			</div>

			{/* Filters */}
			<div className="sf-orders-filters">
				<div
					className={`sf-orders-search-wrap ${isMobile ? "sf-orders-search-wrap--mobile" : ""}`}
				>
					<Search size={16} className="sf-orders-search-icon" />
					<input
						className="sf-input sf-orders-search-input"
						placeholder={t.orders.searchOrders}
						value={search}
						onChange={(e) => setSearch(e.target.value)}
					/>
				</div>
				<div className="sf-orders-status-filters">
					{STATUSES.map((s) => (
						<button
							key={s}
							className={`sf-badge ${filter === s ? "sf-badge-brand" : ""}`}
							onClick={() => handleFilterChange(s)}
							type="button"
						>
							{s === "all"
								? t.common.all
								: s === "draft"
									? t.orders.drafts
									: translateStatus(s)}
						</button>
					))}
				</div>
			</div>

			{/* Bulk Action Bar */}
			{selectedIds.size > 0 && (
				<div className="sf-card sf-orders-bulkbar">
					<span className="sf-orders-bulkbar__count">
						{selectedIds.size} {t.orders.selected}
					</span>
					<div className="sf-orders-bulkbar__actions">
						{hasPermission("orders:confirm") && (
							<button
								className="sf-btn sf-orders-bulkbar__btn sf-orders-bulkbar__btn--soft"
								onClick={async () => {
                  const ids = Array.from(selectedIds);
                  const results = await Promise.allSettled(
                    ids.map(async (id) => {
                      const order = orders.find((o) => o.id === id);
                      if (order && order.status === "pending")
                        await handleStatusUpdate(id, "confirmed");
                    })
                  );
                  const succeeded = results.filter((r) => r.status === "fulfilled").length;
                  const failed = results.filter((r) => r.status === "rejected").length;
                  setSelectedIds(new Set());
                  if (failed === 0) {
                    toast({ type: "success", title: succeeded + " " + t.orders.bulkConfirmed });
                  } else {
                    toast({ type: "warning", title: succeeded + " succeeded, " + failed + " failed" });
                  }
                }}
							>
								{t.orders.confirmSelected}
							</button>
						)}
						{hasPermission("orders:manage") && (
							<button
								className="sf-btn sf-orders-bulkbar__btn sf-orders-bulkbar__btn--soft"
								onClick={async () => {
                  const ids = Array.from(selectedIds);
                  const results = await Promise.allSettled(
                    ids.map(async (id) => {
                      const order = orders.find((o) => o.id === id);
                      if (order && order.status === "confirmed")
                        await handleStatusUpdate(id, "shipped");
                    })
                  );
                  const succeeded = results.filter((r) => r.status === "fulfilled").length;
                  const failed = results.filter((r) => r.status === "rejected").length;
                  setSelectedIds(new Set());
                  toast({
										type: "success",
										title: `${selectedIds.size} ${t.orders.bulkShipped}`,
									});
								}}
							>
								{t.orders.shipSelected}
							</button>
						)}
						{hasPermission("orders:manage") && (
							<button
								className="sf-btn sf-orders-bulkbar__btn sf-orders-bulkbar__btn--muted"
								onClick={async () => {
									for (const id of selectedIds)
										await handleStatusUpdate(id, "cancelled");
									setSelectedIds(new Set());
									toast({
										type: "success",
										title: `${selectedIds.size} ${t.orders.bulkCancelled}`,
									});
								}}
							>
								{t.orders.cancelSelected}
							</button>
						)}
						{canDeleteData && (
							<button
								className="sf-btn sf-orders-bulkbar__btn sf-orders-bulkbar__btn--danger"
								onClick={async () => {
									try {
										for (const id of selectedIds) await deleteOrder(id);
										setSelectedIds(new Set());
										loadData();
										toast({
											type: "success",
											title: `${selectedIds.size} ${t.orders.orderDeleted}`,
										});
									} catch (e) {
										toast({ type: "error", title: (e as Error).message });
									}
								}}
							>
								{t.common.delete}
							</button>
						)}
						<button
							className="sf-btn sf-orders-bulkbar__btn sf-orders-bulkbar__btn--ghost"
							onClick={() => setSelectedIds(new Set())}
						>
							{t.common.cancel}
						</button>
					</div>
				</div>
			)}

			{/* Stats Cards */}
			<OrderStatsCards
				stats={orderStats}
				draftCount={orders.filter((o) => o.status === "draft").length}
			/>

			{/* Empty state */}
			{filtered.length === 0 && (
				<div className="sf-card sf-orders-empty">
					<p className="sf-orders-empty__title">{t.orders.noOrdersTitle}</p>
					<p className="sf-orders-empty__desc">{t.orders.noOrdersDesc}</p>
					{hasPermission("orders:manage") && (
						<button
							className="sf-btn sf-btn-primary"
							onClick={() => setShowCreate(true)}
						>
							<Plus size={16} /> {t.orders.createFirstOrder}
						</button>
					)}
				</div>
			)}

			{/* Table (desktop) */}
			{filtered.length > 0 && !isMobile && (
				<OrderTable
					orders={filtered}
					selectedIds={selectedIds}
					onSelectAll={handleSelectAll}
					onSelectOne={handleSelectOne}
					onOpenDetail={setSelectedOrder}
					onStatusUpdate={(id: string, status: string) => handleStatusUpdate(id, status as import("@/types/database").OrderStatus)}
					onOpenWhatsApp={openWhatsApp}
					canManageOrders={hasPermission("orders:manage")}
					canConfirmOrders={hasPermission("orders:confirm")}
				/>
			)}

			{/* Cards (mobile) */}
			{filtered.length > 0 && isMobile && (
				<OrderMobileCards
					orders={filtered}
					onOpenDetail={setSelectedOrder}
					onStatusUpdate={handleStatusUpdate}
					onOpenWhatsApp={openWhatsApp}
					canManageOrders={hasPermission("orders:manage")}
					canConfirmOrders={hasPermission("orders:confirm")}
				/>
			)}

			{/* Create Order Modal */}
			{showCreate && (
				<div className="sf-modal-backdrop" onClick={() => setShowCreate(false)}>
					<div
						className="sf-modal sf-orders-modal"
						onClick={(e) => e.stopPropagation()}
					>
						<div className="sf-orders-modal__header">
							<h2 className="sf-orders-modal__title">{t.orders.newOrder}</h2>
							<button
								onClick={() => setShowCreate(false)}
								className="sf-orders-modal__close"
							>
								<X size={20} />
							</button>
						</div>
						<div className="sf-flex-col sf-gap-md">
							<p className="sf-section-label">{t.orders.customerInfo}</p>
							<div className="sf-grid-2">
								<div>
									<label className="sf-label">{t.orders.customerName}</label>
									<input
										className="sf-input"
										value={form.customerName}
										onChange={(e) =>
											setForm((f) => ({ ...f, customerName: e.target.value }))
										}
									/>
								</div>
								<div>
									<label className="sf-label">{t.orders.phone}</label>
									<input
										className="sf-input"
										value={form.phone}
										onChange={(e) =>
											setForm((f) => ({ ...f, phone: e.target.value }))
										}
										dir="ltr"
									/>
								</div>
							</div>
							<div className="sf-grid-2">
								<div>
									<label className="sf-label">{t.dashboard.wilaya}</label>
									<select
										className="sf-input sf-input--native-select"
										value={form.wilaya}
										onChange={(e) => handleWilayaChange(e.target.value)}
									>
										<option value="">—</option>
										{WILAYA_NAMES.map((w: string) => (
											<option key={w} value={w}>
												{w}
											</option>
										))}
									</select>
								</div>
								<div>
									<label className="sf-label">{t.orders.commune}</label>
									<input
										className="sf-input"
										value={form.commune}
										onChange={(e) =>
											setForm((f) => ({ ...f, commune: e.target.value }))
										}
									/>
								</div>
							</div>
							<div>
								<label className="sf-label">{t.orders.address}</label>
								<input
									className="sf-input"
									value={form.address}
									onChange={(e) =>
										setForm((f) => ({ ...f, address: e.target.value }))
									}
								/>
							</div>
							<p className="sf-section-label">{t.orders.items}</p>
							{form.items.map((item, idx) => (
								<div key={idx} className="sf-orders-modal__item-row">
									<div className="sf-orders-modal__item-product">
										<label className="sf-label">{t.orders.productName}</label>
										<select
											className="sf-input sf-input--native-select"
											value={item.product_name}
											onChange={(e) => {
												const items = [...form.items];
												const productName = e.target.value;
												items[idx].product_name = productName;
												const matchedProduct = products.find(
													(p) => p.name === productName,
												);
												if (matchedProduct) {
													items[idx].unit_price = matchedProduct.price;
													items[idx].product_id = matchedProduct.id;
												} else {
													delete items[idx].product_id;
												}
												setForm((f) => ({ ...f, items }));
											}}
										>
											<option value="">{t.orders.selectProduct}</option>
											{products.map((p) => (
												<option key={p.id} value={p.name}>
													{p.name} — {p.price} DA{" "}
													{p.stock !== undefined
														? `(${p.stock} ${t.products.stock.toLowerCase()})`
														: ""}
												</option>
											))}
											<option value="__custom__">{t.orders.customItem}</option>
										</select>
										{item.product_name === "__custom__" && (
											<input
												className="sf-input sf-orders-modal__input-mt"
												placeholder={t.orders.productName}
												onChange={(e) => {
													const items = [...form.items];
													items[idx].product_name = e.target.value;
													setForm((f) => ({ ...f, items }));
												}}
											/>
										)}
									</div>
									<div className="sf-orders-modal__item-qty">
										<label className="sf-label">{t.orders.quantity}</label>
										<input
											className="sf-input"
											type="number"
											min="1"
											value={item.quantity}
											onChange={(e) => {
												const items = [...form.items];
												items[idx].quantity = Number(e.target.value);
												setForm((f) => ({ ...f, items }));
											}}
										/>
									</div>
									<div className="sf-orders-modal__item-price">
										<label className="sf-label">{t.orders.price}</label>
										<input
											className="sf-input"
											type="number"
											min="0"
											value={item.unit_price}
											onChange={(e) => {
												const items = [...form.items];
												items[idx].unit_price = Number(e.target.value);
												setForm((f) => ({ ...f, items }));
											}}
										/>
									</div>
								</div>
							))}
							<button
								className="sf-btn sf-btn-ghost sf-orders-modal__add-item"
								onClick={() =>
									setForm((f) => ({
										...f,
										items: [
											...f.items,
											{ product_name: "", quantity: 1, unit_price: 0 },
										],
									}))
								}
							>
								{t.orders.addItem}
							</button>
							<div className="sf-grid-2">
								<div>
									<label className="sf-label">{t.orders.deliveryCost}</label>
									<input
										className="sf-input"
										type="number"
										min="0"
										value={form.deliveryCost}
										onChange={(e) =>
											setForm((f) => ({
												...f,
												deliveryCost: Number(e.target.value),
											}))
										}
									/>
								</div>
							</div>
							<div>
								<label className="sf-label">{t.orders.notes}</label>
								<textarea
									className="sf-textarea"
									rows={2}
									placeholder={t.orders.optionalNotes}
									value={form.notes}
									onChange={(e) =>
										setForm((f) => ({ ...f, notes: e.target.value }))
									}
								/>
							</div>
							<button
								className="sf-btn sf-btn-primary sf-orders-modal__submit"
								disabled={saving || !form.customerName || !form.phone}
								onClick={handleCreate}
							>
								{saving ? (
									<>
										<Loader2 size={16} className="sf-animate-spin" />
										{t.orders.creating}
									</>
								) : (
									<>
										<Plus size={16} />
										{t.orders.createOrder}
									</>
								)}
							</button>
						</div>
					</div>
				</div>
			)}

			{/* AI WhatsApp Import Modal */}
			{showImport && (
				<AIOrderImport
					onClose={() => setShowImport(false)}
					onOrderCreated={handleImportedOrder}
				/>
			)}

			{/* Order Detail Slide-Out */}
			{selectedOrder && (
          <OrderSlideOut
            order={selectedOrder}
            showDeleteConfirm={showDeleteConfirm}
            deleting={deleting}
            onClose={() => setSelectedOrder(null)}
            onStatusUpdate={(id: string, s: string) => handleStatusUpdate(id, s as "confirmed" | "pending" | "shipped" | "delivered" | "returned" | "refused" | "draft")}
            onConfirmOrder={(order) => setConfirmOrder(order)}
            onOpenWhatsApp={openWhatsApp}
            onDeleteClick={(id) => setShowDeleteConfirm(id)}
            onConfirmDelete={handleDeleteOrder}
            onCancelDelete={() => setShowDeleteConfirm(null)}
          />
        )}

        {confirmOrder && (
				<div
					className="sf-slideout-backdrop"
					onClick={() => setConfirmOrder(null)}
					role="presentation"
				>
					<div
						className="sf-slideout"
						onClick={(e) => e.stopPropagation()}
						role="dialog"
						aria-modal="true"
						aria-label={t.confirmationFlow.title}
					>
						<div className="sf-slideout__header">
							<div className="sf-orders-slideout__confirm-title">
								{confirmOrder.order_number}
							</div>
							<button
								onClick={() => setConfirmOrder(null)}
								aria-label={t.common.closePanel}
								className="sf-orders-slideout__close sf-orders-slideout__close--compact"
							>
								<X size={20} />
							</button>
						</div>
						<div className="sf-slideout__body">
							<ConfirmationPanel
								order={confirmOrder}
								onStatusChange={(orderId, newStatus) => {
									handleStatusUpdate(
										orderId,
										newStatus as import("@/types/database").OrderStatus,
									);
									setConfirmOrder(null);
								}}
								onClose={() => setConfirmOrder(null)}
							/>
						</div>
					</div>
				</div>
			)}

			{showReturnModal && (
				<ReturnModal
					order={showReturnModal}
					onClose={() => setShowReturnModal(null)}
					onSuccess={(newReturn) => {
						toast({
							type: "success",
							title: `Return request ${newReturn.return_number} created successfully`,
						});
						loadData();
					}}
				/>
			)}

			{/* Load More */}
			{hasMore && !loading && orders.length > 0 && (
				<div className="sf-orders-load-more-wrap">
					<button
						className="sf-btn sf-btn-ghost"
						onClick={() => setPage((p) => p + 1)}
					>
						{t.common.loadMore} ({orders.length} / {totalCount})
					</button>
				</div>
			)}
		</PageTransition>
	);
}
