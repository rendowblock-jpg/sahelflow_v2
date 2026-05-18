"use client";

import { Key, Loader2, Check, Copy } from "lucide-react";
import { useI18n } from "@/lib/i18n";

interface ApiKeysTabProps {
	apiKeys: { production: string; test: string };
	copiedKey: string | null;
	keyGenerating: boolean;
	onCopyKey: (key: string, label: string) => void;
	onGenerate: () => void;
}

export default function ApiKeysTab({
	apiKeys,
	copiedKey,
	keyGenerating,
	onCopyKey,
	onGenerate,
}: ApiKeysTabProps) {
	const { t } = useI18n();

	const keys = [
		{
			label: t.settings.productionKey,
			value: apiKeys.production,
			id: "production",
		},
		{ label: t.settings.testKey, value: apiKeys.test, id: "test" },
	];

	return (
		<div className="sf-card sf-flex-col sf-gap-lg">
			<h3 className="sf-settings-card-title">{t.settings.apiKeys}</h3>
			<p className="sf-text-sm-secondary">{t.settings.apiKeysDesc}</p>
			{keys.map((k) => (
				<div
					key={k.id}
					className="sf-card sf-card-muted"
				>
					<p className="sf-label">{k.label}</p>
					<div className="sf-flex sf-gap-sm sf-mt-sm">
						<input
							className="sf-input sf-text-mono sf-text-xs sf-flex-1 sf-tracking-tight"
							value={k.value ? `${k.value.slice(0, 8)}${"•".repeat(20)}` : "—"}
							readOnly
							dir="ltr"
						/>
						<button
							className="sf-btn sf-btn-ghost"
							disabled={!k.value}
							onClick={() => k.value && onCopyKey(k.value, k.id)}
						>
							{copiedKey === k.id ? <Check size={14} /> : <Copy size={14} />}
							{copiedKey === k.id ? t.common.copied : t.settings.copy}
						</button>
					</div>
				</div>
			))}
			<button
				className="sf-btn sf-btn-primary sf-self-start"
				onClick={onGenerate}
				disabled={keyGenerating}
			>
				{keyGenerating ? (
					<Loader2 size={16} className="sf-animate-spin" />
				) : (
					<Key size={16} />
				)}{" "}
				{keyGenerating ? t.common.loading : t.settings.generateNewKey}
			</button>
		</div>
	);
}
