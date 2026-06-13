"use client";

import { useI18n } from "@/lib/i18n";
import { Forward, Sparkles, FileText } from "lucide-react";
import type { InboxMessage } from "./types";
import { getContentIcon } from "./utils";

interface Props {
	message: InboxMessage;
	onDoubleClick: () => void;
	onForward: () => void;
}

export function MessageBubble({ message, onDoubleClick, onForward }: Props) {
	const { t } = useI18n();
	const directionClass =
		message.direction === "outbound" ? "inbox-msg--out" : "inbox-msg--in";
	const aiClass = message.is_ai_reply ? "inbox-msg--ai" : "";

	return (
		<div
			className={`inbox-msg ${directionClass} ${aiClass}`}
			onDoubleClick={onDoubleClick}
			title={t.inbox.replyHint || "Double-click to reply"}
		>
			{message.quoted_text && (
				<div className="inbox-quoted-text">
					{message.quoted_text}
				</div>
			)}
			{message.content_type !== "text" && (
				<div className="inbox-msg__media-badge">
					{getContentIcon(message.content_type)}
					<span>{message.content_type}</span>
				</div>
			)}
			{message.media_url && message.content_type === "image" && (
				<>
					{/* eslint-disable-next-line @next/next/no-img-element */}
					<img
						src={message.media_url}
						alt=""
						className="inbox-msg__media-img"
						loading="lazy"
					/>
				</>
			)}
			{message.media_url && message.content_type === "audio" && (
				<audio
					controls
					src={message.media_url}
					style={{ maxWidth: 260, height: 36 }}
					preload="metadata"
				/>
			)}
			{message.media_url && message.content_type === "video" && (
				<video
					controls
					src={message.media_url}
					style={{ maxWidth: 280, borderRadius: 8 }}
					preload="metadata"
				/>
			)}
			{message.media_url && message.content_type === "file" && (
				<a
					href={message.media_url}
					target="_blank"
					rel="noopener noreferrer"
					className="inbox-download-link"
				>
					<FileText
						size={14}
						style={{
							verticalAlign: "middle",
							marginInlineEnd: 4,
						}}
					/>
					{message.content || t.inbox.downloadFile || "Download file"}
				</a>
			)}
			{message.content && message.content_type === "text" && (
				<p className="inbox-msg__text">{message.content}</p>
			)}
			{message.content &&
				message.content_type !== "text" &&
				message.content_type !== "file" && (
					<p className="inbox-msg__text" style={{ fontSize: 12, marginTop: 4 }}>
						{message.content}
					</p>
				)}
			<span className="inbox-msg__time">
				{message.is_ai_reply && <Sparkles size={10} />}
				{new Date(message.created_at).toLocaleTimeString("en", {
					hour: "2-digit",
					minute: "2-digit",
				})}
			</span>
			{message.direction === "inbound" && message.content && (
				<button
					onClick={(e) => {
						e.stopPropagation();
						onForward();
					}}
					className="inbox-msg-forward-btn"
					title={t.inbox.forward || "Forward"}
				>
					<Forward size={12} />
				</button>
			)}
		</div>
	);
}
