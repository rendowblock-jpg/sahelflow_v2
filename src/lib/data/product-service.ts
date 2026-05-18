/**
 * SahelFlow Product Service
 * Product and category CRUD operations.
 */

import { getSupabase } from "./supabase-helpers";
import { getCurrentUser } from "./auth-service";
import type { Product, Category } from "@/types/database";

// ===== CATEGORIES =====

export async function getCategories() {
	const { data, error } = await getSupabase()
		.from("categories")
		.select("*")
		.order("sort_order", { ascending: true });
	if (error) throw error;
	return data || [];
}

export async function createCategory(category: {
	name: string;
	slug: string;
	sort_order?: number;
}) {
	const user = await getCurrentUser();
	if (!user) throw new Error("Not authenticated");
	const { data, error } = await getSupabase()
		.from("categories")
		.insert({ ...category, seller_id: user.id })
		.select()
		.single();
	if (error) throw error;
	return data;
}

export async function updateCategory(
	id: string,
	updates: Partial<Pick<Category, "name" | "slug" | "sort_order">>,
) {
	const { data, error } = await getSupabase()
		.from("categories")
		.update(updates)
		.eq("id", id)
		.select()
		.single();
	if (error) throw error;
	return data;
}

export async function deleteCategory(id: string) {
	const { error } = await getSupabase()
		.from("categories")
		.delete()
		.eq("id", id);
	if (error) throw error;
}

// ===== PRODUCTS =====

export async function getProducts(options?: {
	limit?: number;
	offset?: number;
	search?: string;
	category?: string;
}) {
	const limit = options?.limit ?? 50;
	const offset = options?.offset ?? 0;

	let query = getSupabase()
		.from("products")
		.select("*", { count: "exact" })
		.is("deleted_at", null)
		.order("created_at", { ascending: false })
		.range(offset, offset + limit - 1);

	if (options?.search) {
		query = query.ilike("name", `%${options.search}%`);
	}
	if (options?.category) {
		query = query.eq("category_id", options.category);
	}

	const { data, error, count } = await query;
	if (error) throw error;
	return { data: data || [], total: count ?? 0 };
}

export async function getProduct(id: string) {
	const { data, error } = await getSupabase()
		.from("products")
		.select("*")
		.eq("id", id)
		.is("deleted_at", null)
		.single();
	if (error) throw error;
	return data;
}

export async function createProduct(product: {
	name: string;
	sku?: string;
	description?: string;
	price: number;
	cost_price?: number;
	stock?: number;
	variants?: unknown[];
	image_url?: string;
	category_id?: string | null;
}) {
	const user = await getCurrentUser();
	if (!user) throw new Error("Not authenticated");
	const { data, error } = await getSupabase()
		.from("products")
		.insert({ ...product, seller_id: user.id })
		.select()
		.single();
	if (error) throw error;
	return data;
}

export async function updateProduct(
	id: string,
	updates: Partial<
		Pick<
			Product,
			| "name"
			| "sku"
			| "description"
			| "price"
			| "cost_price"
			| "stock"
			| "variants"
			| "image_url"
			| "active"
			| "category_id"
		>
	>,
) {
	const { data, error } = await getSupabase()
		.from("products")
		.update(updates)
		.eq("id", id)
		.is("deleted_at", null)
		.select()
		.single();
	if (error) throw error;
	return data;
}

export async function deleteProduct(id: string) {
	const { error } = await getSupabase()
		.from("products")
		.update({ deleted_at: new Date().toISOString() })
		.eq("id", id)
		.is("deleted_at", null);
	if (error) throw error;
}

export async function restoreProduct(id: string) {
	const { data, error } = await getSupabase()
		.from("products")
		.update({ deleted_at: null })
		.eq("id", id)
		.not("deleted_at", "is", null)
		.select()
		.single();
	if (error) throw error;
	return data;
}
