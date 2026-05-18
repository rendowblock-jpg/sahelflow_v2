/**
 * SahelFlow Auth Service
 * Authentication helpers and seller profile management.
 */

import { getSupabase } from "./supabase-helpers";
import type { Seller } from "@/types/database";

export async function getCurrentUser() {
	const {
		data: { user },
	} = await getSupabase().auth.getUser();
	return user;
}

export async function getSellerProfile() {
	const user = await getCurrentUser();
	if (!user) return null;
	const { data } = await getSupabase()
		.from("sellers")
		.select("*")
		.eq("id", user.id)
		.maybeSingle();
	return data;
}

export async function updateSellerProfile(
	updates: Partial<
		Pick<
			Seller,
			| "full_name"
			| "business_name"
			| "phone"
			| "settings"
			| "shipping_rates"
			| "whatsapp_template"
			| "notification_settings"
			| "webhook_token"
			| "wilaya"
			| "categories"
			| "delivery_partners"
			| "order_sources"
			| "onboarding_completed"
		>
	>,
) {
	const user = await getCurrentUser();
	if (!user) throw new Error("Not authenticated");

	// Try update first (row usually exists)
	const { data: updateData, error: updateError } = await getSupabase()
		.from("sellers")
		.update(updates)
		.eq("id", user.id)
		.select()
		.maybeSingle();

	if (updateData) return updateData;
	if (updateError) throw updateError;

	// Row missing — insert it
	const { data: insertData, error: insertError } = await getSupabase()
		.from("sellers")
		.insert({ id: user.id, ...updates })
		.select()
		.maybeSingle();

	if (insertError) throw insertError;
	return insertData;
}
