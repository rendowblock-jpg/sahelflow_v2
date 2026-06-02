/**
 * Shared shipment creation service
 * Eliminates duplication between executor.ts and tool-handlers.ts (Phase 7.12)
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getDeliveryAdapter } from "./adapters";

interface ShipmentItem {
	product_name?: string;
	name?: string;
	quantity?: number;
	unit_price?: number;
	price?: number;
	weight?: number;
}

interface CreateShipmentParams {
	supabase: SupabaseClient;
	sellerId: string;
	orderId: string;
	orderNumber: string;
	totalPrice: number;
	customer: {
		name: string;
		phone: string;
		wilaya: string;
		commune: string;
		address: string;
	};
	items: ShipmentItem[];
	isExchange?: boolean;
	notes?: string;
}

export async function createShipmentForOrder(
	params: CreateShipmentParams,
): Promise<{
	success: boolean;
	trackingId: string;
	cost: number;
	estimatedDelivery?: string;
	error?: string;
}> {
	const {
		supabase,
		sellerId,
		orderId,
		orderNumber,
		totalPrice,
		customer,
		items,
		isExchange,
		notes,
	} = params;

	// 1. Find active delivery integration for this seller
	const { data: integration } = await supabase
		.from("integrations")
		.select("provider, credentials")
		.eq("seller_id", sellerId)
		.eq("type", "delivery")
		.eq("active", true)
		.order("updated_at", { ascending: false })
		.limit(1)
		.single();

	if (!integration) {
		return {
			success: false,
			trackingId: "",
			cost: 0,
			error: "No active delivery integration found",
		};
	}

	const adapter = getDeliveryAdapter(integration.provider);
	if (!adapter) {
		return {
			success: false,
			trackingId: "",
			cost: 0,
			error: `${integration.provider} delivery adapter not available`,
		};
	}

	// 2. Build shipment request
	const shipmentItems = items.map((i) => ({
		name: String(i.product_name || i.name || "Item"),
		quantity: Number(i.quantity || 1),
		unitPrice: Number(i.unit_price || i.price || 0),
	}));

	const totalWeight =
		items.reduce(
			(w, i) => w + Number(i.weight || 0.3) * Number(i.quantity || 1),
			0,
		) || 0.5;

	const result = await adapter.createShipment(
		{
			orderId,
			orderNumber,
			customer,
			items: shipmentItems,
			totalPrice,
			weight: totalWeight,
			isExchange: isExchange || false,
			notes: notes || "",
		},
		integration.credentials as Record<string, unknown>,
	);

	// 3. Save delivery record if successful
	if (result.success) {
		await supabase.from("deliveries").insert({
			order_id: orderId,
			seller_id: sellerId,
			provider: integration.provider,
			tracking_number: result.trackingId,
			status: "created",
			raw_response: result as unknown as Record<string, unknown>,
		});
	}

	return result;
}
