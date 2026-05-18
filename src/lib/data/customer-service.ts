/**
 * SahelFlow Customer Service
 * Customer CRUD, find-or-create (atomic upsert), and order lookup.
 */

import { getSupabase } from "./supabase-helpers";
import { getCurrentUser } from "./auth-service";
import type { Customer } from "@/types/database";

export async function getCustomers(options?: {
	limit?: number;
	offset?: number;
}) {
	const limit = options?.limit ?? 50;
	const offset = options?.offset ?? 0;
	const { data, error, count } = await getSupabase()
		.from("customers")
		.select("*", { count: "exact" })
		.is("deleted_at", null)
		.order("created_at", { ascending: false })
		.range(offset, offset + limit - 1);
	if (error) throw error;
	return { data: data || [], total: count ?? 0 };
}

export async function getCustomer(id: string) {
	const { data, error } = await getSupabase()
		.from("customers")
		.select("*")
		.eq("id", id)
		.is("deleted_at", null)
		.single();
	if (error) throw error;
	return data;
}

export async function createCustomer(customer: {
	name?: string;
	phone?: string;
	wilaya?: string;
	commune?: string;
	address?: string;
}) {
	const user = await getCurrentUser();
	if (!user) throw new Error("Not authenticated");
	const { data, error } = await getSupabase()
		.from("customers")
		.insert({ ...customer, seller_id: user.id })
		.select()
		.single();
	if (error) throw error;
	return data;
}

export async function updateCustomer(
	id: string,
	updates: Partial<
		Pick<
			Customer,
			| "name"
			| "phone"
			| "wilaya"
			| "commune"
			| "address"
			| "risk_score"
			| "is_blocked"
			| "metadata"
		>
	>,
) {
	const { data, error } = await getSupabase()
		.from("customers")
		.update(updates)
		.eq("id", id)
		.is("deleted_at", null)
		.select()
		.single();
	if (error) throw error;
	return data;
}

export async function deleteCustomer(id: string) {
	const { error } = await getSupabase()
		.from("customers")
		.update({ deleted_at: new Date().toISOString() })
		.eq("id", id)
		.is("deleted_at", null);
	if (error) throw error;
}

export async function restoreCustomer(id: string) {
	const { data, error } = await getSupabase()
		.from("customers")
		.update({ deleted_at: null })
		.eq("id", id)
		.not("deleted_at", "is", null)
		.select()
		.single();
	if (error) throw error;
	return data;
}

// ===== FIND OR CREATE (ATOMIC UPSERT) =====

export async function findOrCreateCustomer(customer: {
	name?: string;
	phone?: string;
	wilaya?: string;
	commune?: string;
	address?: string;
}) {
	const user = await getCurrentUser();
	if (!user) throw new Error("Not authenticated");

	// Without a phone number we cannot uniquely identify a customer
	// (NULL != NULL in SQL, so upsert on seller_id,phone would INSERT duplicates).
	if (!customer.phone || customer.phone.trim() === "") {
		const { data, error } = await getSupabase()
			.from("customers")
			.insert({
				seller_id: user.id,
				phone: customer.phone ?? null,
				name: customer.name,
				wilaya: customer.wilaya,
				commune: customer.commune,
				address: customer.address,
			})
			.select()
			.single();
		if (error) throw error;
		return data;
	}

	const { data, error } = await getSupabase()
		.from("customers")
		.upsert(
			{
				seller_id: user.id,
				phone: customer.phone,
				name: customer.name,
				wilaya: customer.wilaya,
				commune: customer.commune,
				address: customer.address,
			},
			{
				onConflict: "seller_id,phone",
				ignoreDuplicates: false,
			},
		)
		.select()
		.single();

	if (error) throw error;
	return data;
}

export async function getOrdersByCustomer(customerId: string) {
	const { data, error } = await getSupabase()
		.from("orders")
		.select(
			"id, order_number, status, total_price, delivery_cost, created_at, items, wilaya, commune",
		)
		.eq("customer_id", customerId)
		.is("deleted_at", null)
		.order("created_at", { ascending: false });
	if (error) throw error;
	return data || [];
}
