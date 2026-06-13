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
				<div className="inbox-compose-reply-bar">
					<Reply size={14} />
					<span className="inbox-compose-reply-preview">
						{replyTo.content
							? replyTo.content.length > 60
								? replyTo.content.substring(0, 60) + "..."
								: replyTo.content
							: replyTo.content_type || "media"}
					</span>
					<button
						onClick={onClearReply}
						className="inbox-compose-reply-close"
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
				className={`inbox-chat__send ${
					sendStatus === "success"
						? "inbox-chat__send--success"
						: sendStatus === "error"
							? "inbox-chat__send--error"
							: ""
				}`}
				onClick={onSend}
				disabled={!value.trim() || sending || !channelOnline}
				aria-label={t.common.sendMessage}
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
