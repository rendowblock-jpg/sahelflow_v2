"use client";

import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";

export default function IntegrationsTab() {
	const { t } = useI18n();

	return (
		<div className="sf-card sf-flex-col sf-gap-lg">
			<h3 className="sf-settings-card-title">{t.settings.integrations}</h3>
			<div
				className="sf-card sf-card-muted sf-card-brand-border"
			>
				<div className="sf-flex-between">
					<div>
						<p className="sf-font-semibold">🔗 {t.integrations.title}</p>
						<p className="sf-settings-hint">{t.integrations.subtitle}</p>
					</div>
					<Link
						href="/dashboard/integrations"
						className="sf-btn sf-btn-primary sf-text-sm sf-no-underline" >
						<ExternalLink size={14} /> {t.common.viewAll}
					</Link>
				</div>
			</div>
			<p className="sf-text-xs-tertiary">{t.settings.integrationsNote}</p>
		</div>
	);
}
