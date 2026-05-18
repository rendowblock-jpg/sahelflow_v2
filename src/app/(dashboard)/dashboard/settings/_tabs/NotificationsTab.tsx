"use client";

import { Save } from "lucide-react";
import { useI18n } from "@/lib/i18n";

interface NotificationsTabProps {
	notifs: Record<string, boolean>;
	setNotifs: (updater: (prev: Record<string, boolean>) => Record<string, boolean>) => void;
	notifSaving: boolean;
	onSave: () => void;
}

export default function NotificationsTab({
	notifs,
	setNotifs,
	notifSaving,
	onSave,
}: NotificationsTabProps) {
	const { t } = useI18n();

	const items = [
		{
			key: "newOrders",
			label: t.settings.newOrders,
			desc: t.settings.newOrdersDesc,
		},
		{
			key: "confirmations",
			label: t.settings.orderConfirmations,
			desc: t.settings.orderConfirmationsDesc,
		},
		{
			key: "highRisk",
			label: t.settings.highRiskAlerts,
			desc: t.settings.highRiskAlertsDesc,
		},
		{
			key: "lowStock",
			label: t.settings.lowStockWarnings,
			desc: t.settings.lowStockWarningsDesc,
		},
		{
			key: "delivery",
			label: t.settings.deliveryUpdates,
			desc: t.settings.deliveryUpdatesDesc,
		},
		{
			key: "weekly",
			label: t.settings.weeklyReport,
			desc: t.settings.weeklyReportDesc,
		},
	];

	return (
		<div className="sf-card sf-flex-col sf-gap-lg">
			<h3 className="sf-settings-card-title">
				{t.settings.notificationsSection}
			</h3>
			{items.map((n) => (
				<div key={n.key} className="sf-settings-block">
					<div>
						<p className="sf-settings-block-label">{n.label}</p>
						<p className="sf-settings-block-desc">{n.desc}</p>
					</div>
					<div
						className={`sf-toggle ${notifs[n.key] ? "sf-toggle-active" : ""}`}
						onClick={() =>
							setNotifs((prev) => ({ ...prev, [n.key]: !prev[n.key] }))
						}
					/>
				</div>
			))}
			<button
				className="sf-btn sf-btn-primary sf-self-start"
				onClick={onSave}
				disabled={notifSaving}
			>
				<Save size={16} />{" "}
				{notifSaving ? t.common.loading : t.settings.saveChanges}
			</button>
		</div>
	);
}
