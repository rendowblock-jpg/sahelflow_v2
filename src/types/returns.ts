/**
 * SahelFlow After-Sales & Returns Types
 */

export type ReturnStatus =
	| "requested" // Customer initiated
	| "approved" // Seller approved
	| "pickup" // Package being collected
	| "received" // Seller received package
	| "inspected" // Package inspected
	| "refunded" // Refund issued
	| "exchanged" // Exchange sent
	| "rejected" // Return denied
	| "closed"; // Case closed

export type ReturnReason =
	| "wrong_product"
	| "damaged"
	| "changed_mind"
	| "not_as_described"
	| "wrong_size"
	| "defective"
	| "late_delivery"
	| "other";

export type ReturnResolutionType = "refund" | "exchange" | "credit" | "reject";

export interface ReturnItem {
	product_id: string;
	product_name: string;
	quantity: number;
	price: number;
	cost_price?: number;
	variant_id?: string;
}

export interface Return {
	id: string;
	seller_id: string;
	order_id: string;
	customer_id: string | null;
	return_number: string;
	status: ReturnStatus;
	reason: ReturnReason;
	reason_details: string | null;
	resolution_type: ReturnResolutionType;
	refund_amount: number;
	exchange_order_id: string | null;
	items: ReturnItem[];
	photos: string[];
	return_tracking_id: string | null;
	return_delivery_company: string | null;
	requested_at: string;
	approved_at: string | null;
	received_at: string | null;
	resolved_at: string | null;
	created_at: string;
	updated_at: string;
	// Joined relations (from Supabase select with joins)
	notes?: ReturnNote[];
	order?: {
		id: string;
		order_number: string;
		items?: ReturnItem[];
		total_price: number;
		customer?: {
			id: string;
			name: string | null;
			phone: string | null;
			wilaya?: string | null;
			commune?: string | null;
			address?: string | null;
		} | null;
	} | null;
	customer?: {
		id: string;
		name: string | null;
		phone: string | null;
	} | null;
}

export interface ReturnNote {
	id: string;
	return_id: string;
	author_id: string | null;
	type: "note" | "status_change" | "system" | "customer";
	content: string;
	metadata: Record<string, unknown> | null;
	created_at: string;
}
