/**
 * SahelFlow AI Tool Handlers — Delegation Layer
 *
 * All mutation (write) operations from the AI agent route through this layer
 * to ensure business logic consistency with the service layer and enforce
 * validation rules (Algerian phone format, stock integrity, etc.).
 *
 * Dependency Injection: each handler receives a Supabase client instance
 * so it works in any auth context (user session, service role, etc.).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Escape special characters in ilike/like patterns to prevent wildcard injection.
 * Postgres LIKE/ILIKE treats % and _ as wildcards.
 * Users sending "100%" or "test_product" could match unintended rows.
 */
function escapeLike(str: string): string {
	return str.replace(/[%_\\]/g, "\\$&");
}
import { createShipmentForOrder } from "@/lib/delivery/shipment-service";
import { normalizeWilayaName } from "@/lib/data/wilayas";
import { calculateDeliveryCost } from "@/lib/data/shipping-calculator";
import { isValidAlgerianPhone, toLocalFormat } from "@/lib/phone-utils";

// Phase 6.16: Replaced inline regex with centralized phone-utils
function cleanAlgerianPhone(phone: string): string {
	return toLocalFormat(phone) || phone;
}

function validateAlgerianPhone(phone: string): boolean {
	return isValidAlgerianPhone(phone);
}

export async function handleUpdateOrderStatus(
	params: { order_number: string; new_status: string },
	sellerId: string,
	supabase: SupabaseClient,
) {
	if (!params.order_number || !params.new_status) {
		return { error: "Both order_number and new_status are required." };
	}

	const { data: order, error: orderError } = await supabase
		.from("orders")
		.select("id, status")
		.eq("seller_id", sellerId)
		.eq("order_number", params.order_number)
		.single();

	if (orderError) {
		console.error(
			`[Tool handleUpdateOrderStatus] Supabase error:`,
			orderError.message,
		);
		return { error: `Database error: ${orderError.message}` };
	}

	if (!order) {
		return { error: `Order ${params.order_number} not found.` };
	}

	const { error } = await supabase.rpc("atomic_update_order_status", {
		p_order_id: order.id,
		p_new_status: params.new_status,
	});

	if (error) return { error: error.message };

	return {
		success: true,
		order_number: params.order_number,
		previous_status: order.status,
		new_status: params.new_status,
	};
}

