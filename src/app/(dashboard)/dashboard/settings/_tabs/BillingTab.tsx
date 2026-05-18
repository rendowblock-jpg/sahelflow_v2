"use client";

import { useI18n } from "@/lib/i18n";

export default function BillingTab() {
	const { t } = useI18n();

	return (
		<div className="sf-card sf-flex-col sf-gap-lg">
			<h3 className="sf-settings-card-title">{t.settings.billingTitle}</h3>
			<div
				className="sf-card sf-card-muted sf-card-brand-border sf-border-2"
			>
				<div className="sf-flex-between">
					<div>
						<p className="sf-font-semibold">Starter</p>
						<p className="sf-settings-meta">{t.settings.currentPlan}</p>
					</div>
					<span className="sf-badge sf-badge-success">{t.settings.free}</span>
				</div>
			</div>
			<div className="sf-flex-col sf-gap-md">
				{["Pro", "Enterprise"].map((plan) => (
					<div
						key={plan}
						className="sf-card sf-card-muted"
					>
						<div className="sf-flex-between">
							<div>
								<p className="sf-font-semibold">{plan}</p>
								<p className="sf-settings-meta">
									{plan === "Pro" ? "2,900 DA" : "9,900 DA"}
									{t.settings.perMonth}
								</p>
							</div>
							<button
								className="sf-btn sf-btn-ghost sf-text-sm"
								disabled
								title="Coming soon"
							>
								{t.settings.upgrade}
							</button>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
