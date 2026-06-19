/**
 * SahelFlow AI Agent Engine
 * Tool-calling agent that queries real Supabase data and performs actions
 */

import { createClient } from "@/lib/supabase/server";
import { getAlgerianLanguagePrompt } from "@/lib/ai/prompts/algerian";
import { ChatMessage } from "@/lib/agents/groq";
import {
	executeWithFallback,
	classifyIntent,
	MODELS,
	RouteDecision,
} from "@/lib/ai/models";
import { isModelHealthy } from "@/lib/ai/models/health";
import { sanitizeDarijaLeaks } from "@/lib/ai/sanitizer";

/** Escape special LIKE/ILIKE wildcard characters to prevent injection */
function escapeLike(str: string): string {
	return str.replace(/[%_\\]/g, "\\$&");
}

import {
	handleUpdateOrderStatus,
	handleCreateOrder,
	handleCreateProduct,
	handleUpdateProduct,
	handleUpdateCustomer,
	handleDeleteOrder,
	handleDeleteProduct,
	handleUpdateShippingRate,
	handleToggleAutomation,
	handleCreateShipment,
	handleListReturns,
	handleCreateReturn,
	handleUpdateReturnStatus,
	handleGetPnL,
	handleListExpenses,
	handleAddExpense,
} from "@/lib/ai/tool-handlers";

// ===== TOOL DEFINITIONS =====

export interface AgentTool {
	name: string;
	description: string;
	parameters?: string;
	schema?: Record<string, unknown>;
	execute: (
		params: Record<string, unknown>,
		sellerId: string,
	) => Promise<unknown>;
}

async function getSupabase() {
	const client = await createClient();
	const {
		data: { user },
	} = await client.auth.getUser();
	if (!user) {
		throw new Error(
			"Unauthorized: AI agent requires an authenticated user session. " +
			"If running in a webhook/cron context, route through the internal webhook flow which has its own auth.",
		);
	}
	return client;
}

function getPeriodFilter(period?: string): string {
	if (!period || period === "all") return "";
	const now = new Date();
	switch (period) {
		case "today":
			now.setHours(0, 0, 0, 0);
			break;
		case "7d":
		case "week":
			now.setDate(now.getDate() - 7);
			break;
		case "30d":
		case "month":
			now.setDate(now.getDate() - 30);
			break;
		case "90d":
			now.setDate(now.getDate() - 90);
			break;
		case "year":
			now.setDate(now.getDate() - 365);
			break;
	}
	return now.toISOString();
}

