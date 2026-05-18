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
				<div className="sf-flex-between" style={{ marginBottom: 16 }}>
					<h2 style={{ fontSize: 16, fontWeight: 700 }}>{t.inbox.forwardTo}</h2>
					<button
						onClick={onClose}
						className="sf-btn sf-btn-ghost"
						style={{ padding: 6 }}
					>
						<X size={18} />
					</button>
				</div>
				<div
					style={{
						maxHeight: 300,
						overflow: "auto",
						display: "flex",
						flexDirection: "column",
						gap: 2,
					}}
				>
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
								style={{
									display: "flex",
									alignItems: "center",
									gap: 10,
									padding: "8px 12px",
									borderRadius: 8,
									border: "none",
									background: "transparent",
									cursor: "pointer",
									fontFamily: "inherit",
									textAlign: "start",
									width: "100%",
								}}
							>
								<div
									style={{
										width: 32,
										height: 32,
										borderRadius: "50%",
										background: "var(--color-surface-tertiary)",
										display: "flex",
										alignItems: "center",
										justifyContent: "center",
										fontSize: 13,
										fontWeight: 700,
										color: "var(--color-content-secondary)",
										flexShrink: 0,
									}}
								>
									{getContactName(c).charAt(0).toUpperCase()}
								</div>
								<div style={{ minWidth: 0 }}>
									<p style={{ fontWeight: 500, fontSize: 13 }}>
										{getContactName(c)}
									</p>
									<p
										style={{
											fontSize: 11,
											color: "var(--color-content-tertiary)",
											overflow: "hidden",
											textOverflow: "ellipsis",
											whiteSpace: "nowrap",
										}}
									>
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
