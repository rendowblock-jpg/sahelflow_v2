"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n";

export default function DeliverySettingsTab() {
	const { t } = useI18n();

	return (
		<div className="sf-card sf-flex-col sf-gap-lg">
			<h3 className="sf-settings-card-title">{t.settings.deliverySettings}</h3>
			<div
				className="sf-card sf-card-muted"
			>
				<div className="sf-flex-between">
					<div className="sf-flex-center-gap-md">
						<span className="sf-text-lg">📦</span>
						<div>
							<p className="sf-font-semibold">Yalidine</p>
							<p className="sf-settings-meta">Algerian delivery & tracking</p>
						</div>
					</div>
					<Link
						href="/dashboard/integrations"
						className="sf-btn sf-btn-primary sf-text-sm sf-no-underline" >
						{t.settings.integrations}
					</Link>
				</div>
			</div>
			<p className="sf-text-xs-tertiary">{t.settings.deliveryNote}</p>
		</div>
	);
}
