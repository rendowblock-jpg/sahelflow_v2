"use client";

import { useI18n } from "@/lib/i18n";
import { Send, Check, AlertCircle, Loader2, Reply, X } from "lucide-react";
import type { InboxMessage } from "./types";
import type { RefObject } from "react";

interface Props {
	value: string;
	onChange: (value: string) => void;
	onSend: () => void;
	onKeyDown: (e: React.KeyboardEvent) => void;
	replyTo: InboxMessage | null;
	onClearReply: () => void;
	sending: boolean;
	sendStatus: "idle" | "success" | "error";
	channelOnline: boolean;
	inputRef: RefObject<HTMLTextAreaElement | null>;
}

export function ComposeArea({
	value,
	onChange,
	onSend,
	onKeyDown,
	replyTo,
	onClearReply,
	sending,
	sendStatus,
	channelOnline,
	inputRef,
}: Props) {
	const { t } = useI18n();

	return (
		<div className="inbox-chat__compose">
			{replyTo && (
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 8,
						padding: "6px 12px",
						background: "var(--color-surface-secondary)",
						borderBlockEnd: "1px solid var(--color-line-primary)",
						fontSize: 12,
						color: "var(--color-content-secondary)",
					}}
				>
					<Reply size={14} />
					<span
						style={{
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap",
							flex: 1,
						}}
					>
						{replyTo.content
							? replyTo.content.length > 60
								? replyTo.content.substring(0, 60) + "..."
								: replyTo.content
							: replyTo.content_type || "media"}
					</span>
					<button
						onClick={onClearReply}
						style={{
							background: "none",
							border: "none",
							cursor: "pointer",
							color: "var(--color-content-tertiary)",
							padding: 2,
						}}
					>
						<X size={14} />
					</button>
				</div>
			)}
			<textarea
				ref={inputRef}
				className="inbox-chat__input"
				placeholder={t.inbox.typeMessage}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				onKeyDown={onKeyDown}
				rows={1}
				disabled={!channelOnline}
				dir="auto"
			/>
			<button
				className="inbox-chat__send"
				onClick={onSend}
				disabled={!value.trim() || sending || !channelOnline}
				aria-label={t.common.sendMessage}
				style={
					sendStatus === "success"
						? { background: "#22c55e" }
						: sendStatus === "error"
							? { background: "#ef4444" }
							: undefined
				}
			>
				{sending ? (
					<Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} />
				) : sendStatus === "success" ? (
					<Check size={18} />
				) : sendStatus === "error" ? (
					<AlertCircle size={18} />
				) : (
					<Send size={18} />
				)}
			</button>
		</div>
	);
}
