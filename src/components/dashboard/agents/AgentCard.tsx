"use client";

import { useI18n } from "@/lib/i18n";
import type { AgentConfig } from "@/lib/agents/types";
import { AlertCircle } from "lucide-react";

interface AgentCardProps {
	type: "order" | "comm";
	config: AgentConfig["order"] | AgentConfig["comm"];
	onToggle: (enabled: boolean) => void;
	onUpdate: (
		updates: Partial<AgentConfig["order"] | AgentConfig["comm"]>,
	) => void;
}

export default function AgentCard({
	type,
	config,
	onToggle,
	onUpdate,
}: AgentCardProps) {
	const { t } = useI18n();
	const isOrder = type === "order";
	const orderCfg = isOrder ? (config as AgentConfig["order"]) : null;

	return (
		<div className="sf-card sf-flex-col-gap-lg">
			<div className="sf-agent-card-header">
				<div className="sf-agent-card-title-wrap">
					<div
						className={isOrder ? "sf-icon-tint-brand" : "sf-icon-tint-accent"}
					>
						{isOrder ? (
							<svg
								width="18"
								height="18"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
								<path d="m9 12 2 2 4-4" />
							</svg>
						) : (
							<svg
								width="18"
								height="18"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
							</svg>
						)}
					</div>
					<div>
						<h3 className="sf-heading-sm">
							{isOrder ? t.agents.orderAgent : t.agents.commAgent}
						</h3>
						<span className="sf-text-xs-tertiary">
							{isOrder ? t.agents.orderAgentDesc : t.agents.commAgentDesc}
						</span>
					</div>
				</div>
				<label className="sf-switch">
					<input
						type="checkbox"
						checked={config.enabled}
						onChange={(e) => onToggle(e.target.checked)}
					/>
					<span className="sf-slider" />
				</label>
			</div>

			{!config.enabled && (
				<div className="sf-info-box">
					{isOrder ? t.agents.orderAgentDisabled : t.agents.commAgentDisabled}
				</div>
			)}

			{config.enabled && (
				<div className="sf-agent-card-body">
					{isOrder && orderCfg && (
						<>
							<div>
								<div className="sf-agent-card-range">
									<label className="sf-label sf-p-0 sf-mb-sm">
										{t.agents.autoConfirmThreshold}
									</label>
									<span className="sf-threshold-value sf-threshold-value--accent">
										{orderCfg.auto_confirm_threshold}%
									</span>
								</div>
								<input
									type="range"
									min="0"
									max="100"
									value={orderCfg.auto_confirm_threshold}
									onChange={(e) =>
										onUpdate({
											auto_confirm_threshold: parseInt(e.target.value),
										})
									}
									className="sf-range"
								/>
								<p className="sf-help-text">
									{t.agents.autoConfirmThresholdDesc}
								</p>
							</div>

							<div>
								<div className="sf-agent-card-range">
									<label className="sf-label sf-p-0 sf-mb-sm">
										{t.agents.autoRejectThreshold}
									</label>
									<span className="sf-threshold-value sf-threshold-value--danger">
										{orderCfg.auto_reject_threshold}%
									</span>
								</div>
								<input
									type="range"
									min="0"
									max="100"
									value={orderCfg.auto_reject_threshold}
									onChange={(e) =>
										onUpdate({
											auto_reject_threshold: parseInt(e.target.value),
										})
									}
									className="sf-range sf-range--danger"
								/>
								<p className="sf-help-text">
									{t.agents.autoRejectThresholdDesc}
								</p>
							</div>

							<label className="sf-check-label sf-mt-md">
								<input
									type="checkbox"
									checked={orderCfg.require_full_address}
									onChange={(e) =>
										onUpdate({ require_full_address: e.target.checked })
									}
								/>
								{t.agents.requireFullAddress}
							</label>
						</>
					)}

					{!isOrder && (
						<>
							<label className="sf-check-label--top">
								<input
									type="checkbox"
									checked={(config as AgentConfig["comm"]).auto_extract}
									onChange={(e) => onUpdate({ auto_extract: e.target.checked })}
								/>
								<div>
									<strong>{t.agents.autoExtract}</strong>
									<p className="sf-help-text sf-mt-sm">
										{t.agents.autoExtractDesc}
									</p>
								</div>
							</label>

							<label className="sf-check-label--top">
								<input
									type="checkbox"
									checked={(config as AgentConfig["comm"]).suggest_replies}
									onChange={(e) =>
										onUpdate({ suggest_replies: e.target.checked })
									}
								/>
								<div>
									<strong>{t.agents.suggestReplies}</strong>
									<p className="sf-help-text sf-mt-sm">
										{t.agents.suggestRepliesDesc}
									</p>
								</div>
							</label>

							<div className="sf-alert-warn">
								<AlertCircle size={16} className="sf-alert-warn__icon" />
								<div className="sf-alert-warn__text">
									<strong>{t.agents.autoSendDisabledTitle}</strong>
									<p className="sf-mt-sm">{t.agents.autoSendDisabledDesc}</p>
								</div>
							</div>
						</>
					)}
				</div>
			)}
		</div>
	);
}
