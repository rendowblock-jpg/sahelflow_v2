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
	provider?: string;
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
		provider = "yalidine",
	} = params;

	// 1. Find active delivery integration for this seller.
	// `integrations` columns: platform, credentials, is_active (NO provider/type/active/updated_at).
	// `provider` comes from the caller (default "yalidine"); we look up the matching
	// integration row by platform to obtain stored credentials.
	const adapter = getDeliveryAdapter(provider);
	if (!adapter) {
		return {
			success: false,
			trackingId: "",
			cost: 0,
			error: `${provider} delivery adapter not available`,
		};
	}

	const { data: integration } = await supabase
		.from("integrations")
		.select("credentials")
		.eq("seller_id", sellerId)
		.eq("platform", provider)
		.eq("is_active", true)
		.maybeSingle();

	if (!integration) {
		return {
			success: false,
			trackingId: "",
			cost: 0,
			error: `No active ${adapter.name} integration found. Connect it in Settings → Integrations.`,
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
			provider,
			tracking_number: result.trackingId,
			status: "created",
			raw_response: result as unknown as Record<string, unknown>,
		});
	}

	return result;
}
