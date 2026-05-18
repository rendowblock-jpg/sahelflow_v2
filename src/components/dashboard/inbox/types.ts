export interface InboxConversation {
	id: string;
	customer_id: string | null;
	platform_thread_id: string;
	status: string;
	unread_count: number;
	last_message_at: string;
	last_message_preview?: string | null;
	is_pinned?: boolean;
	is_archived?: boolean;
	labels?: string[];
	customer?: { id: string; name: string | null; phone: string | null } | null;
	channel?: { id: string; name: string | null; active: boolean } | null;
}

export interface InboxMessage {
	id: string;
	conversation_id: string;
	direction: "inbound" | "outbound";
	content: string | null;
	content_type: string;
	media_url: string | null;
	is_ai_reply: boolean;
	created_at: string;
	reply_to_id?: string | null;
	quoted_text?: string | null;
}

export interface InboxDraftOrder {
	id: string;
	order_number: string;
	items: { name: string; quantity: number; price: number }[];
	total_price: number;
	delivery_cost: number;
	wilaya: string;
}
