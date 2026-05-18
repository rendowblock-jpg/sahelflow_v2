"use client";

import { useI18n } from "@/lib/i18n";
import type { InboxConversation } from "./types";
import { getContactName, getContactInitial } from "./utils";

interface Props {
	conversation: InboxConversation;
	isActive: boolean;
	onClick: () => void;
}

export function ConversationItem({ conversation, isActive, onClick }: Props) {
	const { t, formatTimeAgo } = useI18n();
	const name = getContactName(conversation, t.inbox.unknownContact);
	const initial = getContactInitial(name);

	return (
		<button
			className={`inbox-convo ${isActive ? "inbox-convo--active" : ""}`}
			onClick={onClick}
		>
			<div
				className="inbox-convo__avatar"
				style={{
					background: conversation.is_pinned
						? "var(--color-brand-500)"
						: "var(--color-surface-tertiary)",
					color: conversation.is_pinned
						? "white"
						: "var(--color-content-secondary)",
					fontSize: 16,
					fontWeight: 700,
				}}
			>
				{initial}
			</div>
			<div className="inbox-convo__info">
				<div className="inbox-convo__top">
					<span className="inbox-convo__name">
						{conversation.is_pinned && "📌 "}
						{name}
					</span>
					<span className="inbox-convo__time">
						{formatTimeAgo(conversation.last_message_at)}
					</span>
				</div>
				<div className="inbox-convo__bottom">
					<span
						className="inbox-convo__preview"
						style={{
							fontSize: 12,
							color: "var(--color-content-tertiary)",
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap",
							flex: 1,
						}}
					>
						{conversation.last_message_preview
							? conversation.last_message_preview.length > 40
								? conversation.last_message_preview.substring(0, 40) + "..."
								: conversation.last_message_preview
							: conversation.customer?.phone || ""}
					</span>
					{(conversation.labels || []).length > 0 && (
						<span
							style={{
								fontSize: 10,
								padding: "1px 6px",
								borderRadius: 4,
								background: "rgba(99,102,241,0.1)",
								color: "var(--color-brand-400)",
								marginInlineEnd: 4,
							}}
						>
							{(conversation.labels || [])[0]}
						</span>
					)}
					{conversation.unread_count > 0 && (
						<span className="inbox-badge">{conversation.unread_count}</span>
					)}
				</div>
			</div>
		</button>
	);
}
