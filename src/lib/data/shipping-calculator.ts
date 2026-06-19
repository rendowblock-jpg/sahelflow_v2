import { WILAYAS, ZONE_PRICES, type WilayaZone } from "@/lib/data/wilayas";
import type { SupabaseClient } from "@supabase/supabase-js";

// H4 fix: Named constant for fallback shipping cost (was magic number 400 repeated 3x)
const DEFAULT_SHIPPING_COST_DA = 400;

/**
 * Centralized delivery cost calculator that takes a Supabase client, sellerId, wilaya name, and delivery type.
 * Returns the cost in DA.
 */
export async function calculateDeliveryCost(
	supabase: SupabaseClient,
	sellerId: string,
	wilayaName: string | null | undefined,
	deliveryType: "home" | "desk" = "home",
): Promise<number> {
	if (!wilayaName) return DEFAULT_SHIPPING_COST_DA;

	try {
		const query = supabase
			.from("sellers")
			.select("shipping_rates")
			.eq("id", sellerId);

		let seller: Record<string, unknown> | null = null;
		const { data } = await query.single();
		seller = data as Record<string, unknown> | null;

		const rates = seller?.shipping_rates as Record<
			string,
			{ home: number; desk: number }
		> | null;

		const wilaya = WILAYAS.find(
			(w) => w.name.toLowerCase() === wilayaName.toLowerCase(),
		);

		if (!wilaya) return DEFAULT_SHIPPING_COST_DA;

		const rateKey = String(wilaya.code);
		if (rates?.[rateKey]) {
			return deliveryType === "desk"
				? rates[rateKey].desk
				: rates[rateKey].home;
		}

		const zonePrice = ZONE_PRICES[wilaya.zone as WilayaZone];
		if (zonePrice) {
			return deliveryType === "desk" ? zonePrice.desk : zonePrice.home;
		}
	} catch (err) {
		console.error(
			"[shipping-calculator] Failed to calculate delivery cost:",
			err,
		);
	}

	return DEFAULT_SHIPPING_COST_DA;
}