export async function handleCreateOrder(
	params: {
		customer_name?: string;
		phone?: string;
		wilaya?: string;
		commune?: string;
		address?: string;
		items?: Array<{
			product_id?: string;
			name: string;
			quantity: number;
			price?: number;
		}>;
		notes?: string;
	},
	sellerId: string,
	supabase: SupabaseClient,
) {
	if (params.phone) {
		params.phone = cleanAlgerianPhone(params.phone);
	}
	if (params.wilaya) {
		const normalized = normalizeWilayaName(params.wilaya);
		if (normalized) {
			params.wilaya = normalized;
		}
	}

	if (
		!params.customer_name ||
		!params.phone ||
		!params.wilaya ||
		!params.items
	) {
		return { error: "customer_name, phone, wilaya, and items are required." };
	}

	if (!validateAlgerianPhone(params.phone)) {
		return {
			error: `Invalid Algerian phone number: ${params.phone}. Must start with 05, 06, or 07 followed by 8 digits.`,
		};
	}

	let items = params.items;

	const { data: catalog, error: catalogError } = await supabase
		.from("products")
		.select("id, name, price, stock")
		.eq("seller_id", sellerId);
	if (catalogError) {
		console.error(
			`[Tool handleCreateOrder] Catalog fetch error:`,
			catalogError.message,
		);
	}

	if (catalog && catalog.length > 0) {
		items = items.map((item) => {
			if ((item.price || 0) > 0 && item.product_id) return item;

			let bestMatch = catalog.find(
				(p: Record<string, unknown>) =>
					(p.name as string).toLowerCase() === item.name.toLowerCase(),
			);

			if (!bestMatch) {
				bestMatch = catalog.find(
					(p: Record<string, unknown>) =>
						(p.name as string)
							.toLowerCase()
							.includes(item.name.toLowerCase()) ||
						item.name.toLowerCase().includes((p.name as string).toLowerCase()),
				);
			}

			if (bestMatch) {
				return {
					...item,
					product_id: bestMatch.id,
					name: bestMatch.name,
					price: (item.price || 0) > 0 ? item.price : bestMatch.price,
				};
			}
			if ((item.price || 0) <= 0) {
				console.warn(
					`[Tool handleCreateOrder] No price for item "${item.name}" and no catalog match. Defaulting to 0.`,
				);
				return { ...item, price: 0 };
			}
			return item;
		});
	} else {
		items = items.map((item) => {
			if ((item.price || 0) <= 0) {
				console.warn(
					`[Tool handleCreateOrder] No price for item "${item.name}" (catalog empty). Defaulting to 0.`,
				);
				return { ...item, price: 0 };
			}
			return item;
		});
	}

	const totalPrice = items.reduce(
		(sum, item) => sum + item.quantity * (item.price || 0),
		0,
	);

	const deliveryCost = await calculateDeliveryCost(
		supabase,
		sellerId,
		params.wilaya,
		"home",
	);

	const { data, error } = await supabase.rpc("atomic_create_order", {
		p_seller_id: sellerId,
		p_customer_name: params.customer_name,
		p_customer_phone: params.phone,
		p_customer_wilaya: params.wilaya,
		p_customer_commune: params.commune || null,
		p_customer_address: params.address || null,
		p_items: items,
		p_total_price: totalPrice,
		p_delivery_cost: deliveryCost,
		p_net_profit: 0,
		p_wilaya: params.wilaya,
		p_commune: params.commune || null,
		p_address: params.address || null,
		p_source: "ai",
		p_external_id: null,
		p_notes: params.notes || null,
		p_delivery_type: "home",
		p_status: "pending",
	});

	if (error) {
		return { error: `Failed to create order: ${error.message}` };
	}

	const result = data as Record<string, unknown>;
	const orderId = result.order_id as string;
	const customerId = result.customer_id as string | null;

	const warnings: string[] = [];

	if (customerId) {
		try {
			const { data: dupes } = await supabase
				.from("orders")
				.select("id, order_number")
				.eq("seller_id", sellerId)
				.in("status", ["draft", "pending"])
				.eq("customer_id", customerId)
				.neq("id", orderId)
				.gte(
					"created_at",
					new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
				)
				.limit(1);

			if (dupes && dupes.length > 0) {
				warnings.push(
					`Warning: this customer already has a pending order ${dupes[0].order_number}`,
				);

				await supabase
					.from("orders")
					.update({ confirmation_status: "doublon" })
					.eq("id", orderId);

				await supabase.from("agent_activity").insert({
					seller_id: sellerId,
					type: "alert",
					title: "Duplicate order detected",
					description: `AI-created order ${result.order_number} shares a phone number with existing order ${dupes[0].order_number}`,
					metadata: { order_id: orderId, duplicate_of: dupes[0].id },
				});
			}
		} catch {
			/* non-blocking */
		}
	}

	return {
		success: true,
		order_number: result.order_number,
		total_price: totalPrice,
		delivery_cost: deliveryCost,
		customer_name: params.customer_name,
		...(warnings.length > 0 ? { warnings } : {}),
	};
}

export async function handleCreateProduct(
	params: {
		name?: string;
		price?: number;
		stock?: number;
		description?: string;
		sku?: string;
		cost_price?: number;
	},
	sellerId: string,
	supabase: SupabaseClient,
) {
	if (!params.name || params.price === undefined) {
		return { error: "name and price are required." };
	}

	const { error } = await supabase.from("products").insert({
		seller_id: sellerId,
		name: params.name,
		price: Number(params.price),
		stock: params.stock !== undefined ? Number(params.stock) : 0,
		description: params.description || null,
		sku: params.sku || null,
		cost_price: params.cost_price !== undefined ? Number(params.cost_price) : 0,
		active: true,
	});

	if (error) {
		return { error: `Failed to create product: ${error.message}` };
	}

	return {
		success: true,
		name: params.name,
		price: Number(params.price),
		stock: params.stock !== undefined ? Number(params.stock) : 0,
		cost_price: params.cost_price !== undefined ? Number(params.cost_price) : 0,
		sku: params.sku || null,
		description: params.description || null,
	};
}

