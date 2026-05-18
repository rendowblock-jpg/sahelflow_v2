"use client";

import { Bot, Loader2 } from "lucide-react";

interface ThinkingIndicatorProps {
	stage: number;
	labels: {
		analyzing: string;
		thinking: string;
		preparing: string;
	};
}

export default function ThinkingIndicator({
	stage,
	labels,
}: ThinkingIndicatorProps) {
	const text =
		stage === 0
			? labels.analyzing
			: stage === 1
				? labels.thinking
				: labels.preparing;

	return (
		<div className="sf-ai-msg-row sf-flex-center-gap-md">
			<div className="sf-ai-msg-avatar sf-ai-msg-avatar--assistant">
				<Bot size={14} color="white" />
			</div>
			<div className="sf-ai-msg-bubble sf-ai-msg-bubble--assistant sf-flex-center-gap-sm">
				<Loader2 size={14} className="sf-animate-spin sf-text-brand" />
				<span className="sf-text-xs-secondary sf-transition-opacity">
					{text}
				</span>
			</div>
		</div>
	);
}
