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
import { getDeliveryAdapter } from "@/lib/delivery/adapters";

const ALGERIAN_PHONE_REGEX = /^(05|06|07)[0-9]{8}$/;

function validateAlgerianPhone(phone: string): boolean {
	return ALGERIAN_PHONE_REGEX.test(phone);
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
		console.error(`[handleUpdateOrderStatus] Supabase error:`, orderError.message);
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
			`[handleCreateOrder] Catalog fetch error:`,
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
					`[handleCreateOrder] No price for item "${item.name}" and no catalog match. Defaulting to 0.`,
				);
				return { ...item, price: 0 };
			}
			return item;
		});
	} else {
		items = items.map((item) => {
			if ((item.price || 0) <= 0) {
				console.warn(
					`[handleCreateOrder] No price for item "${item.name}" (catalog empty). Defaulting to 0.`,
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

	let deliveryCost = 400;
	try {
		const { data: seller } = await supabase
			.from("sellers")
			.select("shipping_rates")
			.eq("id", sellerId)
			.single();

		if (seller?.shipping_rates) {
			const rates = seller.shipping_rates as Record<
				string,
				{ home: number; desk: number }
			>;
			const { WILAYAS, ZONE_PRICES } = await import("@/lib/data/wilayas");
			const wilaya = WILAYAS.find(
				(w) => w.name.toLowerCase() === params.wilaya!.toLowerCase(),
			);
			if (wilaya && rates[wilaya.code]) {
				deliveryCost = rates[wilaya.code].home;
			} else if (wilaya) {
				const zonePrice = ZONE_PRICES[wilaya.zone];
				if (zonePrice) deliveryCost = zonePrice.home;
			}
		}
	} catch (err) {
		console.error(`[handleCreateOrder] Shipping rate lookup failed:`, err);
	}

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
				.neq("id", orderId)
				.gte(
					"created_at",
					new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
				)
				.limit(1);

			const customerDupes = dupes?.filter((d: { id: string }) => {
				const dId = d.id;
				return dId !== orderId;
			});

			if (customerDupes && customerDupes.length > 0) {
				warnings.push(
					`Warning: this customer already has a pending order ${customerDupes[0].order_number}`,
				);

				await supabase
					.from("orders")
					.update({ confirmation_status: "doublon" })
					.eq("id", orderId);

				await supabase.from("agent_activity").insert({
					seller_id: sellerId,
					type: "alert",
					title: "Duplicate order detected",
					description: `AI-created order ${result.order_number} shares a phone number with existing order ${customerDupes[0].order_number}`,
					metadata: { order_id: orderId, duplicate_of: customerDupes[0].id },
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
		.ilike("name", params.name)
		.single();

	if (productError) {
		console.error(`[handleUpdateProduct] Supabase error:`, productError.message);
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
	if (!params.phone && !params.name) {
		return { error: "Either phone or name is required to find the customer." };
	}

	let query = supabase
		.from("customers")
		.select("id, name")
		.eq("seller_id", sellerId);

	if (params.phone) {
		query = query.ilike("phone", `%${String(params.phone).slice(-9)}`);
	} else {
		query = query.ilike("name", params.name!);
	}

	const { data: customer, error: customerError } = await query.single();

	if (customerError) {
		console.error(`[handleUpdateCustomer] Supabase error:`, customerError.message);
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
		console.error(`[handleDeleteOrder] Supabase error:`, lookupError.message);
		return { error: `Database error: ${lookupError.message}` };
	}
	if (!data) return { error: "Order not found" };
	const { error: deleteError } = await supabase
		.from("orders")
		.delete()
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
		.ilike("name", params.name)
		.limit(2);
	if (lookupError) {
		console.error(`[handleDeleteProduct] Supabase error:`, lookupError.message);
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
		.delete()
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
	const { WILAYAS } = await import("@/lib/data/wilayas");
	const w = WILAYAS.find(
		(x) => x.name.toLowerCase() === String(params.wilaya).toLowerCase(),
	);
	if (!w) return { error: "Invalid wilaya name" };

	const { data, error: lookupError } = await supabase
		.from("sellers")
		.select("shipping_rates")
		.eq("id", sellerId)
		.single();
	if (lookupError) {
		console.error(`[handleUpdateShippingRate] Supabase error:`, lookupError.message);
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
		.ilike("name", params.name)
		.single();
	if (lookupError) {
		console.error(`[handleToggleAutomation] Supabase error:`, lookupError.message);
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
		console.error(`[handleCreateShipment] Supabase error:`, orderError.message);
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

	const { data: integration, error: integrationError } = await supabase
		.from("integrations")
		.select("credentials")
		.eq("seller_id", sellerId)
		.eq("platform", "yalidine")
		.eq("is_active", true)
		.single();

	if (integrationError) {
		console.error(`[handleCreateShipment] Supabase error:`, integrationError.message);
		return { error: `Database error: ${integrationError.message}` };
	}

	if (!integration) {
		return {
			error:
				"Yalidine integration not configured. Connect Yalidine in Settings → Integrations first.",
		};
	}

	const adapter = getDeliveryAdapter("yalidine");
	if (!adapter) {
		return { error: "Yalidine delivery adapter not available." };
	}

	const customer = order.customer as unknown as Record<string, string> | null;
	const shipmentItems = (order.items as Array<Record<string, unknown>>) || [];

	const result = await adapter.createShipment(
		{
			orderId: order.id,
			orderNumber: order.order_number,
			customer: {
				name: customer?.name || "Unknown",
				phone: customer?.phone || "",
				wilaya: customer?.wilaya || order.wilaya || "",
				commune: customer?.commune || order.commune || "",
				address: customer?.address || order.address || "",
			},
			items: shipmentItems.map((i) => ({
				name: String(i.product_name || i.name || "Item"),
				quantity: Number(i.quantity || 1),
				unitPrice: Number(i.unit_price || i.price || 0),
			})),
			totalPrice: Number(order.total_price),
			weight: 0.5,
			notes: "",
		},
		integration.credentials as Record<string, unknown>,
	);

	if (!result.success) {
		return { error: `Shipment creation failed: ${result.error}` };
	}

	await supabase.from("deliveries").insert({
		order_id: order.id,
		seller_id: sellerId,
		provider: "yalidine",
		tracking_number: result.trackingId,
		status: "created",
		raw_response: result as unknown as Record<string, unknown>,
	});

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