export const tools: AgentTool[] = [
	{
		name: "get_dashboard_stats",
		description:
			"إحصائيات لوحة التحكم / Get dashboard stats: orders, revenue, profit, customers, delivery rate, pending",
		parameters: "period (optional): 'today', '7d', '30d', 'all'",
		schema: { type: "object", properties: { period: { type: "string" } } },
		async execute(params, sellerId) {
			const supabase = await getSupabase();

			let ordersQuery = supabase
				.from("orders")
				.select(
					"id, status, total_price, net_profit, delivery_cost, created_at",
				)
				.eq("seller_id", sellerId);

			const startDate = getPeriodFilter(params.period as string);
			if (startDate) {
				ordersQuery = ordersQuery.gte("created_at", startDate);
			}

			const [ordersRes, productsRes, customersRes] = await Promise.all([
				ordersQuery,
				supabase
					.from("products")
					.select("id, stock, price, cost_price")
					.eq("seller_id", sellerId),
				supabase
					.from("customers")
					.select("id, risk_score, is_blocked")
					.eq("seller_id", sellerId),
			]);

			if (ordersRes.error || productsRes.error || customersRes.error) {
				const errMsg = [ordersRes.error, productsRes.error, customersRes.error]
					.filter(Boolean)
					.map((e) => (e as Error).message)
					.join("; ");
				console.error(`[Tool get_dashboard_stats] Supabase error:`, errMsg);
				return { error: `Database error: ${errMsg}` };
			}

			const orders = (ordersRes.data || []) as Array<Record<string, unknown>>;
			const products = (productsRes.data || []) as Array<
				Record<string, unknown>
			>;
			const customers = (customersRes.data || []) as Array<
				Record<string, unknown>
			>;

			if (orders.length === 0 && products.length === 0) {
				return {
					message: "لا توجد بيانات بعد / Pas de données encore / No data yet",
					totalOrders: 0,
					totalProducts: 0,
					totalCustomers: 0,
					totalRevenue: 0,
				};
			}

			const totalRevenue = orders.reduce(
				(s, o) => s + Number(o.total_price || 0),
				0,
			);
			const totalProfit = orders.reduce(
				(s, o) => s + Number(o.net_profit || 0),
				0,
			);
			const delivered = orders.filter((o) => o.status === "delivered").length;
			const returned = orders.filter(
				(o) => o.status === "returned" || o.status === "refused",
			).length;
			const pending = orders.filter((o) => o.status === "pending").length;
			const confirmed = orders.filter((o) => o.status === "confirmed").length;
			const shipped = orders.filter((o) => o.status === "shipped").length;

			return {
				totalOrders: orders.length,
				totalRevenue,
				totalProfit,
				totalProducts: products.length,
				totalCustomers: customers.length,
				totalStock: products.reduce(
					(s: number, p: Record<string, unknown>) => s + Number(p.stock || 0),
					0,
				),
				deliveryRate: orders.length
					? Math.round((delivered / orders.length) * 100)
					: 0,
				returnRate: orders.length
					? Math.round((returned / orders.length) * 100)
					: 0,
				pendingOrders: pending,
				confirmedOrders: confirmed,
				shippedOrders: shipped,
				deliveredOrders: delivered,
				returnedOrders: returned,
				highRiskCustomers: customers.filter((c) => Number(c.risk_score) > 60)
					.length,
				blockedCustomers: customers.filter((c) => c.is_blocked).length,
			};
		},
	},
	{
		name: "get_orders",
		description:
			"Get orders, optionally filtered by status (pending/confirmed/shipped/delivered/returned/cancelled) and period",
		parameters: "status (optional), period (optional: 'today', '7d', '30d')",
		schema: {
			type: "object",
			properties: { status: { type: "string" }, period: { type: "string" } },
		},
		async execute(params, sellerId) {
			const supabase = await getSupabase();
			let query = supabase
				.from("orders")
				.select(
					"order_number, status, total_price, delivery_cost, net_profit, wilaya, commune, notes, items, created_at, customer:customers(name, phone, wilaya)",
				)
				.eq("seller_id", sellerId)
				.order("created_at", { ascending: false })
				.limit(20);

			if (params.status) query = query.eq("status", params.status as string);

			const startDate = getPeriodFilter(params.period as string);
			if (startDate) {
				query = query.gte("created_at", startDate);
			}

			const { data, error } = await query;
			if (error) {
				console.error(`[Tool get_orders] Supabase error:`, error.message);
				return { error: `Database error: ${error.message}` };
			}

			if (!data || data.length === 0) {
				return {
					message: params.status
						? `No ${params.status} orders found for the requested period.`
						: "لم يتم العثور على طلبات / Aucune commande / No orders found",
					orders: [],
				};
			}

			return (data as Array<Record<string, unknown>>).map((o) => ({
				order_number: o.order_number,
				status: o.status,
				total_price: o.total_price,
				delivery_cost: o.delivery_cost,
				net_profit: o.net_profit,
				wilaya: o.wilaya,
				customer_name: (o.customer as unknown as Record<string, unknown>)?.name,
				created_at: o.created_at,
			}));
		},
	},
	{
		name: "get_products",
		description:
			"Get product catalog with stock levels, pricing, and cost prices",
		async execute(_params, sellerId) {
			const supabase = await getSupabase();
			const { data, error } = await supabase
				.from("products")
				.select("name, sku, price, cost_price, stock, description, active")
				.eq("seller_id", sellerId)
				.order("name");
			if (error) {
				console.error(`[Tool get_products] Supabase error:`, error.message);
				return { error: `Database error: ${error.message}` };
			}

			if (!data || data.length === 0) {
				return {
					message:
						"لا توجد منتجات في الكتالوج / Aucun produit / No products yet",
					products: [],
				};
			}

			return data;
		},
	},
	{
		name: "get_low_stock_products",
		description:
			"Get products that are low in stock (5 or less) or out of stock",
		async execute(_params, sellerId) {
			const supabase = await getSupabase();
			const { data, error } = await supabase
				.from("products")
				.select("name, sku, price, stock")
				.eq("seller_id", sellerId)
				.lte("stock", 5)
				.order("stock", { ascending: true });
			if (error) {
				console.error(
					`[Tool get_low_stock_products] Supabase error:`,
					error.message,
				);
				return { error: `Database error: ${error.message}` };
			}

			if (!data || data.length === 0) {
				return {
					message:
						"جميع المنتجات متوفرة ✅ / Tous les produits en stock ✅ / All stocked ✅",
				};
			}

			return {
				alertCount: data.length,
				outOfStock: (data as Array<Record<string, unknown>>).filter(
					(p) => Number(p.stock) === 0,
				),
				lowStock: (data as Array<Record<string, unknown>>).filter((p) => {
					const stock = Number(p.stock);
					return stock > 0 && stock <= 5;
				}),
			};
		},
	},
	{
		name: "get_customers",
		description: "Get customer list with contact info, location, and risk data",
		async execute(_params, sellerId) {
			const supabase = await getSupabase();
			const { data, error } = await supabase
				.from("customers")
				.select(
					"name, phone, wilaya, commune, order_count, total_spent, risk_score, is_blocked",
				)
				.eq("seller_id", sellerId)
				.order("created_at", { ascending: false })
				.limit(20);
			if (error) {
				console.error(`[Tool get_customers] Supabase error:`, error.message);
				return { error: `Database error: ${error.message}` };
			}

			if (!data || data.length === 0) {
				return {
					message:
						"No customers yet. Customers are auto-created when orders are placed.",
					customers: [],
				};
			}

			return data;
		},
	},
	{
		name: "get_revenue_summary",
		description:
			"Get revenue breakdown: total revenue, profit, by status, averages, and top-performing wilayas",
		parameters: "period (optional: 'today', '7d', '30d', 'all')",
		schema: { type: "object", properties: { period: { type: "string" } } },
		async execute(params, sellerId) {
			const supabase = await getSupabase();
			let query = supabase
				.from("orders")
				.select(
					"status, total_price, net_profit, delivery_cost, wilaya, created_at",
				)
				.eq("seller_id", sellerId);

			const startDate = getPeriodFilter(params.period as string);
			if (startDate) {
				query = query.gte("created_at", startDate);
			}

			const { data: orders, error } = await query;
			if (error) {
				console.error(
					`[Tool get_revenue_summary] Supabase error:`,
					error.message,
				);
				return { error: `Database error: ${error.message}` };
			}

			if (!orders || orders.length === 0) {
				return {
					message:
						"لا توجد بيانات إيرادات / Pas de revenus / No revenue data yet",
					totalRevenue: 0,
				};
			}

			const typedOrders = orders as Array<Record<string, unknown>>;
			const totalRevenue = typedOrders.reduce(
				(s: number, o: Record<string, unknown>) =>
					s + Number(o.total_price || 0),
				0,
			);
			const totalProfit = typedOrders.reduce(
				(s: number, o: Record<string, unknown>) =>
					s + Number(o.net_profit || 0),
				0,
			);
			const totalDeliveryCost = typedOrders.reduce(
				(s: number, o: Record<string, unknown>) =>
					s + Number(o.delivery_cost || 0),
				0,
			);
			const deliveredOrders = typedOrders.filter(
				(o: Record<string, unknown>) => o.status === "delivered",
			);
			const deliveredRevenue = deliveredOrders.reduce(
				(s, o) => s + Number(o.total_price || 0),
				0,
			);

			// Revenue by wilaya
			const byWilaya: Record<
				string,
				{ orders: number; revenue: number; delivered: number }
			> = {};
			(orders as Array<Record<string, unknown>>).forEach((o) => {
				const w = (o.wilaya as string) || "Unknown";
				if (!byWilaya[w]) byWilaya[w] = { orders: 0, revenue: 0, delivered: 0 };
				byWilaya[w].orders++;
				byWilaya[w].revenue += Number(o.total_price || 0);
				if (o.status === "delivered") byWilaya[w].delivered++;
			});

			return {
				totalRevenue,
				totalProfit,
				totalDeliveryCost,
				confirmedRevenue: deliveredRevenue,
				averageOrderValue: Math.round(totalRevenue / orders.length),
				profitMargin:
					totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 100) : 0,
				topWilayas: Object.entries(byWilaya)
					.sort((a, b) => b[1].revenue - a[1].revenue)
					.slice(0, 5)
					.map(([wilaya, data]) => ({ wilaya, ...data })),
			};
		},
	},
	{
		name: "update_order_status",
		description:
			"Update an order's status. Requires order_number and new_status (confirmed/shipped/delivered/returned/cancelled)",
		parameters: "order_number (required), new_status (required)",
		schema: {
			type: "object",
			properties: {
				order_number: { type: "string" },
				new_status: {
					type: "string",
					enum: ["confirmed", "shipped", "delivered", "returned", "cancelled"],
				},
			},
			required: ["order_number", "new_status"],
		},
		async execute(params, sellerId) {
			const supabase = await getSupabase();
			return handleUpdateOrderStatus(
				{
					order_number: params.order_number as string,
					new_status: params.new_status as string,
				},
				sellerId,
				supabase,
			);
		},
	},
	{
		name: "search_all",
		description:
			"Search across orders, products, and customers by keyword or name",
		parameters: "query (required): search term",
		schema: {
			type: "object",
			properties: { query: { type: "string" } },
			required: ["query"],
		},
		async execute(params, sellerId) {
			const supabase = await getSupabase();
			const q = String(params.query || "").trim();
			if (!q) return { error: "Please provide a search query." };
			// Escape SQL ILIKE wildcards so user input cannot alter query semantics
			const safeQ = q
				.replace(/[,.()\!\*]/g, "")
				.replace(/%/g, "\\%")
				.replace(/_/g, "\\_")
				.trim()
				.slice(0, 100);

			const [ordersRes, productsRes, customersRes] = await Promise.all([
				supabase
					.from("orders")
					.select(
						"order_number, status, total_price, wilaya, customer:customers(name)",
					)
					.eq("seller_id", sellerId)
					.or(`order_number.ilike.%${safeQ}%,wilaya.ilike.%${safeQ}%`)
					.limit(5),
				supabase
					.from("products")
					.select("name, sku, price, stock")
					.eq("seller_id", sellerId)
					.or(`name.ilike.%${safeQ}%,sku.ilike.%${safeQ}%`)
					.limit(5),
				supabase
					.from("customers")
					.select("name, phone, wilaya")
					.eq("seller_id", sellerId)
					.or(
						`name.ilike.%${safeQ}%,phone.ilike.%${safeQ}%,wilaya.ilike.%${safeQ}%`,
					)
					.limit(5),
			]);

			const errMsg = [ordersRes.error, productsRes.error, customersRes.error]
				.filter(Boolean)
				.map((e) => (e as Error).message)
				.join("; ");
			if (errMsg) {
				console.error(`[Tool search_all] Supabase error:`, errMsg);
				return { error: `Database error: ${errMsg}` };
			}

			return {
				orders: ordersRes.data || [],
				products: productsRes.data || [],
				customers: customersRes.data || [],
			};
		},
	},
	{
		name: "get_automations",
		description:
			"Get automation rules with their status, trigger/action types, and run counts",
		async execute(_params, sellerId) {
			const supabase = await getSupabase();
			const { data, error } = await supabase
				.from("automations")
				.select(
					"name, description, trigger_type, action_type, active, run_count, last_run_at",
				)
				.eq("seller_id", sellerId)
				.order("created_at", { ascending: false });
			if (error) {
				console.error(`[Tool get_automations] Supabase error:`, error.message);
				return { error: `Database error: ${error.message}` };
			}

			if (!data || data.length === 0) {
				return {
					message:
						"لا توجد أتمتة مُعدّة / Aucune automatisation / No automations configured",
				};
			}

			return data;
		},
	},
	{
		name: "get_order_by_number",
		description:
			"Look up a single order by its order number for detailed view including customer info",
		parameters: "order_number (required): the order number to look up",
		schema: {
			type: "object",
			properties: { order_number: { type: "string" } },
			required: ["order_number"],
		},
		async execute(params, sellerId) {
			if (!params.order_number) {
				return { error: "order_number is required." };
			}

			const supabase = await getSupabase();
			const { data, error } = await supabase
				.from("orders")
				.select(
					"*, customer:customers(name, phone, wilaya, commune, is_blocked, risk_score)",
				)
				.eq("seller_id", sellerId)
				.eq("order_number", params.order_number as string)
				.single();
			if (error) {
				console.error(
					`[Tool get_order_by_number] Supabase error:`,
					error.message,
				);
				return { error: `Database error: ${error.message}` };
			}

			if (!data) {
				return { error: "Order not found" };
			}

			return data;
		},
	},
	{
		name: "create_order",
		description:
			"Create a new order from AI chat. Requires customer name, phone, wilaya, and items array.",
		parameters:
			"customer_name (required), phone (required), wilaya (required), address (optional), items (required: array of {name, quantity, price?}), notes (optional)",
		schema: {
			type: "object",
			properties: {
				customer_name: { type: "string" },
				phone: { type: "string" },
				wilaya: { type: "string" },
				commune: { type: "string" },
				address: { type: "string" },
				items: {
					type: "array",
					items: {
						type: "object",
						properties: {
							name: { type: "string" },
							quantity: { type: "number" },
							price: { type: "number" },
						},
					},
				},
				notes: { type: "string" },
			},
			required: ["customer_name", "phone", "wilaya", "items"],
		},
		async execute(params, sellerId) {
			const supabase = await getSupabase();
			return handleCreateOrder(
				{
					customer_name: params.customer_name as string,
					phone: params.phone as string,
					wilaya: params.wilaya as string,
					commune: params.commune as string | undefined,
					address: params.address as string | undefined,
					items: params.items as
						| Array<{
								product_id?: string;
								name: string;
								quantity: number;
								price?: number;
						  }>
						| undefined,
					notes: params.notes as string | undefined,
				},
				sellerId,
				supabase,
			);
		},
	},
	{
		name: "create_product",
		description:
			"Add a new product to the catalog. You MUST try to ask the user for name, price, cost_price, and stock before executing.",
		parameters:
			"name (required), price (required), stock (optional, default 0), description (optional), sku (optional), cost_price (optional)",
		schema: {
			type: "object",
			properties: {
				name: { type: "string" },
				price: { type: "number" },
				stock: { type: "number" },
				description: { type: "string" },
				sku: { type: "string" },
				cost_price: { type: "number" },
			},
			required: ["name", "price"],
		},
		async execute(params, sellerId) {
			const supabase = await getSupabase();
			return handleCreateProduct(
				{
					name: params.name as string,
					price: params.price as number,
					stock: params.stock as number | undefined,
					description: params.description as string | undefined,
					sku: params.sku as string | undefined,
					cost_price: params.cost_price as number | undefined,
				},
				sellerId,
				supabase,
			);
		},
	},
	{
		name: "update_product",
		description:
			"Update an existing product's details. Find by name, then update price, cost_price, stock, description, or active status.",
		parameters:
			"name (required: product name to find), price (optional), cost_price (optional), stock (optional), description (optional), active (optional)",
		schema: {
			type: "object",
			properties: {
				name: { type: "string" },
				price: { type: "number" },
				cost_price: { type: "number" },
				stock: { type: "number" },
				description: { type: "string" },
				active: { type: "boolean" },
			},
			required: ["name"],
		},
		async execute(params, sellerId) {
			const supabase = await getSupabase();
			return handleUpdateProduct(
				{
					name: params.name as string,
					price: params.price as number | undefined,
					cost_price: params.cost_price as number | undefined,
					stock: params.stock as number | undefined,
					description: params.description as string | undefined,
					active: params.active as boolean | undefined,
				},
				sellerId,
				supabase,
			);
		},
	},
	{
		name: "update_customer",
		description:
			"Block/unblock a customer or update their info. Find by phone or name.",
		parameters:
			"phone (optional), name (optional: at least one required), is_blocked (optional), notes (optional), wilaya (optional)",
		schema: {
			type: "object",
			properties: {
				phone: { type: "string" },
				name: { type: "string" },
				is_blocked: { type: "boolean" },
				notes: { type: "string" },
				wilaya: { type: "string" },
			},
		},
		async execute(params, sellerId) {
			const supabase = await getSupabase();
			return handleUpdateCustomer(
				{
					phone: params.phone as string | undefined,
					name: params.name as string | undefined,
					is_blocked: params.is_blocked as boolean | undefined,
					notes: params.notes as string | undefined,
					wilaya: params.wilaya as string | undefined,
				},
				sellerId,
				supabase,
			);
		},
	},

	{
		name: "create_customer",
		description:
			"Create a new customer in the database. Use when the seller explicitly asks to add a customer without placing an order.",
		parameters:
			"name (required), phone (required), wilaya (required), commune (optional), address (optional), notes (optional)",
		schema: {
			type: "object",
			properties: {
				name: { type: "string" },
				phone: { type: "string" },
				wilaya: { type: "string" },
				commune: { type: "string" },
				address: { type: "string" },
				notes: { type: "string" },
			},
			required: ["name", "phone", "wilaya"],
		},
		async execute(params, sellerId) {
			const supabase = await getSupabase();

			if (!params.name || !params.phone || !params.wilaya) {
				return { error: "name, phone, and wilaya are required." };
			}

			if (!/^(05|06|07)[0-9]{8}$/.test(params.phone as string)) {
				return {
					error: `Invalid Algerian phone number: ${params.phone}. Must start with 05, 06, or 07 followed by 8 digits.`,
				};
			}

			// Check for duplicate phone
			const { data: existing, error: dupError } = await supabase
				.from("customers")
				.select("id")
				.eq("seller_id", sellerId)
				.eq("phone", params.phone as string)
				.maybeSingle();

			if (dupError) {
				console.error(
					`[Tool create_customer] Supabase error:`,
					dupError.message,
				);
				return { error: `Database error: ${dupError.message}` };
			}

			if (existing) {
				return {
					error: `A customer with phone ${params.phone} already exists.`,
				};
			}

			const { data, error } = await supabase
				.from("customers")
				.insert({
					seller_id: sellerId,
					name: params.name as string,
					phone: params.phone as string,
					wilaya: params.wilaya as string,
					commune: (params.commune as string) || null,
					address: (params.address as string) || null,
					notes: (params.notes as string) || null,
				})
				.select()
				.single();

			if (error) {
				console.error(`[Tool create_customer] Supabase error:`, error.message);
				return { error: `Database error: ${error.message}` };
			}

			return {
				success: true,
				name: data.name,
				phone: data.phone,
				wilaya: data.wilaya,
			};
		},
	},
	{
		name: "delete_order",
		description: "Cancel and delete an order by order number",
		parameters: "order_number (required)",
		schema: {
			type: "object",
			properties: { order_number: { type: "string" } },
			required: ["order_number"],
		},
		async execute(params, sellerId) {
			const supabase = await getSupabase();
			return handleDeleteOrder(
				{ order_number: params.order_number as string },
				sellerId,
				supabase,
			);
		},
	},
	{
		name: "get_shipping_rates",
		description:
			"View shipping costs for all wilayas or a specific one by name",
		parameters: "wilaya (optional)",
		schema: { type: "object", properties: { wilaya: { type: "string" } } },
		async execute(params, sellerId) {
			const supabase = await getSupabase();
			const { data, error } = await supabase
				.from("sellers")
				.select("shipping_rates")
				.eq("id", sellerId)
				.single();
			if (error) {
				console.error(
					`[Tool get_shipping_rates] Supabase error:`,
					error.message,
				);
				return { error: `Database error: ${error.message}` };
			}
			const rates = data?.shipping_rates;
			if (!rates)
				return {
					message:
						"أسعار الشحن الافتراضية / Tarifs par défaut / Default shipping rates",
				};
			if (params.wilaya) {
				const { WILAYAS } = await import("@/lib/data/wilayas");
				const w = WILAYAS.find(
					(x) => x.name.toLowerCase() === String(params.wilaya).toLowerCase(),
				);
				if (!w) return { error: "Wilaya not found" };
				const wRate = (rates as Record<string, { home: number; desk: number }>)[
					w.code
				];
				return wRate
					? { wilaya: w.name, rates: wRate }
					: { message: "Default rate used for this wilaya" };
			}
			return { custom_rates: rates };
		},
	},
	{
		name: "update_shipping_rate",
		description: "Update home delivery price for a specific wilaya by name",
		parameters: "wilaya (required), home_price (required)",
		schema: {
			type: "object",
			properties: {
				wilaya: { type: "string" },
				home_price: { type: "number" },
			},
			required: ["wilaya", "home_price"],
		},
		async execute(params, sellerId) {
			const supabase = await getSupabase();
			return handleUpdateShippingRate(
				{
					wilaya: params.wilaya as string,
					home_price: params.home_price as number,
				},
				sellerId,
				supabase,
			);
		},
	},
	{
		name: "toggle_automation",
		description: "Enable or disable an automation recipe by name",
		parameters: "name (required), active (required)",
		schema: {
			type: "object",
			properties: { name: { type: "string" }, active: { type: "boolean" } },
			required: ["name", "active"],
		},
		async execute(params, sellerId) {
			const supabase = await getSupabase();
			return handleToggleAutomation(
				{ name: params.name as string, active: params.active as boolean },
				sellerId,
				supabase,
			);
		},
	},
	{
		name: "get_customer_orders",
		description: "Get all orders for a specific customer by phone or name",
		parameters: "phone (optional), name (optional)",
		schema: {
			type: "object",
			properties: { phone: { type: "string" }, name: { type: "string" } },
		},
		async execute(params, sellerId) {
			if (!params.phone && !params.name)
				return { error: "phone or name required" };
			const supabase = await getSupabase();
			let query = supabase
				.from("customers")
				.select("id")
				.eq("seller_id", sellerId);
			if (params.phone) {
				const cleanPhone = String(params.phone)
					.replace(/[\s.-]/g, "")
					.replace(/^(\+213|00213|213)/, "0");
				query = query.eq("phone", cleanPhone);
			} else {
				query = query.ilike("name", escapeLike(params.name as string));
			}
			const { data: customer, error: customerError } = await query
				.limit(1)
				.maybeSingle();
			if (customerError) {
				console.error(
					`[Tool get_customer_orders] Supabase error:`,
					customerError.message,
				);
				return { error: `Database error: ${customerError.message}` };
			}
			if (!customer) return { error: "Customer not found" };

			const { data: orders, error: ordersError } = await supabase
				.from("orders")
				.select("order_number, status, total_price, created_at")
				.eq("customer_id", customer.id);
			if (ordersError) {
				console.error(
					`[Tool get_customer_orders] Supabase error:`,
					ordersError.message,
				);
				return { error: `Database error: ${ordersError.message}` };
			}
			return { orders: orders || [] };
		},
	},
	{
		name: "get_cod_cashflow",
		description: "Detailed COD cash flow (in transit, collected, returns)",
		parameters: "none",
		schema: { type: "object", properties: {} },
		async execute(_params, sellerId) {
			const supabase = await getSupabase();
			const { data, error } = await supabase
				.from("deliveries")
				.select("status, order:orders(total_price)")
				.eq("seller_id", sellerId);
			if (error) {
				console.error(`[Tool get_cod_cashflow] Supabase error:`, error.message);
				return { error: `Database error: ${error.message}` };
			}
			if (!data)
				return {
					message:
						"لا توجد بيانات توصيل / Pas de livraisons / No delivery data",
				};

			const getPrice = (d: unknown) => {
				const doc = d as Record<string, unknown>;
				const o = Array.isArray(doc.order) ? doc.order[0] : doc.order;
				return Number((o as Record<string, unknown>)?.total_price || 0);
			};

			const deliveryData = data as Array<Record<string, unknown>>;
			const inTransit = deliveryData
				.filter((d) => ["picked_up", "in_transit"].includes(d.status as string))
				.reduce((s: number, d) => s + getPrice(d), 0);
			const returned = deliveryData
				.filter((d) => d.status === "returned")
				.reduce((s: number, d) => s + getPrice(d), 0);
			const collected = deliveryData
				.filter((d) => d.status === "delivered")
				.reduce((s: number, d) => s + getPrice(d), 0);

			return { in_transit: inTransit, collected, returned_recently: returned };
		},
	},
	{
		name: "get_store_info",
		description: "View store name, phone, email, and description",
		async execute(_params, sellerId) {
			const supabase = await getSupabase();
			const { data, error } = await supabase
				.from("sellers")
				.select("business_name, email, full_name, settings")
				.eq("id", sellerId)
				.single();
			if (error) {
				console.error(`[Tool get_store_info] Supabase error:`, error.message);
				return { error: `Database error: ${error.message}` };
			}
			return {
				business_name: data?.business_name,
				owner: data?.full_name,
				email: data?.email,
			};
		},
	},
	{
		name: "delete_product",
		description: "Delete a product from the catalog by exact or partial name",
		parameters: "name (required)",
		schema: {
			type: "object",
			properties: { name: { type: "string" } },
			required: ["name"],
		},
		async execute(params, sellerId) {
			const supabase = await getSupabase();
			return handleDeleteProduct(
				{ name: params.name as string },
				sellerId,
				supabase,
			);
		},
	},
	{
		name: "create_shipment",
		description:
			"Create a Yalidine delivery shipment for a confirmed or pending order. Returns tracking number.",
		parameters: "order_number (required): the order to ship",
		schema: {
			type: "object",
			properties: { order_number: { type: "string" } },
			required: ["order_number"],
		},
		async execute(params, sellerId) {
			const supabase = await getSupabase();
			return handleCreateShipment(
				{ order_number: params.order_number as string },
				sellerId,
				supabase,
			);
		},
	},
	{
		name: "list_returns",
		description:
			"عرض طلبات الإرجاع والاستبدال / List return, exchange, or refund requests",
		parameters:
			"status (optional): filter by 'requested', 'approved', 'pickup', 'received', 'inspected', 'refunded', 'exchanged', 'rejected', 'closed'",
		schema: {
			type: "object",
			properties: { status: { type: "string" } },
		},
		async execute(params, sellerId) {
			const supabase = await getSupabase();
			return handleListReturns(
				{ status: params.status as string | undefined },
				sellerId,
				supabase,
			);
		},
	},
	{
		name: "create_return",
		description:
			"إنشاء طلب استرجاع أو استبدال / Create a return, refund, or exchange request for an order number. Default to returning all items in the order.",
		parameters:
			"order_number (required), type (required: 'return' | 'exchange' | 'refund'), reason (required: 'wrong_product', 'damaged', 'changed_mind', 'not_as_described', 'wrong_size', 'defective', 'late_delivery', 'other'), reason_details (optional), resolution_type (optional: 'refund' | 'exchange' | 'credit'), refund_amount (optional)",
		schema: {
			type: "object",
			properties: {
				order_number: { type: "string" },
				type: { type: "string", enum: ["return", "exchange", "refund"] },
				reason: {
					type: "string",
					enum: [
						"wrong_product",
						"damaged",
						"changed_mind",
						"not_as_described",
						"wrong_size",
						"defective",
						"late_delivery",
						"other",
					],
				},
				reason_details: { type: "string" },
				resolution_type: {
					type: "string",
					enum: ["refund", "exchange", "credit"],
				},
				refund_amount: { type: "number" },
			},
			required: ["order_number", "type", "reason"],
		},
		async execute(params, sellerId) {
			const supabase = await getSupabase();
			return handleCreateReturn(
				{
					order_number: params.order_number as string,
					type: params.type as "return" | "exchange" | "refund",
					reason: params.reason as string,
					reason_details: params.reason_details as string | undefined,
					resolution_type: params.resolution_type as
						| "refund"
						| "exchange"
						| "credit"
						| undefined,
					refund_amount: params.refund_amount as number | undefined,
				},
				sellerId,
				supabase,
			);
		},
	},
	{
		name: "update_return_status",
		description:
			"تحديث حالة طلب الإرجاع والاستبدال / Update return request status and optionally add notes.",
		parameters:
			"return_number (required), new_status (required: 'approved', 'pickup', 'received', 'inspected', 'refunded', 'exchanged', 'rejected', 'closed'), notes (optional)",
		schema: {
			type: "object",
			properties: {
				return_number: { type: "string" },
				new_status: {
					type: "string",
					enum: [
						"approved",
						"pickup",
						"received",
						"inspected",
						"refunded",
						"exchanged",
						"rejected",
						"closed",
					],
				},
				notes: { type: "string" },
			},
			required: ["return_number", "new_status"],
		},
		async execute(params, sellerId) {
			const supabase = await getSupabase();
			return handleUpdateReturnStatus(
				{
					return_number: params.return_number as string,
					new_status: params.new_status as string,
					notes: params.notes as string | undefined,
				},
				sellerId,
				supabase,
			);
		},
	},
	{
		name: "get_pnl",
		description:
			"عرض ملخص الأرباح والخسائر / Get Profit & Loss (P&L) summary including revenue, cost of goods, delivery fees, expenses, return losses, and net profit.",
		parameters: "period (optional): '7d' | '30d' | '90d' | 'year'",
		schema: {
			type: "object",
			properties: {
				period: { type: "string", enum: ["7d", "30d", "90d", "year"] },
			},
		},
		async execute(params, sellerId) {
			const supabase = await getSupabase();
			return handleGetPnL(
				{ period: params.period as string | undefined },
				sellerId,
				supabase,
			);
		},
	},
	{
		name: "list_expenses",
		description:
			"عرض قائمة المصاريف / List recent business expenses, optionally filtered by category.",
		parameters:
			"category (optional): 'ads' | 'packaging' | 'delivery_fees' | 'returns' | 'supplies' | 'salary' | 'rent' | 'other'",
		schema: {
			type: "object",
			properties: {
				category: {
					type: "string",
					enum: [
						"ads",
						"packaging",
						"delivery_fees",
						"returns",
						"supplies",
						"salary",
						"rent",
						"other",
					],
				},
			},
		},
		async execute(params, sellerId) {
			const supabase = await getSupabase();
			return handleListExpenses(
				{ category: params.category as string | undefined },
				sellerId,
				supabase,
			);
		},
	},
	{
		name: "add_expense",
		description:
			"إضافة مصاريف جديدة / Add a new business expense (e.g. advertising ads, packaging, rent, salaries).",
		parameters:
			"amount (required), category (required: 'ads' | 'packaging' | 'delivery_fees' | 'returns' | 'supplies' | 'salary' | 'rent' | 'other'), description (optional), expense_date (optional: 'YYYY-MM-DD')",
		schema: {
			type: "object",
			properties: {
				amount: { type: "number" },
				category: {
					type: "string",
					enum: [
						"ads",
						"packaging",
						"delivery_fees",
						"returns",
						"supplies",
						"salary",
						"rent",
						"other",
					],
				},
				description: { type: "string" },
				expense_date: { type: "string" },
			},
			required: ["amount", "category"],
		},
		async execute(params, sellerId) {
			const supabase = await getSupabase();
			return handleAddExpense(
				{
					amount: params.amount as number,
					category: params.category as string,
					description: params.description as string | undefined,
					expense_date: params.expense_date as string | undefined,
				},
				sellerId,
				supabase,
			);
		},
	},
];

