"use client";

import { Save, ShoppingCart, Users, Bell } from "lucide-react";
import { useI18n } from "@/lib/i18n";

interface NotificationsTabProps {
	notifs: Record<string, boolean>;
	setNotifs: (updater: (prev: Record<string, boolean>) => Record<string, boolean>) => void;
	notifSaving: boolean;
	onSave: () => void;
}

const NOTIF_GROUPS = [
	{
		group: "Orders",
		icon: ShoppingCart,
		color: "sf-icon-brand",
		items: [
			{ key: "newOrders", labelKey: "newOrders", descKey: "newOrdersDesc" },
			{ key: "confirmations", labelKey: "orderConfirmations", descKey: "orderConfirmationsDesc" },
			{ key: "delivery", labelKey: "deliveryUpdates", descKey: "deliveryUpdatesDesc" },
		],
	},
	{
		group: "Customers",
		icon: Users,
		color: "sf-icon-warning",
		items: [
			{ key: "highRisk", labelKey: "highRiskAlerts", descKey: "highRiskAlertsDesc" },
			{ key: "lowStock", labelKey: "lowStockWarnings", descKey: "lowStockWarningsDesc" },
		],
	},
	{
		group: "System",
		icon: Bell,
		color: "sf-icon-success",
		items: [
			{ key: "weekly", labelKey: "weeklyReport", descKey: "weeklyReportDesc" },
		],
	},
];

export default function NotificationsTab({
	notifs,
	setNotifs,
	notifSaving,
	onSave,
}: NotificationsTabProps) {
	const { t } = useI18n();

	return (
		<div className="sf-settings-section sf-animate-fade">
			<div className="sf-settings-section-header">
				<h3 className="sf-settings-section-title">{t.settings.notificationsSection}</h3>
				<p className="sf-settings-section-desc">
					Choose which events trigger notifications for your store.
				</p>
			</div>

			<div className="sf-settings-section-body sf-gap-lg">
				{NOTIF_GROUPS.map(({ group, icon: Icon, color, items }) => (
					<div key={group} className="sf-notif-group">
						<div className="sf-notif-group-header">
							<div className={`sf-icon-box-sm ${color}`}>
								<Icon size={13} />
							</div>
							{group}
						</div>
						{items.map((item) => {
							const label = t.settings[item.labelKey as keyof typeof t.settings] as string;
							const desc = t.settings[item.descKey as keyof typeof t.settings] as string;
							return (
								<div key={item.key} className="sf-notif-item">
									<div className="sf-notif-item__info">
										<p className="sf-notif-item__title">{label}</p>
										{desc && <p className="sf-notif-item__desc">{desc}</p>}
									</div>
									<div
										className={`sf-toggle ${notifs[item.key] ? "sf-toggle-active" : ""}`}
										onClick={() =>
											setNotifs((prev) => ({ ...prev, [item.key]: !prev[item.key] }))
										}
									/>
								</div>
							);
						})}
					</div>
				))}
			</div>

			<div className="sf-settings-section-footer">
				<button
					className="sf-btn sf-btn-primary"
					onClick={onSave}
					disabled={notifSaving}
				>
					<Save size={14} style={{ marginInlineEnd: "6px" }} />
					{notifSaving ? t.common.loading : t.settings.saveChanges}
				</button>
			</div>
		</div>
	);
}