export async function handleUpdateProduct(
	params: {
		name?: string;
		price?: number;
		cost_price?: number;
		stock?: number;
		description?: string;
		active?: boolean;
	},
	sellerId: string,
	supabase: SupabaseClient,
) {
	if (!params.name) {
		return { error: "name is required to find the product." };
	}

	const { data: product, error: productError } = await supabase
		.from("products")
		.select("id, name")
		.eq("seller_id", sellerId)
		.ilike("name", escapeLike(params.name))
		.single();

	if (productError) {
		console.error(
			`[Tool handleUpdateProduct] Supabase error:`,
			productError.message,
		);
		return { error: `Database error: ${productError.message}` };
	}

	if (!product) {
		return { error: "Product not found" };
	}

	const updates: Record<string, unknown> = {};
	if (params.price !== undefined) updates.price = Number(params.price);
	if (params.cost_price !== undefined)
		updates.cost_price = Number(params.cost_price);
	if (params.stock !== undefined) updates.stock = Number(params.stock);
	if (params.description !== undefined)
		updates.description = params.description;
	if (params.active !== undefined) updates.active = params.active;

	if (Object.keys(updates).length === 0) {
		return { error: "No fields to update." };
	}

	const { error } = await supabase
		.from("products")
		.update(updates)
		.eq("id", product.id);

	if (error) {
		return { error: `Failed to update product: ${error.message}` };
	}

	return {
		success: true,
		name: product.name,
		updated_fields: Object.keys(updates),
	};
}

export async function handleUpdateCustomer(
	params: {
		phone?: string;
		name?: string;
		is_blocked?: boolean;
		notes?: string;
		wilaya?: string;
	},
	sellerId: string,
	supabase: SupabaseClient,
) {
	if (params.phone) {
		params.phone = cleanAlgerianPhone(params.phone);
	}
	if (params.wilaya) {
		const normalized = normalizeWilayaName(params.wilaya);
		if (normalized) {
			params.wilaya = normalized;
		}
	}

	if (!params.phone && !params.name) {
		return { error: "Either phone or name is required to find the customer." };
	}

	let query = supabase
		.from("customers")
		.select("id, name")
		.eq("seller_id", sellerId);

	if (params.phone) {
		query = query.eq("phone", params.phone);
	} else {
		query = query.ilike("name", escapeLike(params.name!));
	}

	const { data: customer, error: customerError } = await query.maybeSingle();

	if (customerError) {
		console.error(
			`[Tool handleUpdateCustomer] Supabase error:`,
			customerError.message,
		);
		return { error: `Database error: ${customerError.message}` };
	}

	if (!customer) {
		return { error: "Customer not found" };
	}

	const updates: Record<string, unknown> = {};
	if (params.is_blocked !== undefined) updates.is_blocked = params.is_blocked;
	if (params.notes !== undefined) updates.notes = params.notes;
	if (params.wilaya !== undefined) updates.wilaya = params.wilaya;

	if (Object.keys(updates).length === 0) {
		return { error: "No fields to update." };
	}

	const { error } = await supabase
		.from("customers")
		.update(updates)
		.eq("id", customer.id);

	if (error) {
		return { error: `Failed to update customer: ${error.message}` };
	}

	return {
		success: true,
		customer_name: customer.name,
		updated_fields: Object.keys(updates),
	};
}

export async function handleDeleteOrder(
	params: { order_number?: string },
	sellerId: string,
	supabase: SupabaseClient,
) {
	if (!params.order_number) return { error: "order_number is required" };
	const { data, error: lookupError } = await supabase
		.from("orders")
		.select("id")
		.eq("seller_id", sellerId)
		.eq("order_number", params.order_number)
		.single();
	if (lookupError) {
		console.error(`[Tool handleDeleteOrder] Supabase error:`, lookupError.message);
		return { error: `Database error: ${lookupError.message}` };
	}
	if (!data) return { error: "Order not found" };
	const { error: deleteError } = await supabase
		.from("orders")
		.update({ deleted_at: new Date().toISOString() })
		.eq("id", data.id);
	if (deleteError) {
		return { error: `Failed to delete order: ${deleteError.message}` };
	}
	return { success: true, order_number: params.order_number };
}

