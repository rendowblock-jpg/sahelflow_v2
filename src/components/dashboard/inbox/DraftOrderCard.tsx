"use client";

import { useI18n } from "@/lib/i18n";
import type { InboxDraftOrder } from "./types";

interface Props {
	draftOrder: InboxDraftOrder;
	onConfirm: () => void;
	onDiscard: () => void;
}

export function DraftOrderCard({ draftOrder, onConfirm, onDiscard }: Props) {
	const { t, locale } = useI18n();
	const items = Array.isArray(draftOrder.items) ? draftOrder.items : [];

	return (
		<div className="inbox-draft-card">
			<div className="inbox-draft-header">
				<span style={{ fontSize: 14, fontWeight: 600 }}>
					📦 <strong>{draftOrder.order_number}</strong>
				</span>
				<span className="inbox-draft-total">
					{draftOrder.total_price?.toLocaleString(
						locale === "ar" ? "ar-DZ" : locale === "en" ? "en-US" : "fr-DZ",
					)}{" "}
					DA
				</span>
			</div>
			<div className="inbox-draft-items">
				{items.map((item, i) => (
					<div key={i}>
						{item.quantity}x {item.name} —{" "}
						{(item.quantity * item.price).toLocaleString(
							locale === "ar" ? "ar-DZ" : locale === "en" ? "en-US" : "fr-DZ",
						)}{" "}
						DA
					</div>
				))}
			</div>
			<div className="inbox-draft-footer">
				{draftOrder.wilaya && (
					<span className="sf-badge">{draftOrder.wilaya}</span>
				)}
				<span className="inbox-draft-delivery">
					🚚{" "}
					{draftOrder.delivery_cost?.toLocaleString(
						locale === "ar" ? "ar-DZ" : locale === "en" ? "en-US" : "fr-DZ",
					)}{" "}
					DA
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
