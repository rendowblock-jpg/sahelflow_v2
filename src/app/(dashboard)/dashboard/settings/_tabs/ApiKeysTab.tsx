"use client";

import { Key, Loader2, Check, Copy, Eye, EyeOff, AlertTriangle, RefreshCw } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useState } from "react";

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
	const [revealedKeys, setRevealedKeys] = useState<Record<string, boolean>>({});

	const toggleReveal = (id: string) =>
		setRevealedKeys((prev) => ({ ...prev, [id]: !prev[id] }));

	const maskKey = (key: string) => {
		if (!key) return "—";
		return `${key.slice(0, 8)}${"•".repeat(22)}`;
	};

	const keys = [
		{
			label: t.settings.productionKey || "Production Key",
			value: apiKeys.production,
			id: "production",
			hint: "Use in your live store and production integrations.",
		},
		{
			label: t.settings.testKey || "Test Key",
			value: apiKeys.test,
			id: "test",
			hint: "Use for development and testing only. Will not process real orders.",
		},
	];

	return (
		<div className="sf-flex-col sf-gap-lg sf-animate-fade">
			{/* Security Warning Banner */}
			<div className="sf-security-banner">
				<AlertTriangle size={15} style={{ color: "var(--color-warn-400)", flexShrink: 0, marginTop: "1px" }} />
				<div>
					<p className="sf-font-medium" style={{ fontSize: "12px", color: "var(--color-warn-400)", marginBottom: "2px" }}>
						Keep your API keys secure
					</p>
					<span>
						Never share your API keys publicly or commit them to source control. Treat them
						like passwords. If a key is compromised, regenerate it immediately.
					</span>
				</div>
			</div>

			{/* API Key Cards */}
			<div className="sf-settings-section">
				<div className="sf-settings-section-header">
					<h3 className="sf-settings-section-title">{t.settings.apiKeys}</h3>
					<p className="sf-settings-section-desc">{t.settings.apiKeysDesc}</p>
				</div>

				<div className="sf-settings-section-body sf-gap-lg">
					{keys.map((k) => (
						<div key={k.id}>
							<div className="sf-flex sf-items-center sf-gap-sm" style={{ marginBottom: "8px" }}>
								<div className="sf-icon-box-sm sf-icon-brand">
									<Key size={12} />
								</div>
								<p className="sf-font-semibold sf-text-sm">{k.label}</p>
							</div>
							<p className="sf-text-xs sf-text-tertiary" style={{ marginBottom: "10px" }}>
								{k.hint}
							</p>
							<div className="sf-api-key-wrap">
								<div className="sf-api-key-value sf-text-mono" dir="ltr">
									{k.value
										? revealedKeys[k.id]
											? k.value
											: maskKey(k.value)
										: "No key generated"}
								</div>
								<button
									type="button"
									onClick={() => toggleReveal(k.id)}
									style={{
										background: "none",
										border: "none",
										cursor: "pointer",
										color: "var(--color-content-tertiary)",
										padding: "2px 4px",
										flexShrink: 0,
									}}
									title={revealedKeys[k.id] ? "Hide" : "Reveal"}
								>
									{revealedKeys[k.id] ? <EyeOff size={14} /> : <Eye size={14} />}
								</button>
								<button
									className="sf-btn sf-btn-ghost"
									style={{ padding: "4px 10px", minHeight: "28px", fontSize: "12px", flexShrink: 0 }}
									disabled={!k.value}
									onClick={() => k.value && onCopyKey(k.value, k.id)}
								>
									{copiedKey === k.id ? (
										<Check size={13} className="sf-text-success" />
									) : (
										<Copy size={13} />
									)}
									{copiedKey === k.id ? t.common.copied : t.settings.copy}
								</button>
							</div>
							<div className="sf-api-key-meta">
								<span>Created automatically when your account was set up</span>
								<span>•</span>
								<span>Last used: Never</span>
							</div>
						</div>
					))}
				</div>

				<div className="sf-settings-section-footer" style={{ justifyContent: "space-between" }}>
					<p className="sf-text-xs sf-text-tertiary">
						Regenerating will invalidate all existing keys immediately.
					</p>
					<button
						className="sf-btn sf-btn-ghost"
						onClick={onGenerate}
						disabled={keyGenerating}
						style={{ borderColor: "var(--color-danger-400)", color: "var(--color-danger-400)" }}
					>
						{keyGenerating ? (
							<Loader2 size={14} className="sf-animate-spin" style={{ marginInlineEnd: "6px" }} />
						) : (
							<RefreshCw size={14} style={{ marginInlineEnd: "6px" }} />
						)}
						{keyGenerating ? t.common.loading : t.settings.generateNewKey}
					</button>
				</div>
			</div>
		</div>
	);
}
