/**
 * SahelFlow Returns Service
 * Client-side returns CRUD, status transitions, exchange order creation, and notes.
 */

import { getSupabase } from "./supabase-helpers";
import { getCurrentUser, getActiveSellerId } from "./auth-service";
import { calculateDeliveryCost } from "./shipping-calculator";
import type {
	ReturnResolutionType,
	ReturnReason,
	ReturnStatus,
	ReturnItem,
	ReturnNote,
} from "@/types";

export interface GetReturnsOptions {
	status?: string;
	limit?: number;
	offset?: number;
}

export async function getReturns(options?: GetReturnsOptions) {
	const status = options?.status;
	const limit = options?.limit ?? 50;
	const offset = options?.offset ?? 0;

	let query = getSupabase()
		.from("returns")
		.select(
			"*, order:orders!inner(id, order_number, customer:customers(id, name, phone))",
			{
				count: "exact",
			},
		)
		.is("deleted_at", null)
		.order("created_at", { ascending: false })
		.range(offset, offset + limit - 1);

	if (status && status !== "all") {
		query = query.eq("status", status);
	}

	const { data, error, count } = await query;
	if (error) throw error;
	return { data: data || [], total: count ?? 0 };
}

export async function getReturn(id: string) {
	const { data, error } = await getSupabase()
		.from("returns")
		.select(
			"*, order:orders(id, order_number, items, total_price, customer:customers(*))",
		)
		.eq("id", id)
		.is("deleted_at", null)
		.single();

	if (error) throw error;

	// Fetch return notes
	const { data: notes, error: notesError } = await getSupabase()
		.from("return_notes")
		.select("*")
		.eq("return_id", id)
		.order("created_at", { ascending: true });

	if (notesError) throw notesError;

	return {
		...data,
		notes: notes || [],
	};
}

export async function createReturn(params: {
	orderId: string;
	type: "return" | "exchange" | "refund";
	reason: ReturnReason;
	reason_details?: string;
	resolution_type: ReturnResolutionType;
	refund_amount?: number;
	items: ReturnItem[];
	photos?: string[];
	return_tracking_id?: string;
	return_delivery_company?: string;
}) {
	const sellerId = await getActiveSellerId();

	// Get order customer_id
	const { data: orderData, error: orderError } = await getSupabase()
		.from("orders")
		.select("customer_id")
		.eq("id", params.orderId)
		.single();

	if (orderError)
		throw new Error(`Failed to find original order: ${orderError.message}`);

	const { data, error } = await getSupabase()
		.from("returns")
		.insert({
			seller_id: sellerId,
			order_id: params.orderId,
			customer_id: orderData.customer_id,
			reason: params.reason,
			reason_details: params.reason_details || null,
			resolution_type: params.resolution_type,
			refund_amount: params.refund_amount || 0,
			items: params.items,
			photos: params.photos || [],
			return_tracking_id: params.return_tracking_id || null,
			return_delivery_company: params.return_delivery_company || null,
		})
		.select()
		.single();

	if (error) throw error;

	// Add initial timeline log (locale-neutral structured entry)
	await addReturnNote(
		data.id,
		`return_created:type=${params.type}:resolution=${params.resolution_type}`,
		"system",
	).catch(() => {});

	return data;
}

export async function updateReturnStatus(
	id: string,
	status: ReturnStatus,
	updates?: {
		resolution_type?: ReturnResolutionType;
		refund_amount?: number;
		exchange_order_id?: string;
		return_tracking_id?: string;
		return_delivery_company?: string;
		notes?: string;
	},
) {
	const rawUpdates: Record<string, unknown> = {
		status,
		...updates,
	};

	// If notes are provided separately, remove them from the raw updates to avoid DB column errors
	delete rawUpdates.notes;

	const { data, error } = await getSupabase()
		.from("returns")
		.update(rawUpdates)
		.eq("id", id)
		.is("deleted_at", null)
		.select()
		.single();

	if (error) throw error;

	// Log status change if we have updates.notes or any specific message
	if (updates?.notes) {
		await addReturnNote(id, updates.notes, "note").catch(() => {});
	}

	// Trigger side effects
	if (status === "refunded" && data.resolution_type === "refund") {
		// If refunded, mark original order as refunded or update bookkeeping
		// Can also trigger automated messages/integrations
	}

	return data;
}

export async function addReturnNote(
	returnId: string,
	content: string,
	type: ReturnNote["type"] = "note",
) {
	const user = await getCurrentUser();
	const { data, error } = await getSupabase()
		.from("return_notes")
		.insert({
			return_id: returnId,
			author_id: user?.id || null,
			type,
			content,
		})
		.select()
		.single();

	if (error) throw error;
	return data;
}

/**
 * Creates an exchange order based on a return request
 */
export async function createExchangeOrder(returnId: string): Promise<string> {
	const returnObj = await getReturn(returnId);
	if (!returnObj) throw new Error("Return request not found");

	const originalOrder = returnObj.order;
	if (!originalOrder) throw new Error("Original order not found");

	const user = await getCurrentUser();
	if (!user) throw new Error("Not authenticated");

	// Resolve sellerId once — reused below to avoid redundant DB round-trips
	const sellerId = await getActiveSellerId();

	// Get full original order data to copy details
	const { data: orderDetails, error: detailsError } = await getSupabase()
		.from("orders")
		.select("*")
		.eq("id", originalOrder.id)
		.single();

	if (detailsError) throw detailsError;

	// The items of the new exchange order will be the items requested for return/exchange
	const exchangeItems = returnObj.items.map((item: ReturnItem) => ({
		name: item.product_name,
		quantity: item.quantity,
		price: item.price,
		product_id: item.product_id,
		variant: item.variant_id || undefined,
	}));

	// Calculate new order total (can be 0 if even exchange, or sum of exchange items)
	const exchangeTotal =
		returnObj.resolution_type === "exchange" ? 0 : returnObj.refund_amount;

	// Calculate delivery cost from seller shipping rates
	const deliveryCost = await calculateDeliveryCost(
		getSupabase(),
		sellerId,
		orderDetails.wilaya as string | null,
		(orderDetails.delivery_type as "home" | "desk") || "home",
	);

	// Insert new order
	const { data: newOrder, error: insertError } = await getSupabase()
		.from("orders")
		.insert({
			seller_id: sellerId,
			customer_id: orderDetails.customer_id,
			items: exchangeItems,
			total_price: exchangeTotal,
			delivery_cost: deliveryCost, // calculated from seller's shipping rates
			wilaya: orderDetails.wilaya,
			commune: orderDetails.commune,
			address: orderDetails.address,
			notes: `طلب استبدال للطلب رقم #${orderDetails.order_number} (RET: ${returnObj.return_number})`,
			status: "pending",
			confirmation_status: "confirmed",
		})
		.select()
		.single();

	if (insertError) throw insertError;

	// Link exchange_order_id to the return
	await updateReturnStatus(returnId, "exchanged", {
		exchange_order_id: newOrder.id,
		notes: `تم إنشاء طلب استبدال جديد برقم #${newOrder.order_number} تلقائياً.`,
	});

	return newOrder.id;
}
