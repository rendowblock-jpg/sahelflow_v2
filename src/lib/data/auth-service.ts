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

	let result = updateData;
	if (updateError) throw updateError;

	if (!result) {
		// Row missing — insert it
		const { data: insertData, error: insertError } = await getSupabase()
			.from("sellers")
			.insert({ id: user.id, ...updates })
			.select()
			.maybeSingle();

		if (insertError) throw insertError;
		result = insertData;
	}

	if (result && updates.onboarding_completed) {
		const defaultTemplates = [
			{
				seller_id: user.id,
				name: "Welcome Message",
				slug: "welcome",
				content: "مرحبا {{customer_name}}! 🎉 شكرا على التواصل مع {{business_name}}. كيف نقدر نعاونك اليوم؟",
				category: "welcome",
				language: "ar"
			},
			{
				seller_id: user.id,
				name: "Post-Delivery Follow-up",
				slug: "followup",
				content: "سلام {{customer_name}}! واش راك؟ نتمنى المنتوج عجبك 🙏 إذا عندك أي سؤال ولا حاجة، نحنا هنا. - {{business_name}}",
				category: "followup",
				language: "ar"
			},
			{
				seller_id: user.id,
				name: "Order Confirmation",
				slug: "confirmation",
				content: "مرحبا {{customer_name}}! طلبك رقم {{order_number}} تأكد ✅ التوصيل لـ {{wilaya}}. شكرا على الثقة! - {{business_name}}",
				category: "confirmation",
				language: "ar"
			},
			{
				seller_id: user.id,
				name: "Upsell Offer",
				slug: "upsell",
				content: "{{customer_name}}، عندنا عرض خاص على {{product_name}}! 🔥 تقدر تزيدو لطلبك بخصم. واش رايك؟ - {{business_name}}",
				category: "upsell",
				language: "ar"
			}
		];

		const supabase = getSupabase();
		for (const t of defaultTemplates) {
			const { data: exists } = await supabase
				.from("whatsapp_templates")
				.select("id")
				.eq("seller_id", user.id)
				.eq("slug", t.slug)
				.maybeSingle();

			if (!exists) {
				await supabase.from("whatsapp_templates").insert(t);
			}
		}
	}

	return result;
}

export async function getActiveSellerId(): Promise<string> {
	const user = await getCurrentUser();
	if (!user) throw new Error("Not authenticated");

	// Check if user is an active team member
	const { data: member } = await getSupabase()
		.from("team_members")
		.select("seller_id")
		.eq("user_id", user.id)
		.eq("status", "active")
		.maybeSingle();

	return member?.seller_id || user.id;
}

