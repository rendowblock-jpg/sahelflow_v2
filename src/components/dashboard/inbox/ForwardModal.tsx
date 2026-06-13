"use client";

import { X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { InboxConversation, InboxMessage } from "./types";
import { getContactName } from "./utils";

interface Props {
	isOpen: boolean;
	conversations: InboxConversation[];
	activeConvoId: string | null;
	messageToForward: InboxMessage | null;
	onForward: (conversationId: string, text: string) => Promise<void>;
	onClose: () => void;
}

export function ForwardModal({
	isOpen,
	conversations,
	activeConvoId,
	messageToForward,
	onForward,
	onClose,
}: Props) {
	const { t } = useI18n();
	if (!isOpen || !messageToForward) return null;

	return (
		<div className="sf-modal-backdrop" onClick={onClose}>
			<div
				className="sf-modal"
				onClick={(e) => e.stopPropagation()}
				style={{ maxWidth: 400, maxHeight: "70vh" }}
			>
				<div className="inbox-forward-modal-header">
					<h2 className="inbox-forward-modal-title">{t.inbox.forwardTo}</h2>
					<button
						onClick={onClose}
						className="sf-btn sf-btn-ghost"
						style={{ padding: 6 }}
					>
						<X size={18} />
					</button>
				</div>
				<div className="inbox-forward-modal-list">
					{conversations
						.filter((c) => c.id !== activeConvoId && !c.is_archived)
						.map((c) => (
							<button
								key={c.id}
								onClick={async () => {
									const text = `↗️ ${t.inbox.forward || "Forwarded"}:\n${messageToForward.content || ""}`;
									await onForward(c.id, text);
									onClose();
								}}
								className="inbox-forward-recipient-btn"
							>
								<div className="inbox-forward-recipient-avatar">
									{getContactName(c).charAt(0).toUpperCase()}
								</div>
								<div style={{ minWidth: 0 }}>
									<p className="inbox-forward-recipient-name">
										{getContactName(c)}
									</p>
									<p className="inbox-forward-recipient-preview">
										{c.last_message_preview?.substring(0, 40) ||
											c.customer?.phone ||
											""}
									</p>
								</div>
							</button>
						))}
				</div>
			</div>
		</div>
	);
}
