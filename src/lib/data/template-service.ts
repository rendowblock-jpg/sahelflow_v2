/**
 * SahelFlow Template Service
 * WhatsApp template CRUD and legacy single-template getter.
 */

import { getSupabase } from "./supabase-helpers";
import { getActiveSellerId } from "./auth-service";

// ===== TEMPLATES CRUD =====

export async function getWhatsAppTemplates() {
	const sellerId = await getActiveSellerId();
	const { data, error } = await getSupabase()
		.from("whatsapp_templates")
		.select("*")
		.eq("seller_id", sellerId)
		.order("category", { ascending: true });
	if (error) throw error;
	return data || [];
}

export async function createWhatsAppTemplate(template: {
	name: string;
	slug: string;
	content: string;
	category: string;
	language: string;
}) {
	const sellerId = await getActiveSellerId();
	const { data, error } = await getSupabase()
		.from("whatsapp_templates")
		.insert({ ...template, seller_id: sellerId })
		.select()
		.single();
	if (error) throw error;
	return data;
}

export async function updateWhatsAppTemplate(
	id: string,
	updates: Partial<{
		name: string;
		slug: string;
		content: string;
		category: string;
		language: string;
		active: boolean;
	}>,
) {
	const { data, error } = await getSupabase()
		.from("whatsapp_templates")
		.update({ ...updates, updated_at: new Date().toISOString() })
		.eq("id", id)
		.select()
		.single();
	if (error) throw error;
	return data;
}

export async function deleteWhatsAppTemplate(id: string) {
	const { error } = await getSupabase()
		.from("whatsapp_templates")
		.delete()
		.eq("id", id);
	if (error) throw error;
}
