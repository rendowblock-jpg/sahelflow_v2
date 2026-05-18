"use client";

import { useState, useEffect } from "react";
import { useI18n } from "@/lib/i18n";
import { Bot, Save, Check, Loader2 } from "lucide-react";
import { AgentConfig, DEFAULT_AGENT_CONFIG } from "@/lib/agents/types";
import AgentCard from "@/components/dashboard/agents/AgentCard";
import DeadLetterSection from "@/components/dashboard/agents/DeadLetterSection";
import { PageTransition } from "@/components/ui/motion";

export default function AgentsConfigPage() {
	const { t } = useI18n();
	const [config, setConfig] = useState<AgentConfig>(DEFAULT_AGENT_CONFIG);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [saved, setSaved] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		async function loadConfig() {
			try {
				const res = await fetch("/api/agents/config");
				if (!res.ok) throw new Error(t.common.error);
				const data = await res.json();
				setConfig((prev) => ({
					order: { ...prev.order, ...data.order },
					comm: { ...prev.comm, ...data.comm },
				}));
			} catch {
				setError(t.agents?.loadFailed || t.common.error);
			} finally {
				setLoading(false);
			}
		}
		loadConfig();
	}, [t.agents?.loadFailed, t.common.error]);

	async function handleSave() {
		setSaving(true);
		setSaved(false);
		setError(null);
		try {
			const res = await fetch("/api/agents/config", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ agent_config: config }),
			});
			if (!res.ok) throw new Error(t.common.error);
			setSaved(true);
			setTimeout(() => setSaved(false), 3000);
		} catch {
			setError(t.agents?.saveFailed || t.common.error);
		} finally {
			setSaving(false);
		}
	}

	if (loading) {
		return (
			<div className="sf-card sf-flex-center" style={{ minHeight: "50vh" }}>
				<Loader2
					className="sf-icon-spin"
					size={24}
					style={{ color: "var(--color-brand-400)" }}
				/>
			</div>
		);
	}

	return (
		<PageTransition className="sf-fade-in sf-flex-col-gap-xl sf-pb-xl">
			{/* Header */}
			<div className="sf-flex-between-start">
				<div>
					<h1 className="sf-page-title sf-flex-center-gap-sm">
						<Bot size={22} className="sf-text-brand" />
						{t.agents.title}
					</h1>
					<p className="sf-page-subtitle sf-mt-sm">{t.agents.subtitle}</p>
				</div>
				<div className="sf-flex-center-gap-md">
					{error && (
						<span className="sf-text-sm-secondary sf-text-danger">{error}</span>
					)}
					{saved && (
						<span className="sf-flex-center-gap-xs sf-text-sm-secondary sf-text-success">
							<Check size={16} /> {t.agents.saved}
						</span>
					)}
					<button
						className="sf-btn sf-btn-primary"
						onClick={handleSave}
						disabled={saving}
					>
						{saving ? (
							<Loader2 size={16} className="sf-icon-spin" />
						) : (
							<Save size={16} />
						)}
						{t.settings.saveChanges}
					</button>
				</div>
			</div>

			<div
				className="sf-grid-2"
				style={{
					gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))",
				}}
			>
				<AgentCard
					type="order"
					config={config.order}
					onToggle={(enabled) =>
						setConfig((prev) => ({
							...prev,
							order: { ...prev.order, enabled },
						}))
					}
					onUpdate={(updates) =>
						setConfig((prev) => ({
							...prev,
							order: { ...prev.order, ...updates },
						}))
					}
				/>
				<AgentCard
					type="comm"
					config={config.comm}
					onToggle={(enabled) =>
						setConfig((prev) => ({
							...prev,
							comm: { ...prev.comm, enabled },
						}))
					}
					onUpdate={(updates) =>
						setConfig((prev) => ({
							...prev,
							comm: { ...prev.comm, ...updates },
						}))
					}
				/>
			</div>

			<DeadLetterSection />
		</PageTransition>
	);
}