export async function handleDeleteProduct(
	params: { name?: string },
	sellerId: string,
	supabase: SupabaseClient,
) {
	if (!params.name) return { error: "name required" };
	// Require exact name match for destructive operations to prevent accidental deletion
	const { data, error: lookupError } = await supabase
		.from("products")
		.select("id, name")
		.eq("seller_id", sellerId)
		.ilike("name", escapeLike(params.name))
		.limit(2);
	if (lookupError) {
		console.error(`[Tool handleDeleteProduct] Supabase error:`, lookupError.message);
		return { error: `Database error: ${lookupError.message}` };
	}
	if (!data || data.length === 0) return { error: "Product not found" };
	if (data.length > 1) {
		return {
			error: `Multiple products match "${params.name}". Please use the exact product name.`,
			matches: (data as Array<Record<string, unknown>>).map((p) => p.name),
		};
	}
	const { error: deleteError } = await supabase
		.from("products")
		.update({ deleted_at: new Date().toISOString() })
		.eq("id", data[0].id);
	if (deleteError) {
		return { error: `Failed to delete product: ${deleteError.message}` };
	}
	return { success: true, name: data[0].name };
}

export async function handleUpdateShippingRate(
	params: { wilaya?: string; home_price?: number },
	sellerId: string,
	supabase: SupabaseClient,
) {
	if (!params.wilaya || params.home_price === undefined)
		return { error: "wilaya and home_price required" };

	const normalized = normalizeWilayaName(params.wilaya);
	const targetWilaya = normalized || params.wilaya;

	const { WILAYAS } = await import("@/lib/data/wilayas");
	const w = WILAYAS.find(
		(x) => x.name.toLowerCase() === String(targetWilaya).toLowerCase(),
	);
	if (!w) return { error: "Invalid wilaya name" };

	const { data, error: lookupError } = await supabase
		.from("sellers")
		.select("shipping_rates")
		.eq("id", sellerId)
		.single();
	if (lookupError) {
		console.error(
			`[Tool handleUpdateShippingRate] Supabase error:`,
			lookupError.message,
		);
		return { error: `Database error: ${lookupError.message}` };
	}
	const rates = (data?.shipping_rates || {}) as Record<
		string,
		{ home: number; desk: number }
	>;
	rates[w.code] = { ...rates[w.code], home: Number(params.home_price) };
	const { error: updateError } = await supabase
		.from("sellers")
		.update({ shipping_rates: rates })
		.eq("id", sellerId);
	if (updateError) {
		return { error: `Failed to update shipping rate: ${updateError.message}` };
	}
	return {
		success: true,
		wilaya: w.name,
		new_home_price: Number(params.home_price),
	};
}

export async function handleToggleAutomation(
	params: { name?: string; active?: boolean },
	sellerId: string,
	supabase: SupabaseClient,
) {
	if (!params.name || params.active === undefined)
		return { error: "name and active required" };
	const { data, error: lookupError } = await supabase
		.from("automations")
		.select("id")
		.eq("seller_id", sellerId)
		.ilike("name", escapeLike(params.name))
		.single();
	if (lookupError) {
		console.error(
			`[Tool handleToggleAutomation] Supabase error:`,
			lookupError.message,
		);
		return { error: `Database error: ${lookupError.message}` };
	}
	if (!data) return { error: "Automation not found" };
	const { error: updateError } = await supabase
		.from("automations")
		.update({ active: params.active })
		.eq("id", data.id);
	if (updateError) {
		return { error: `Failed to toggle automation: ${updateError.message}` };
	}
	return {
		success: true,
		automation_name: params.name,
		active: params.active,
	};
}

