import { Image as ImageIcon, Mic, FileText } from "lucide-react";
import type { InboxConversation } from "./types";

export function getContactName(
	convo: InboxConversation,
	fallback = "Unknown",
): string {
	if (convo.customer?.name) return convo.customer.name;
	if (convo.customer?.phone) {
		const phone = convo.customer.phone;
		return phone.startsWith("213") ? "0" + phone.slice(3) : phone;
	}
	return convo.platform_thread_id || fallback;
}

export function getContactInitial(name: string): string {
	return name.charAt(0).toUpperCase();
}

export function getContentIcon(type: string) {
	switch (type) {
		case "image":
			return <ImageIcon size={14} />;
		case "audio":
			return <Mic size={14} />;
		case "video":
			return <ImageIcon size={14} />;
		case "file":
			return <FileText size={14} />;
		default:
			return null;
	}
}
