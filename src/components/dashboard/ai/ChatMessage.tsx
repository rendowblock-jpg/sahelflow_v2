"use client";

import { Bot, RotateCcw } from "lucide-react";

interface ActionCard {
	type: "success" | "info" | "data";
	title: string;
	description?: string;
}

interface ChatMessageProps {
	id: string;
	role: "user" | "assistant";
	content: string;
	isError?: boolean;
	actionCards?: ActionCard[];
	lastFailedMessage: string | null;
	onRetry: (text: string) => void;
}

// Sanitize AI response — strip leftover tool/json code blocks before rendering
function sanitizeAIResponse(text: string): string {
	text = text.replace(/```tool[\s\S]*?```/g, "");
	text = text.replace(/```json\s*([\s\S]*?)```/g, (_match, content) => {
		try {
			const parsed = JSON.parse(content.trim());
			return Object.entries(parsed)
				.map(([k, v]) => `• **${k}**: ${JSON.stringify(v)}`)
				.join("\n");
		} catch {
			return content.trim();
		}
	});
	text = text.replace(/```[\w]*\s*([\s\S]*?)```/g, "$1");
	return text.trim();
}

function applyInlineFormatting(text: string): React.ReactNode {
	const parts = text.split(/(\*\*[^*]+\*\*|__[^_]+__)/g);
	return parts.map((part, i) => {
		if (part.startsWith("**") && part.endsWith("**")) {
			return (
				<strong key={i} className="sf-text-primary sf-font-semibold">
					{part.slice(2, -2)}
				</strong>
			);
		}
		if (part.startsWith("__") && part.endsWith("__")) {
			return <strong key={i}>{part.slice(2, -2)}</strong>;
		}
		return part;
	});
}

function renderMarkdown(text: string) {
	const clean = sanitizeAIResponse(text);
	const lines = clean.split("\n");
	const elements: React.ReactNode[] = [];

	lines.forEach((line, i) => {
		if (line.trim() === "") {
			elements.push(<br key={`br-${i}`} />);
			return;
		}
		const bulletMatch = line.match(/^(\s*)[•\-\*]\s+(.*)/);
		if (bulletMatch) {
			const indent = bulletMatch[1].length > 0 ? 12 : 0;
			elements.push(
				<div
					key={i}
					className="sf-flex sf-gap-sm"
					style={{ marginLeft: indent, marginTop: 2 }}
				>
					<span className="sf-text-brand sf-flex-shrink-0">•</span>
					<span>{applyInlineFormatting(bulletMatch[2])}</span>
				</div>,
			);
			return;
		}
		const numMatch = line.match(/^(\d+)[.)]\s+(.*)/);
		if (numMatch) {
			elements.push(
				<div key={i} className="sf-flex sf-gap-sm" style={{ marginTop: 2 }}>
					<span
						className="sf-text-brand sf-font-semibold sf-flex-shrink-0"
						style={{ minWidth: 16 }}
					>
						{numMatch[1]}.
					</span>
					<span>{applyInlineFormatting(numMatch[2])}</span>
				</div>,
			);
			return;
		}
		elements.push(
			<div key={i} style={{ marginTop: i > 0 ? 2 : 0 }}>
				{applyInlineFormatting(line)}
			</div>,
		);
	});

	return <>{elements}</>;
}

export default function ChatMessageComponent({
	role,
	content,
	isError,
	actionCards,
	lastFailedMessage,
	onRetry,
}: ChatMessageProps) {
	return (
		<div>
			<div
				className={`sf-ai-msg-row ${role === "user" ? "sf-ai-msg-row--user" : ""}`}
			>
				{role === "assistant" && (
					<div
						className={`sf-ai-msg-avatar ${isError ? "sf-ai-msg-avatar--error" : "sf-ai-msg-avatar--assistant"}`}
					>
						<Bot size={14} color="white" />
					</div>
				)}
				<div
					className={`sf-ai-msg-bubble ${role === "user" ? "sf-ai-msg-bubble--user" : isError ? "sf-ai-msg-bubble--error" : "sf-ai-msg-bubble--assistant"}`}
				>
					{role === "assistant" ? renderMarkdown(content) : content}
				</div>
			</div>

			{isError && lastFailedMessage && (
				<button
					className="sf-ai-retry-btn"
					onClick={() => onRetry(lastFailedMessage)}
				>
					<RotateCcw size={12} /> Retry
				</button>
			)}

			{actionCards?.map((card, i) => (
				<div
					key={i}
					className={`sf-ai-action-card ${card.type === "success" ? "sf-ai-action-card--success" : ""}`}
				>
					<div className="sf-flex-center-gap-sm sf-mb-sm">
						<span className="sf-text-base">
							{card.type === "success"
								? "✅"
								: card.type === "data"
									? "📊"
									: "ℹ️"}
						</span>
						<span className="sf-font-semibold sf-text-primary">
							{card.title}
						</span>
					</div>
					{card.description && (
						<p className="sf-text-xs-tertiary">{card.description}</p>
					)}
				</div>
			))}
		</div>
	);
}
