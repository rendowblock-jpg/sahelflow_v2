/**
 * SahelFlow Product Service
 * Product and category CRUD operations.
 * All mutations are seller-scoped to prevent cross-tenant data leakage.
 */
import { getSupabase } from "./supabase-helpers";
import { getActiveSellerId } from "./auth-service";
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
	const sellerId = await getActiveSellerId();
	const { data, error } = await getSupabase()
		.from("categories")
		.insert({ ...category, seller_id: sellerId })
		.select()
		.single();
	if (error) throw error;
	return data;
}

export async function updateCategory(
	id: string,
	updates: Partial<Pick<Category, "name" | "slug" | "sort_order">>,
) {
	const sellerId = await getActiveSellerId();
	const { data, error } = await getSupabase()
		.from("categories")
		.update(updates)
		.eq("id", id)
		.eq("seller_id", sellerId)
		.select()
		.single();
	if (error) throw error;
	return data;
}

export async function deleteCategory(id: string) {
	const sellerId = await getActiveSellerId();
	const { error } = await getSupabase()
		.from("categories")
		.delete()
		.eq("id", id)
		.eq("seller_id", sellerId);
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
		const escapedSearch = options.search.replace(/[%_]/g, "\\$&");
		query = query.ilike("name", `%${escapedSearch}%`);
	}
	if (options?.category) {
		query = query.eq("category_id", options.category);
	}

	const { data, error, count } = await query;
	if (error) throw error;
	return { data: data || [], total: count ?? 0 };
}

/** F-7: Added seller_id scoping */
export async function getProduct(id: string) {
	const sellerId = await getActiveSellerId();
	const { data, error } = await getSupabase()
		.from("products")
		.select("*")
		.eq("id", id)
		.eq("seller_id", sellerId)
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
	const sellerId = await getActiveSellerId();
	const { data, error } = await getSupabase()
		.from("products")
		.insert({ ...product, seller_id: sellerId })
		.select()
		.single();
	if (error) throw error;
	return data;
}

/** F-7: Added seller_id scoping */
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
	const sellerId = await getActiveSellerId();
	const { data, error } = await getSupabase()
		.from("products")
		.update(updates)
		.eq("id", id)
		.eq("seller_id", sellerId)
		.is("deleted_at", null)
		.select()
		.single();
	if (error) throw error;
	return data;
}

/** F-7: Added seller_id scoping */
export async function deleteProduct(id: string) {
	const sellerId = await getActiveSellerId();
	const { error } = await getSupabase()
		.from("products")
		.update({ deleted_at: new Date().toISOString() })
		.eq("id", id)
		.eq("seller_id", sellerId)
		.is("deleted_at", null);
	if (error) throw error;
}

/** F-7: Added seller_id scoping */
export async function restoreProduct(id: string) {
	const sellerId = await getActiveSellerId();
	const { data, error } = await getSupabase()
		.from("products")
		.update({ deleted_at: null })
		.eq("id", id)
		.eq("seller_id", sellerId)
		.not("deleted_at", "is", null)
		.select()
		.single();
	if (error) throw error;
	return data;
}
