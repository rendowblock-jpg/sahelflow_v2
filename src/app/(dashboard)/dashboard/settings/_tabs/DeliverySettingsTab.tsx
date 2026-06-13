"use client";

import Link from "next/link";
import { ExternalLink, Truck, CheckCircle2, Clock } from "lucide-react";
import { useI18n } from "@/lib/i18n";

const PROVIDERS = [
	{
		id: "yalidine",
		name: "Yalidine",
		description: "Algeria's #1 last-mile delivery network — 58 wilayas",
		icon: "📦",
		color: "#3B9EFF",
		status: "active",
		features: ["Real-time tracking", "COD support", "Bulk waybills"],
	},
	{
		id: "zrexpress",
		name: "ZR Express",
		description: "Fast domestic delivery across Algeria",
		icon: "✈️",
		color: "#f59e0b",
		status: "active",
		features: ["Express delivery", "COD support", "Online tracking"],
	},
	{
		id: "maystro",
		name: "Maystro Delivery",
		description: "Tech-first delivery with real-time updates",
		icon: "🚚",
		color: "#10b981",
		status: "active",
		features: ["Live GPS tracking", "API integration", "SMS notifications"],
	},
	{
		id: "dhlfr",
		name: "DHL Freight",
		description: "International shipping & freight",
		icon: "🌍",
		color: "#6366f1",
		status: "coming_soon",
		features: ["International shipping", "customs clearance", "express"],
	},
];

export default function DeliverySettingsTab() {
	const { t } = useI18n();

	return (
		<div className="sf-flex-col sf-gap-lg sf-animate-fade">
			{/* Section: Delivery Partners */}
			<div className="sf-settings-section">
				<div className="sf-settings-section-header">
					<div className="sf-flex sf-items-center sf-gap-sm">
						<div className="sf-icon-box-sm sf-icon-brand">
							<Truck size={14} />
						</div>
						<h3 className="sf-settings-section-title">{t.settings.deliverySettings}</h3>
					</div>
					<p className="sf-settings-section-desc">
						{t.settings.deliveryNote}
					</p>
				</div>

				<div
					className="sf-settings-section-body"
					style={{
						display: "grid",
						gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
						gap: 14,
						padding: "16px 20px 20px",
					}}
				>
					{PROVIDERS.map((provider) => (
						<div
							key={provider.id}
							className="sf-integration-card"
							style={{
								position: "relative",
								opacity: provider.status === "coming_soon" ? 0.65 : 1,
								borderTop: `3px solid ${provider.color}`,
							}}
						>
							{/* Header */}
							<div className="sf-flex sf-items-center sf-gap-md" style={{ marginBottom: 12 }}>
								<div
									className="sf-icon-box-sm"
									style={{
										background: `${provider.color}15`,
										color: provider.color,
										fontSize: 18,
										width: 38,
										height: 38,
										borderRadius: "var(--radius-md)",
										display: "flex",
										alignItems: "center",
										justifyContent: "center",
										flexShrink: 0,
									}}
								>
									{provider.icon}
								</div>
								<div style={{ flex: 1 }}>
									<p className="sf-font-semibold sf-text-sm">{provider.name}</p>
									<p className="sf-text-xs sf-text-tertiary">{provider.description}</p>
								</div>
								{provider.status === "coming_soon" ? (
									<span
										className="sf-badge"
										style={{
											fontSize: 10,
											background: "var(--color-surface-tertiary)",
											color: "var(--color-content-tertiary)",
											flexShrink: 0,
										}}
									>
										<Clock size={9} style={{ marginInlineEnd: 3 }} />
										Soon
									</span>
								) : (
									<span className="sf-badge sf-badge-success" style={{ fontSize: 10, flexShrink: 0 }}>
										<CheckCircle2 size={9} style={{ marginInlineEnd: 3 }} />
										Active
									</span>
								)}
							</div>

							{/* Feature pills */}
							<div className="sf-flex sf-flex-wrap" style={{ gap: 5, marginBottom: 14 }}>
								{provider.features.map((f) => (
									<span
										key={f}
										style={{
											fontSize: 10,
											padding: "2px 8px",
											borderRadius: "20px",
											background: `${provider.color}10`,
											color: provider.color,
											border: `1px solid ${provider.color}25`,
											fontWeight: 500,
										}}
									>
										{f}
									</span>
								))}
							</div>

							{/* CTA */}
							{provider.status === "active" ? (
								<Link
									href="/dashboard/integrations"
									className="sf-btn sf-btn-ghost"
									style={{ width: "100%", justifyContent: "center", fontSize: 13 }}
								>
									<ExternalLink size={13} style={{ marginInlineEnd: 5 }} />
									Configure API Keys
								</Link>
							) : (
								<button
									className="sf-btn sf-btn-ghost"
									disabled
									style={{ width: "100%", justifyContent: "center", fontSize: 13, cursor: "not-allowed" }}
								>
									Coming Soon
								</button>
							)}
						</div>
					))}
				</div>
			</div>

			{/* Tip */}
			<div
				style={{
					padding: "12px 16px",
					background: "rgba(59,158,255,0.05)",
					border: "1px solid rgba(59,158,255,0.15)",
					borderRadius: "var(--radius-md)",
					display: "flex",
					gap: 10,
					alignItems: "flex-start",
				}}
			>
				<span style={{ fontSize: 14, flexShrink: 0 }}>💡</span>
				<p className="sf-text-xs sf-text-secondary">
					After connecting a delivery partner in{" "}
					<Link
						href="/dashboard/integrations"
						style={{ color: "var(--color-brand-400)", textDecoration: "underline" }}
					>
						Integrations
					</Link>
					, waybills will be auto-generated when you ship an order from the Orders page.
				</p>
			</div>
		</div>
	);
}