// ===== AGENT EXECUTION =====

export interface AgentStep {
	step:
		| "thinking"
		| "tool_call"
		| "tool_result"
		| "synthesis"
		| "complete"
		| "error";
	detail: string;
	toolName?: string;
}

export async function executeAgent(
	question: string,
	sellerId: string,
	languageInstruction: string,
	conversationHistory: { role: string; content: string }[] = [],
	locale: "ar" | "fr" | "en" = "en",
	onStep?: (step: AgentStep) => void,
): Promise<{
	answer: string;
	modelUsed?: string;
	actionCards?: { type: string; title: string; description?: string }[];
}> {
	onStep?.({ step: "thinking", detail: "Analyzing your request..." });

	// Phase 64F: Fast-fail if all tool-capable models are down
	const toolModels = [MODELS.brain, MODELS.deep];
	const anyHealthy = toolModels.some((m) => isModelHealthy(m.id));
	if (!anyHealthy) {
		onStep?.({
			step: "error",
			detail: "All AI models are currently unavailable",
		});
		return {
			answer:
				"خدمة الذكاء الاصطناعي غير متاحة حالياً. يرجى المحاولة بعد دقيقة. ⏳\n\nAI service is temporarily unavailable. Please try again in a minute.",
		};
	}

	const systemPrompt = `You are SahelFlow AI — an elite, expert-level business intelligence assistant built into the SahelFlow e-commerce platform for Algerian sellers.

${languageInstruction}

${getAlgerianLanguagePrompt()}

IDENTITY:
- You are the seller's most trusted business advisor, data analyst, and operations manager rolled into one
- You have DIRECT access to their real-time business data through specialized tools
- You understand Algerian e-commerce deeply: COD (Cash-on-Delivery), wilaya-based shipping, confirmation rates, WhatsApp-first sales, Darija/Franco-Arab language

CAPABILITIES YOU MUST LEVERAGE:
- 📊 Analytics: get_dashboard_stats, get_revenue_summary, get_cod_cashflow — always pull real numbers
- 📦 Orders: get_orders, get_order_by_number, create_order, update_order_status, delete_order
- 🛍️ Products: get_products, get_low_stock_products, create_product, update_product, delete_product
- 👥 Customers: get_customers, get_customer_orders, update_customer
- 🔍 Search: search_all — cross-entity search across orders, products, customers
- 📦 Delivery: create_shipment — ship orders via Yalidine
- ⚙️ Operations: get_automations, toggle_automation, get_shipping_rates, update_shipping_rate
- 🏪 Store: get_store_info
- 💰 Finance: get_cod_cashflow — track money in transit, collected, and returns
- ↩️ Returns: list_returns, create_return, update_return_status — manage customer returns, refunds, and exchange orders

BEHAVIORAL RULES:
1. ALWAYS call tools before answering data questions. NEVER guess or hallucinate numbers. You have the real data — use it.
2. When a seller asks about revenue/orders/stats without specifying a period — default to 'today' and mention you're showing today's numbers
3. Currency = Algerian Dinar. Format: "4,500 DA". Bold key numbers.
4. Be concise but insightful — add a quick business tip when relevant (e.g., "Your confirmation rate is 85% — above the 70% national average 🎯")
5. LANGUAGE RULE: You UNDERSTAND Darija, Franco-Arab, French, Arabic, and English input perfectly. But you MUST respond ONLY in the language specified in the language instruction above. NEVER respond in Darija or dialect — even if the user writes in Darija. This is critical.
6. For write operations (CREATE/UPDATE/DELETE), confirm first unless the seller is explicit and direct
7. Use search_all for fuzzy product/customer lookups — handle informal names gracefully
8. When showing lists, use bullet points with bold highlights. Keep it scannable.
9. If a seller asks "how am I doing?", pull dashboard_stats + revenue_summary and give a proper business health overview
10. You know the Algerian e-commerce landscape: peak seasons (Ramadan, back-to-school, wedding season), common product categories, wilaya delivery challenges, and confirmation best practices
11. CUSTOMER CREATION: You have a create_customer tool for standalone customer creation. However, when placing an order, you do NOT need to create the customer first — create_order handles customer auto-creation automatically. Use create_customer only when the seller explicitly asks to save a customer without placing an order.

PERSONALITY:
- Professional but warm — like a smart Algerian business partner
- Proactive: spot issues (low stock, high return rates, unconfirmed orders) and mention them
- Never say "I don't have access to your data" — you DO have access, use your tools
- When you execute an action successfully, be clear and celebratory about it`;

	const messages: ChatMessage[] = [
		{ role: "system", content: systemPrompt },
		...(conversationHistory as ChatMessage[]).slice(-12),
		{ role: "user", content: question },
	];

	// Groq strictly validates tool call outputs against schemas.
	// When the model sends null for optional params (e.g. {"status": null}),
	// Groq rejects it if schema says type:"string". Fix: make all non-required
	// properties accept null by converting type:"X" to type:["X","null"].
	const formattedTools = tools.map((t) => {
		const schema = t.schema || { type: "object", properties: {} };
		const required =
			((schema as Record<string, unknown>).required as string[]) || [];
		const props =
			(schema as Record<string, Record<string, unknown>>).properties || {};

		const fixedProps: Record<string, unknown> = {};
		for (const [key, val] of Object.entries(props)) {
			const prop = val as Record<string, unknown>;
			if (!required.includes(key) && prop && typeof prop.type === "string") {
				// Make optional params accept null
				fixedProps[key] = { ...prop, type: [prop.type, "null"] };
			} else {
				fixedProps[key] = val;
			}
		}

		return {
			type: "function" as const,
			function: {
				name: t.name,
				description: t.description,
				parameters: { ...schema, properties: fixedProps },
			},
		};
	});

	try {
		const toolDecision: RouteDecision = {
			primary: MODELS.brain,
			fallback: MODELS.deep,
			strategy: "single",
			reasoning: "tool_calling",
			latencyEstimate: "normal",
			darijaOptimized: classifyIntent(question).language === "darija",
		};
		onStep?.({ step: "thinking", detail: "Deciding which tools to use..." });

		const firstResult = await executeWithFallback(toolDecision, messages, {
			temperature: 0.5,
			useTools: true,
			tools: formattedTools,
			tool_choice: "auto",
		});

		let modelUsed = firstResult.modelUsed;
		let answer = firstResult.content || "";
		const tool_calls = firstResult.toolCalls;
		let actionCards:
			| { type: string; title: string; description?: string }[]
			| undefined;

		// Execute functions if requested
		if (tool_calls && tool_calls.length > 0) {
			onStep?.({
				step: "tool_call",
				detail: `Executing ${tool_calls.length} tool${tool_calls.length > 1 ? "s" : ""}...`,
			});
			actionCards = [];
			const toolResultsMessages: ChatMessage[] = [];

			// We use a regular loop instead of Promise.all to ensure we don't skip any tool calls
			// OpenAI/Groq REQUIRE that every tool_call_id is answered.
			for (const call of tool_calls) {
				if (!call.id || call.type !== "function") continue;

				const toolName = call.function?.name;
				const tool = tools.find((t) => t.name === toolName);

				if (tool) {
					onStep?.({
						step: "tool_call",
						detail: `Running ${toolName}...`,
						toolName,
					});
					const params: Record<string, unknown> = {};
					try {
						const raw = JSON.parse(call.function.arguments || "{}");
						// Strip null values — Groq may pass null for optional params
						for (const [k, v] of Object.entries(raw)) {
							if (v !== null && v !== undefined) params[k] = v;
						}
					} catch {
						// ignore bad JSON
					}

					try {
						const result = await tool.execute(params, sellerId);
						onStep?.({
							step: "tool_result",
							detail: `${toolName} completed`,
							toolName,
						});
						toolResultsMessages.push({
							role: "tool",
							tool_call_id: call.id,
							name: tool.name,
							content: JSON.stringify(result || { success: true }),
						});

						// Action cards for write operations
						const res2 = result as Record<string, unknown>;
						if (tool.name === "update_order_status" && res2?.success) {
							actionCards.push({
								type: "success",
								title: `Order ${res2.order_number} → ${res2.new_status}`,
								description: `Status changed from "${res2.previous_status}" to "${res2.new_status}"`,
							});
						}
						if (tool.name === "create_order" && res2?.success) {
							actionCards.push({
								type: "success",
								title: `Order ${res2.order_number} created`,
								description: `${res2.customer_name} — ${res2.total_price} DA`,
							});
						}
						if (tool.name === "create_product" && res2?.success) {
							actionCards.push({
								type: "success",
								title: `Product "${res2.name}" added`,
								description: `Price: ${res2.price} DA, Stock: ${res2.stock}`,
							});
						}
						if (tool.name === "update_product" && res2?.success) {
							actionCards.push({
								type: "success",
								title: `Product "${res2.name}" updated`,
								description: `Updated: ${Array.isArray(res2.updated_fields) ? res2.updated_fields.join(", ") : "details"}`,
							});
						}
						if (tool.name === "update_customer" && res2?.success) {
							actionCards.push({
								type: "success",
								title: `Customer "${res2.customer_name}" updated`,
								description: `Updated: ${Array.isArray(res2.updated_fields) ? res2.updated_fields.join(", ") : "details"}`,
							});
						}
						if (tool.name === "delete_order" && res2?.success) {
							actionCards.push({
								type: "info",
								title: `Order deleted`,
								description: `Order ${res2.order_number} has been deleted forever.`,
							});
						}
						if (tool.name === "delete_product" && res2?.success) {
							actionCards.push({
								type: "info",
								title: `Product deleted`,
								description: `Product "${res2.name}" was removed from your catalog.`,
							});
						}
						if (tool.name === "create_customer" && res2?.success) {
							actionCards.push({
								type: "success",
								title: `Customer "${res2.name}" created`,
								description: `${res2.phone} — ${res2.wilaya}`,
							});
						}
						if (tool.name === "create_shipment" && res2?.success) {
							actionCards.push({
								type: "success",
								title: `Shipment created for ${res2.order_number}`,
								description: `Tracking: ${res2.tracking_id} via ${res2.provider}`,
							});
						}
						if (tool.name === "add_expense" && res2?.success) {
							actionCards.push({
								type: "success",
								title: `Expense added: ${res2.amount} DA`,
								description: `Category: ${res2.category} - ${res2.description || ""}`,
							});
						}
					} catch (toolErr) {
						console.error(`Tool ${toolName} failed:`, toolErr);
						toolResultsMessages.push({
							role: "tool",
							tool_call_id: call.id,
							name: toolName,
							content: JSON.stringify({ error: "Tool execution failed" }),
						});
					}
				} else {
					// IMPORTANT: If tool is not found, we MUST still return a result for that ID
					toolResultsMessages.push({
						role: "tool",
						tool_call_id: call.id,
						name: toolName || "unknown",
						content: JSON.stringify({
							error: "Tool not found or not permitted",
						}),
					});
				}
			}

			onStep?.({ step: "synthesis", detail: "Analyzing results..." });

			// Check for errors in tool results
			const hasErrors = toolResultsMessages.some((tm) => {
				try {
					const parsed = JSON.parse(tm.content || "{}");
					return parsed && typeof parsed.error === "string";
				} catch {
					return false;
				}
			});
			const allErrors = toolResultsMessages.every((tm) => {
				try {
					const parsed = JSON.parse(tm.content || "{}");
					return parsed && typeof parsed.error === "string";
				} catch {
					return false;
				}
			});

			// Feed results back to AI for final synthesis
			if (toolResultsMessages.length > 0) {
				// Flatten tool results into a text block to completely bypass Groq's
				// strict "Tool choice is none" validation errors on the follow-up synthesis.
				const stringifiedResults = toolResultsMessages
					.map((t) => `${t.name} result: ${t.content}`)
					.join("\n");

				const followUpResult = await executeWithFallback(
					{
						primary: MODELS.craft,
						fallback: MODELS.brain,
						strategy: "single",
						reasoning: "synthesis",
						latencyEstimate: "fast",
						darijaOptimized: classifyIntent(question).language === "darija",
					},
					[
						...messages,
						{
							role: "system",
							content: `### BACKGROUND TOOL RESULTS SURFACED ###\n${stringifiedResults}${hasErrors ? "\n\nWARNING: Some tools failed with errors. Do not report their data as zero — report the actual errors to the user honestly." : ""}\n\nThe user cannot see this raw data. You must analyze the above tool results and answer the user's latest message based on this real data. DO NOT attempt to call any tools. ${allErrors ? "ALL tools failed. Report the errors to the user instead of making up data." : ""}`,
						},
						{
							role: "user",
							content: `Please analyze the tool results you received and provide a helpful, actionable summary with bold key numbers. If you see concerning patterns, mention them proactively. Add a quick business insight if appropriate. ${languageInstruction}`,
						},
					],
					{ temperature: 0.4, maxTokens: 2048 },
				);

				if (allErrors) {
					// All tools failed: return error directly without synthesis spin
					const errorMsgs = toolResultsMessages
						.map((tm) => {
							try {
								return JSON.parse(tm.content || "{}").error;
							} catch {
								return tm.content || "";
							}
						})
						.filter(Boolean)
						.join("\n");
					answer =
						errorMsgs || `All operations failed. Please try again later.`;
				} else {
					answer =
						followUpResult.content || `Here are the results of your action(s).`;
					modelUsed = followUpResult.modelUsed;
				}
			}
		}

		onStep?.({ step: "complete", detail: "Done" });

		return {
			answer: sanitizeDarijaLeaks((answer || "").trim(), locale),
			modelUsed,
			actionCards:
				actionCards && actionCards.length > 0 ? actionCards : undefined,
		};
	} catch (err) {
		const errorMsg = err instanceof Error ? err.message : String(err);
		console.error("Agent execution error:", errorMsg);
		onStep?.({ step: "error", detail: errorMsg });

		// Provide specific user-facing messages based on error type
		let userMessage = `Sorry, an error occurred while processing your request. Please try again.`;
		if (errorMsg.includes("429") || errorMsg.includes("rate")) {
			userMessage =
				"I'm receiving too many requests right now. Please wait a moment and try again. ⏳";
		} else if (
			errorMsg.includes("timeout") ||
			errorMsg.includes("AbortError") ||
			errorMsg.includes("max retries")
		) {
			userMessage =
				"The request took too long to process. Please try a simpler question or try again in a moment. ⏱️";
		} else if (errorMsg.includes("GROQ_API_KEY")) {
			userMessage =
				"AI service is not configured properly. Please contact support. 🔧";
		}

		return {
			answer: userMessage,
		};
	}
}
