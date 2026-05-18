"use client";

import {
	X,
	Phone,
	MapPin,
	Clock,
	PackageCheck,
	MessageCircle,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { Order } from "./types";

interface Props {
	order: Order | null;
	showDeleteConfirm: string | null;
	deleting: boolean;
	onClose: () => void;
	onStatusUpdate: (orderId: string, newStatus: string) => void;
	onConfirmOrder: (order: Order) => void;
	onOpenWhatsApp: (order: Order) => void;
	onDeleteClick: (orderId: string) => void;
	onConfirmDelete: (orderId: string) => void;
	onCancelDelete: () => void;
}

export default function OrderSlideOut({
	order,
	showDeleteConfirm,
	deleting,
	onClose,
	onStatusUpdate,
	onConfirmOrder,
	onOpenWhatsApp,
	onDeleteClick,
	onConfirmDelete,
	onCancelDelete,
}: Props) {
	const { t, formatCurrency } = useI18n();

	if (!order) return null;

	return (
		<div className="sf-slideout-backdrop" onClick={onClose} role="presentation">
			<div
				className="sf-slideout"
				onClick={(e) => e.stopPropagation()}
				role="dialog"
				aria-modal="true"
				aria-label={t.orders.orderDetails}
			>
				<div className="sf-slideout__header">
					<div>
						<h2 className="sf-orders-slideout__number">{order.order_number}</h2>
						<span
							className={`sf-badge ${
								order.status === "draft"
									? "sf-badge-draft"
									: order.status === "pending"
										? "sf-badge-warning"
										: order.status === "confirmed"
											? "sf-badge-brand"
											: order.status === "shipped"
												? "sf-badge-brand"
												: order.status === "delivered"
													? "sf-badge-success"
													: "sf-badge-danger"
							}`}
						>
							{(t.status as Record<string, string>)[order.status] ||
								order.status}
						</span>
					</div>
					<button
						onClick={onClose}
						aria-label={t.common.closePanel}
						className="sf-orders-slideout__close"
					>
						<X size={20} />
					</button>
				</div>

				<div className="sf-slideout__body">
					<div className="sf-slideout__section">
						<h4 className="sf-section-label">{t.orders.customerInfo}</h4>
						<div className="sf-orders-slideout__stack">
							<span className="sf-orders-slideout__customer-name">
								{order.customer?.name || "—"}
							</span>
							{order.customer?.phone && (
								<a
									href={`tel:${order.customer.phone}`}
									className="sf-orders-slideout__contact-link"
								>
									<Phone size={14} /> {order.customer.phone}
								</a>
							)}
							{order.wilaya && (
								<span className="sf-orders-slideout__meta">
									<MapPin size={14} /> {order.wilaya}
									{order.commune ? `, ${order.commune}` : ""}
								</span>
							)}
							{order.address && (
								<span className="sf-orders-slideout__address">
									{order.address}
								</span>
							)}
						</div>
					</div>

					<div className="sf-slideout__section">
						<h4 className="sf-section-label">{t.orders.items}</h4>
						<div className="sf-orders-slideout__items">
							{(order.items || []).map((item, i) => (
								<div key={i} className="sf-orders-slideout__row">
									<span className="sf-orders-slideout__row-text">
										{item.quantity}x {item.product_name}
									</span>
									<span className="sf-orders-slideout__row-value">
										{formatCurrency(item.quantity * item.unit_price)}
									</span>
								</div>
							))}
							<div className="sf-orders-slideout__row sf-orders-slideout__row-muted">
								<span>{t.orders.deliveryCost}</span>
								<span>{formatCurrency(Number(order.delivery_cost || 0))}</span>
							</div>
							<div className="sf-orders-slideout__total">
								<span>{t.dashboard.total}</span>
								<span className="sf-orders-slideout__total-value">
									{formatCurrency(Number(order.total_price))}
								</span>
							</div>
						</div>
					</div>

					{order.notes && (
						<div className="sf-slideout__section">
							<h4 className="sf-section-label">{t.orders.notes}</h4>
							<p className="sf-orders-slideout__note">{order.notes}</p>
						</div>
					)}

					<div className="sf-slideout__section">
						<h4 className="sf-section-label">{t.orders.timeline}</h4>
						<div className="sf-orders-slideout__timeline">
							<Clock size={14} /> {t.orders.created}:{" "}
							{new Date(order.created_at).toLocaleString()}
						</div>
					</div>

					<div className="sf-slideout__section sf-orders-slideout__actions">
						{order.status === "draft" && (
							<>
								<button
									className="sf-btn sf-btn-primary sf-orders-slideout__full-btn"
									onClick={() => {
										onStatusUpdate(order.id, "pending");
										onClose();
									}}
								>
									<PackageCheck size={16} /> {t.orders.confirmOrder}
								</button>
								<button
									className="sf-btn sf-btn-ghost sf-orders-slideout__full-btn"
									onClick={() => {
										onStatusUpdate(order.id, "cancelled");
										onClose();
									}}
								>
									{t.orders.discard}
								</button>
							</>
						)}
						{order.status === "pending" && (
							<button
								className="sf-btn sf-btn-success sf-orders-slideout__full-btn"
								onClick={() => {
									onConfirmOrder(order);
									onClose();
								}}
							>
								<Phone size={16} /> {t.confirmationFlow.title}
							</button>
						)}
						{order.status === "confirmed" && (
							<button
								className="sf-btn sf-btn-primary sf-orders-slideout__full-btn"
								onClick={() => {
									onStatusUpdate(order.id, "shipped");
									onClose();
								}}
							>
								{t.orders.shipOrder}
							</button>
						)}
						{order.customer?.phone && (
							<>
								<button
									className="sf-btn sf-btn-ghost sf-orders-slideout__wa-btn"
									onClick={() => onOpenWhatsApp(order)}
								>
									<MessageCircle size={16} /> {t.orders.confirmViaWhatsapp}
								</button>
								<a
									href={`tel:${order.customer.phone}`}
									className="sf-btn sf-btn-ghost sf-orders-slideout__call-btn"
								>
									<Phone size={16} /> {t.orders.callToConfirm}
								</a>
							</>
						)}
						{showDeleteConfirm === order.id ? (
							<div className="sf-orders-slideout__delete-confirm">
								<p className="sf-orders-slideout__delete-text">
									{t.orders.deleteOrderWarning}
								</p>
								<div className="sf-orders-slideout__delete-actions">
									<button
										className="sf-btn sf-btn-danger"
										disabled={deleting}
										onClick={() => onConfirmDelete(order.id)}
									>
										{deleting ? t.common.loading : t.common.delete}
									</button>
									<button
										className="sf-btn sf-btn-ghost"
										onClick={onCancelDelete}
									>
										{t.common.cancel}
									</button>
								</div>
							</div>
						) : (
							<button
								className="sf-btn sf-btn-ghost sf-orders-slideout__delete-btn"
								onClick={() => onDeleteClick(order.id)}
							>
								<X size={16} /> {t.common.delete}
							</button>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