export async function handleCreateShipment(
	params: { order_number?: string },
	sellerId: string,
	supabase: SupabaseClient,
) {
	if (!params.order_number) {
		return { error: "order_number is required." };
	}

	const { data: order, error: orderError } = await supabase
		.from("orders")
		.select(
			"id, order_number, status, items, total_price, wilaya, commune, address, customer:customers(name, phone, wilaya, commune, address)",
		)
		.eq("seller_id", sellerId)
		.eq("order_number", params.order_number)
		.single();

	if (orderError) {
		console.error(`[Tool handleCreateShipment] Supabase error:`, orderError.message);
		return { error: `Database error: ${orderError.message}` };
	}

	if (!order) {
		return { error: `Order ${params.order_number} not found.` };
	}

	if (order.status !== "confirmed" && order.status !== "pending") {
		return {
			error: `Order must be confirmed or pending to create shipment. Current status: ${order.status}`,
		};
	}

	const customer = order.customer as unknown as Record<string, string> | null;
  const shipmentItems = (order.items as Array<Record<string, unknown>>) || [];

  const result = await createShipmentForOrder({
    supabase,
    sellerId,
    orderId: order.id,
    orderNumber: order.order_number,
    totalPrice: Number(order.total_price),
    customer: {
      name: customer?.name || "Unknown",
      phone: customer?.phone || "",
      wilaya: customer?.wilaya || order.wilaya || "",
      commune: customer?.commune || order.commune || "",
      address: customer?.address || order.address || "",
    },
    items: shipmentItems.map((i) => ({
      product_name: String(i.product_name || i.name || "Item"),
      quantity: Number(i.quantity || 1),
      unit_price: Number(i.unit_price || i.price || 0),
      weight: Number(i.weight || 0),
    })),
  });

  if (!result.success) {
    return { error: "Shipment creation failed: " + result.error };
  }

  await supabase
    .from("orders")
    .update({
      tracking_id: result.trackingId,
      delivery_company: "yalidine",
    })
    .eq("id", order.id);

  return {
    success: true,
    order_number: params.order_number,
    tracking_id: result.trackingId,
    provider: "yalidine",
    estimated_delivery: result.estimatedDelivery,
  };
}

export async function handleListReturns(
	params: { status?: string },
	sellerId: string,
	supabase: SupabaseClient,
) {
	let query = supabase
		.from("returns")
		.select("*, order:orders(order_number, customer:customers(name, phone))")
		.eq("seller_id", sellerId)
		.order("created_at", { ascending: false })
		.limit(10);

	if (params.status && params.status !== "all") {
		query = query.eq("status", params.status);
	}

	const { data, error } = await query;
	if (error) {
		console.error(`[Tool handleListReturns] Supabase error:`, error.message);
		return { error: `Database error: ${error.message}` };
	}

	if (!data || data.length === 0) {
		return {
			message:
				"لم يتم العثور على طلبات إرجاع / Aucun retour trouvé / No return requests found.",
			returns: [],
		};
	}

	return data.map((r) => ({
		return_number: r.return_number,
		order_number:
			((r.order as Record<string, unknown>)?.order_number as string) ||
			"Unknown",
		customer_name:
			((
				(r.order as Record<string, unknown>)?.customer as Record<
					string,
					unknown
				>
			)?.name as string) || "Unknown",
		status: r.status,
		reason: r.reason,
		resolution_type: r.resolution_type,
		refund_amount: r.refund_amount,
		created_at: r.created_at,
	}));
}

export async function handleCreateReturn(
	params: {
		order_number?: string;
		type?: "return" | "exchange" | "refund";
		reason?: string;
		reason_details?: string;
		resolution_type?: "refund" | "exchange" | "credit" | "reject";
		refund_amount?: number;
	},
	sellerId: string,
	supabase: SupabaseClient,
) {
	if (!params.order_number || !params.type || !params.reason) {
		return { error: "order_number, type, and reason are required." };
	}

	// 1. Find the original order
	const { data: order, error: orderError } = await supabase
		.from("orders")
		.select("id, items, total_price, customer_id")
		.eq("seller_id", sellerId)
		.eq("order_number", params.order_number)
		.single();

	if (orderError || !order) {
		return { error: `Original order #${params.order_number} not found.` };
	}

	// 2. Map items from original order
	const orderItems = (order.items as Array<Record<string, unknown>>) || [];
	const returnItems = orderItems.map((item) => ({
		product_id: item.product_id || item.id,
		product_name: item.product_name || item.name || "Item",
		quantity: Number(item.quantity || 1),
		price: Number(item.price || item.unit_price || 0),
		cost_price: Number(item.cost_price || 0),
	}));

	const resType =
		params.resolution_type ||
		(params.type === "refund"
			? "refund"
			: params.type === "exchange"
				? "exchange"
				: "credit");
	const refAmount =
		params.refund_amount !== undefined
			? params.refund_amount
			: resType === "refund"
				? Number(order.total_price || 0)
				: 0;

	// 3. Create return request
	const { data: retObj, error: insertError } = await supabase
		.from("returns")
		.insert({
			seller_id: sellerId,
			order_id: order.id,
			customer_id: order.customer_id,
			reason: params.reason,
			reason_details: params.reason_details || null,
			resolution_type: resType,
			refund_amount: refAmount,
			items: returnItems,
			status: "requested",
		})
		.select()
		.single();

	if (insertError) {
		console.error(`[Tool handleCreateReturn] Insert error:`, insertError.message);
		return { error: `Failed to create return: ${insertError.message}` };
	}

	// 4. Create initial timeline log
	await supabase.from("return_notes").insert({
		return_id: retObj.id,
		author_id: sellerId,
		type: "system",
		content: `Return request created via AI. Type: ${params.type}. Reason: ${params.reason}.`,
	});

	return {
		success: true,
		return_number: retObj.return_number,
		order_number: params.order_number,
		type: params.type,
		resolution_type: resType,
		refund_amount: refAmount,
	};
}

