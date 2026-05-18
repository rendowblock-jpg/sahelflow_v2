/**
 * SahelFlow Template Service
 * WhatsApp template CRUD and legacy single-template getter.
 */

import { getSupabase } from "./supabase-helpers";
import { getCurrentUser } from "./auth-service";
import { getSellerProfile } from "./auth-service";

// ===== LEGACY SINGLE TEMPLATE =====

export async function getWhatsAppTemplate(): Promise<string> {
	const profile = await getSellerProfile();
	// Default template is handled by the caller (UI layer) using i18n.
	// Data layer returns empty string so the UI can inject locale-aware fallback.
	return profile?.whatsapp_template || "";
}

// ===== TEMPLATES CRUD =====

export async function getWhatsAppTemplates() {
	const user = await getCurrentUser();
	if (!user) throw new Error("Not authenticated");
	const { data, error } = await getSupabase()
		.from("whatsapp_templates")
		.select("*")
		.eq("seller_id", user.id)
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
	const user = await getCurrentUser();
	if (!user) throw new Error("Not authenticated");
	const { data, error } = await getSupabase()
		.from("whatsapp_templates")
		.insert({ ...template, seller_id: user.id })
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
