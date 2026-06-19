"use client";

import { useI18n } from "@/lib/i18n";

export default function BillingTab() {
	const { t } = useI18n();

	return (
		<div className="sf-card sf-flex-col sf-gap-lg">
			<h3 className="sf-settings-card-title">{t.settings.billingTitle}</h3>
			<div className="sf-card sf-card-brand-border sf-border-2">
				<div className="sf-flex-between">
					<div>
						<p className="sf-font-semibold">35,000 DZD</p>
						<p className="sf-settings-meta">
							"Lifetime Access — Pay once, use forever"
						</p>
					</div>
					<span className="sf-badge sf-badge-success">
						"Lifetime"
					</span>
				</div>
			</div>
			<p className="sf-settings-meta" style={{ opacity: 0.7 }}>
				"One payment, no recurring fees. All features included. Contact support to upgrade."
			</p>
		</div>
	);
}