export async function handleUpdateReturnStatus(
	params: {
		return_number?: string;
		new_status?: string;
		notes?: string;
	},
	sellerId: string,
	supabase: SupabaseClient,
) {
	if (!params.return_number || !params.new_status) {
		return { error: "Both return_number and new_status are required." };
	}

	// 1. Fetch return details
	const { data: returnObj, error: fetchError } = await supabase
		.from("returns")
		.select("*")
		.eq("seller_id", sellerId)
		.eq("return_number", params.return_number)
		.single();

	if (fetchError || !returnObj) {
		return { error: `Return request ${params.return_number} not found.` };
	}

	const rawUpdates: Record<string, unknown> = {
		status: params.new_status,
		updated_at: new Date().toISOString(),
	};

	if (params.new_status === "approved" && returnObj.status === "requested") {
		rawUpdates.approved_at = new Date().toISOString();
	} else if (
		params.new_status === "received" &&
		returnObj.status !== "received"
	) {
		rawUpdates.received_at = new Date().toISOString();
	} else if (
		["refunded", "exchanged", "closed", "rejected"].includes(
			params.new_status,
		) &&
		!returnObj.resolved_at
	) {
		rawUpdates.resolved_at = new Date().toISOString();
	}

	// Auto-create exchange order if status changes to exchanged and exchange_order_id not set
	// W4 fix: Guard against race condition where two concurrent calls both create exchange orders.
	if (params.new_status === "exchanged" && !returnObj.exchange_order_id) {
		// Fetch original order details
		const { data: originalOrder, error: orderError } = await supabase
			.from("orders")
			.select("*")
			.eq("id", returnObj.order_id)
			.single();

		if (!orderError && originalOrder) {
			const exchangeItems = (
				returnObj.items as Array<Record<string, unknown>>
			).map((item) => ({
				name: String(item.product_name ?? item.name ?? "Item"),
				quantity: Number(item.quantity ?? 1),
				price: Number(item.price ?? item.unit_price ?? 0),
				product_id: String(item.product_id ?? item.id ?? ""),
				variant: String(item.variant_id ?? item.variant ?? "") || undefined,
			}));

			const exchangeTotal =
				returnObj.resolution_type === "exchange"
					? 0
					: returnObj.refund_amount || 0;

			// Create new order
			const { data: newOrder, error: insertOrderError } = await supabase
				.from("orders")
				.insert({
					seller_id: sellerId,
					customer_id: originalOrder.customer_id,
					items: exchangeItems,
					total_price: exchangeTotal,
					delivery_cost: await calculateDeliveryCost(supabase, sellerId, originalOrder.wilaya as string | null, (originalOrder.delivery_type as "home" | "desk") || "home"),
					wilaya: originalOrder.wilaya,
					commune: originalOrder.commune,
					address: originalOrder.address,
					notes: `طلب استبدال للطلب رقم #${originalOrder.order_number} (RET: ${returnObj.return_number})`,
					status: "pending",
					confirmation_status: "confirmed",
				})
				.select()
				.single();

			if (!insertOrderError && newOrder) {
				// W4 fix: Atomically claim the exchange order. Only set exchange_order_id
				// if it's still null (prevents duplicate exchange orders from concurrent calls).
				const { data: claimed, error: claimErr } = await supabase
					.from("returns")
					.update({ exchange_order_id: newOrder.id })
					.eq("id", returnObj.id)
					.is("exchange_order_id", null)
					.select("id")
					.single();

				if (claimErr || !claimed) {
					// Another concurrent call already claimed this return — delete our duplicate order
					await supabase.from("orders").delete().eq("id", newOrder.id);
					console.warn(
						`[Tool handleUpdateReturnStatus] Duplicate exchange order prevented for return ${returnObj.id}`,
					);
				} else {
					rawUpdates.exchange_order_id = newOrder.id;
				}

				// Add timeline log for auto-created order
				await supabase.from("return_notes").insert({
					return_id: returnObj.id,
					author_id: sellerId,
					type: "system",
					content: `تم إنشاء طلب استبدال جديد برقم #${newOrder.order_number} تلقائياً.`,
				});
			}
		}
	}

	// 2. Perform DB update
	const { data: _updatedReturn, error: updateError } = await supabase
		.from("returns")
		.update(rawUpdates)
		.eq("id", returnObj.id)
		.select()
		.single();

	if (updateError) {
		return { error: `Failed to update return: ${updateError.message}` };
	}

	// 3. Add custom note if provided
	if (params.notes) {
		await supabase.from("return_notes").insert({
			return_id: returnObj.id,
			author_id: sellerId,
			type: "note",
			content: params.notes,
		});
	}

	return {
		success: true,
		return_number: params.return_number,
		previous_status: returnObj.status,
		new_status: params.new_status,
		exchange_order_id: rawUpdates.exchange_order_id || null,
	};
}

