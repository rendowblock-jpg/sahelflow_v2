/**
 * SahelFlow Expense & Accounting Service
 * Handles server-side/client-side data fetching for expenses and P&L RPCs.
 */
import { getSupabase } from "./supabase-helpers";
import { getActiveSellerId } from "./auth-service";
import type {
	Expense,
	ExpenseCategory,
	PnLSummary,
	ProductProfitability,
} from "@/types";

export interface GetExpensesOptions {
	category?: string;
	limit?: number;
	offset?: number;
	startDate?: string; // YYYY-MM-DD
	endDate?: string; // YYYY-MM-DD
}

export async function getExpenses(options?: GetExpensesOptions) {
	const category = options?.category;
	const limit = options?.limit ?? 50;
	const offset = options?.offset ?? 0;
	const startDate = options?.startDate;
	const endDate = options?.endDate;

	let query = getSupabase()
		.from("expenses")
		.select("*", { count: "exact" })
		.order("expense_date", { ascending: false })
		.order("created_at", { ascending: false })
		.range(offset, offset + limit - 1);

	if (category && category !== "all") {
		query = query.eq("category", category);
	}
	if (startDate) {
		query = query.gte("expense_date", startDate);
	}
	if (endDate) {
		query = query.lte("expense_date", endDate);
	}

	const { data, error, count } = await query;
	if (error) throw error;
	return { data: (data || []) as Expense[], total: count ?? 0 };
}

/** F-7: Added seller_id scoping to prevent cross-tenant read */
export async function getExpense(id: string) {
	const sellerId = await getActiveSellerId();
	const { data, error } = await getSupabase()
		.from("expenses")
		.select("*")
		.eq("id", id)
		.eq("seller_id", sellerId)
		.single();
	if (error) throw error;
	return data as Expense;
}

export async function createExpense(params: {
	category: ExpenseCategory;
	amount: number;
	description?: string | null;
	receipt_url?: string | null;
	expense_date?: string;
}) {
	const sellerId = await getActiveSellerId();
	const { data, error } = await getSupabase()
		.from("expenses")
		.insert({
			seller_id: sellerId,
			category: params.category,
			amount: params.amount,
			description: params.description || null,
			receipt_url: params.receipt_url || null,
			expense_date:
				params.expense_date || new Date().toISOString().split("T")[0],
		})
		.select()
		.single();
	if (error) throw error;
	return data as Expense;
}

/** F-7: Added seller_id scoping to prevent cross-tenant update */
export async function updateExpense(
	id: string,
	params: {
		category?: ExpenseCategory;
		amount?: number;
		description?: string | null;
		receipt_url?: string | null;
		expense_date?: string;
	},
) {
	const sellerId = await getActiveSellerId();
	const { data, error } = await getSupabase()
		.from("expenses")
		.update({ ...params, updated_at: new Date().toISOString() })
		.eq("id", id)
		.eq("seller_id", sellerId)
		.select()
		.single();
	if (error) throw error;
	return data as Expense;
}

/** F-7: Added seller_id scoping to prevent cross-tenant delete */
export async function deleteExpense(id: string) {
	const sellerId = await getActiveSellerId();
	const { error } = await getSupabase()
		.from("expenses")
		.delete()
		.eq("id", id)
		.eq("seller_id", sellerId);
	if (error) throw error;
	return true;
}

export async function getPnLSummary(period: string = "30d") {
	const { data, error } = await getSupabase().rpc("get_pnl_summary", {
		p_period: period,
	});
	if (error) throw error;
	return data as PnLSummary;
}

export async function getProductProfitability() {
	const { data, error } = await getSupabase().rpc("get_product_profitability");
	if (error) throw error;
	return (data || []) as ProductProfitability[];
}
