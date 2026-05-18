"use client";

import { useI18n } from "@/lib/i18n";
import type { InboxDraftOrder } from "./types";

interface Props {
	draftOrder: InboxDraftOrder;
	onConfirm: () => void;
	onDiscard: () => void;
}

export function DraftOrderCard({ draftOrder, onConfirm, onDiscard }: Props) {
	const { t } = useI18n();
	const items = Array.isArray(draftOrder.items) ? draftOrder.items : [];

	return (
		<div
			style={{
				borderLeft: "4px solid var(--color-brand-500)",
				background: "var(--color-surface-secondary)",
				borderRadius: "var(--radius-md)",
				padding: "12px 16px",
				margin: "0 16px",
			}}
		>
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
					marginBottom: 8,
				}}
			>
				<span style={{ fontSize: 14, fontWeight: 600 }}>
					📦 <strong>{draftOrder.order_number}</strong>
				</span>
				<span
					style={{
						fontWeight: 700,
						color: "var(--color-brand-400)",
					}}
				>
					{draftOrder.total_price?.toLocaleString("fr-DZ")} DA
				</span>
			</div>
			<div
				style={{
					fontSize: 13,
					color: "var(--color-content-secondary)",
					marginBottom: 8,
				}}
			>
				{items.map((item, i) => (
					<div key={i}>
						{item.quantity}x {item.name} —{" "}
						{(item.quantity * item.price).toLocaleString("fr-DZ")} DA
					</div>
				))}
			</div>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 8,
					flexWrap: "wrap",
				}}
			>
				{draftOrder.wilaya && (
					<span className="sf-badge">{draftOrder.wilaya}</span>
				)}
				<span
					style={{
						fontSize: 12,
						color: "var(--color-content-tertiary)",
					}}
				>
					🚚 {draftOrder.delivery_cost?.toLocaleString("fr-DZ")} DA
				</span>
				<div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
					<button
						className="sf-btn sf-btn-primary"
						style={{
							fontSize: 12,
							padding: "4px 12px",
							minHeight: 28,
						}}
						onClick={onConfirm}
					>
						✅ {t.inbox.confirmOrder}
					</button>
					<button
						className="sf-btn sf-btn-ghost"
						style={{
							fontSize: 12,
							padding: "4px 12px",
							minHeight: 28,
						}}
						onClick={onDiscard}
					>
						🗑 {t.inbox.discardOrder}
					</button>
				</div>
			</div>
		</div>
	);
}