export async function handleGetPnL(
	params: { period?: string },
	sellerId: string,
	supabase: SupabaseClient,
) {
	const period = params.period || "30d";
	const { data, error } = await supabase.rpc("get_pnl_summary", {
		p_period: period,
	});

	if (error) {
		console.error(`[Tool handleGetPnL] RPC error:`, error.message);
		return { error: `Failed to fetch P&L summary: ${error.message}` };
	}

	return {
		success: true,
		period,
		...(data as Record<string, unknown>),
	};
}

export async function handleListExpenses(
	params: { category?: string },
	sellerId: string,
	supabase: SupabaseClient,
) {
	let query = supabase
		.from("expenses")
		.select("*")
		.eq("seller_id", sellerId)
		.order("expense_date", { ascending: false })
		.limit(20);

	if (params.category && params.category !== "all") {
		query = query.eq("category", params.category);
	}

	const { data, error } = await query;
	if (error) {
		console.error(`[Tool handleListExpenses] Supabase error:`, error.message);
		return { error: `Failed to fetch expenses: ${error.message}` };
	}

	return {
		success: true,
		expenses: data || [],
	};
}

export async function handleAddExpense(
	params: {
		amount?: number;
		category?: string;
		description?: string;
		expense_date?: string;
	},
	sellerId: string,
	supabase: SupabaseClient,
) {
	if (params.amount === undefined || !params.category) {
		return { error: "Both amount and category are required." };
	}

	const categoryEnum = [
		"ads",
		"packaging",
		"delivery_fees",
		"returns",
		"supplies",
		"salary",
		"rent",
		"other",
	];

	if (!categoryEnum.includes(params.category)) {
		return {
			error: `Invalid category: "${params.category}". Supported: ${categoryEnum.join(", ")}`,
		};
	}

	const { data, error } = await supabase
		.from("expenses")
		.insert({
			seller_id: sellerId,
			amount: Number(params.amount),
			category: params.category,
			description: params.description || null,
			expense_date:
				params.expense_date || new Date().toISOString().split("T")[0],
		})
		.select()
		.single();

	if (error) {
		console.error(`[Tool handleAddExpense] Supabase error:`, error.message);
		return { error: `Failed to create expense: ${error.message}` };
	}

	return {
		success: true,
		id: data.id,
		amount: data.amount,
		category: data.category,
		description: data.description,
		expense_date: data.expense_date,
	};
}
