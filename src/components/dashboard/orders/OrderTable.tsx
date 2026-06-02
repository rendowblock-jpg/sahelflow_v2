"use client";

import { MessageCircle } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { getWilayaName } from "@/lib/data/wilayas";
import type { Order } from "./types";

const STATUS_COLOR: Record<string, string> = {
	draft: "sf-badge-draft",
	pending: "sf-badge-warning",
	confirmed: "sf-badge-brand",
	shipped: "sf-badge-brand",
	delivered: "sf-badge-success",
	returned: "sf-badge-danger",
	cancelled: "sf-badge-danger",
	refused: "sf-badge-danger",
};

interface Props {
	orders: Order[];
	selectedIds: Set<string>;
	statusColor?: Record<string, string>;
	onSelectAll: (checked: boolean) => void;
	onSelectOne: (id: string, checked: boolean) => void;
	onOpenDetail: (order: Order) => void;
	onStatusUpdate: (orderId: string, newStatus: import("@/types/database").OrderStatus) => void;
	onOpenWhatsApp: (order: Order) => void;
	canManageOrders?: boolean;
	canConfirmOrders?: boolean;
}

export default function OrderTable({
	orders,
	selectedIds,
	onSelectAll,
	onSelectOne,
	onOpenDetail,
	onStatusUpdate,
	onOpenWhatsApp,
	canManageOrders = true,
	canConfirmOrders = true,
}: Props) {
	const { t, formatCurrency, formatTimeAgo, locale } = useI18n();

	const translateStatus = (s: string) =>
		(t.status as Record<string, string>)[s] || s;

	const hasAnyActionPermission = canManageOrders || canConfirmOrders;

	return (
		<div className="sf-card sf-orders-table-card">
			<div className="sf-table-wrap">
				<table className="sf-table">
					<thead>
						<tr>
							{hasAnyActionPermission && (
								<th className="sf-orders-col-checkbox">
									<input
										type="checkbox"
										checked={
											orders.length > 0 && selectedIds.size === orders.length
										}
										onChange={(e) => onSelectAll(e.target.checked)}
										className="sf-orders-input-checkbox"
									/>
								</th>
							)}
							<th>{t.dashboard.orderId}</th>
							<th>{t.dashboard.customer}</th>
							<th>{t.dashboard.wilaya}</th>
							<th>{t.common.status}</th>
							<th className="sf-ta-end">{t.dashboard.total}</th>
							<th>{t.orders.created}</th>
							{hasAnyActionPermission && <th>{t.common.actions}</th>}
						</tr>
					</thead>
					<tbody>
						{orders.map((o) => (
							<tr
								key={o.id}
								onClick={() => onOpenDetail(o)}
								className="sf-orders-table-row"
							>
								{hasAnyActionPermission && (
									<td onClick={(e) => e.stopPropagation()}>
										<input
											type="checkbox"
											checked={selectedIds.has(o.id)}
											onChange={(e) => onSelectOne(o.id, e.target.checked)}
											className="sf-orders-input-checkbox"
										/>
									</td>
								)}
								<td className="sf-orders-cell-mono-strong">{o.order_number}</td>
								<td>
									<div className="sf-orders-cell-customer-name">
										{o.customer?.name || "—"}
									</div>
									<div className="sf-orders-cell-customer-phone">
										{o.customer?.phone || ""}
									</div>
								</td>
								<td className="sf-orders-cell-muted">{getWilayaName(o.wilaya, locale) || "—"}</td>
								<td>
									<span className={`sf-badge ${STATUS_COLOR[o.status] || ""}`}>
										{translateStatus(o.status)}
									</span>
								</td>
								<td className="sf-orders-cell-total">
									{formatCurrency(Number(o.total_price))}
								</td>
								<td className="sf-orders-cell-time">
									{formatTimeAgo(o.created_at)}
								</td>
								{hasAnyActionPermission && (
									<td>
										<div className="sf-orders-row-actions" onClick={(e) => e.stopPropagation()}>
											{o.status === "draft" && (
												<>
													{canConfirmOrders && (
														<button
															className="sf-btn sf-btn-primary sf-orders-row-btn"
															onClick={() => onStatusUpdate(o.id, "pending")}
														>
															{t.orders.confirmOrder}
														</button>
													)}
													{canManageOrders && (
														<button
															className="sf-btn sf-btn-ghost sf-orders-row-btn"
															onClick={() => onStatusUpdate(o.id, "cancelled")}
														>
															{t.orders.discard}
														</button>
													)}
												</>
											)}
											{o.status === "pending" && canConfirmOrders && (
												<button
													className="sf-btn sf-btn-success sf-orders-row-btn"
													onClick={() => onStatusUpdate(o.id, "confirmed")}
												>
													{t.orders.confirmOrder}
												</button>
											)}
											{o.status === "confirmed" && canManageOrders && (
												<button
													className="sf-btn sf-btn-primary sf-orders-row-btn"
													onClick={() => onStatusUpdate(o.id, "shipped")}
												>
													{t.orders.shipOrder}
												</button>
											)}
											{o.customer?.phone && (canConfirmOrders || canManageOrders) && (
												<button
													title={t.orders.confirmViaWhatsapp}
													className="sf-btn sf-btn-ghost sf-orders-row-btn-wa"
													onClick={() => onOpenWhatsApp(o)}
												>
													<MessageCircle size={14} />
												</button>
											)}
										</div>
									</td>
								)}
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}
