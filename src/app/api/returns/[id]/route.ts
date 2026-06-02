import { NextRequest, NextResponse } from "next/server";
import { withAuthAndRateLimit } from "@/lib/api-wrapper";
import { updateReturnStatusSchema } from "@/lib/validation";

// GET /api/returns/[id] — get details of a specific return request and its notes
export const GET = withAuthAndRateLimit(
	async (req: NextRequest, { user: _user, sellerId, supabase, params }) => {
		const { id } = params;

		const { data: returnObj, error: returnError } = await supabase
			.from("returns")
			.select(
				"*, order:orders(id, order_number, items, total_price, customer:customers(*))",
			)
			.eq("id", id)
			.eq("seller_id", sellerId)
			.is("deleted_at", null)
			.single();

		if (returnError || !returnObj) {
			return NextResponse.json(
				{ error: "Return request not found" },
				{ status: 404 },
			);
		}

		const { data: notes, error: notesError } = await supabase
			.from("return_notes")
			.select("*")
			.eq("return_id", id)
			.order("created_at", { ascending: true });

		if (notesError) {
			return NextResponse.json({ error: notesError.message }, { status: 500 });
		}

		return NextResponse.json({ return: { ...returnObj, notes: notes || [] } });
	},
	{ requireAuth: true },
);

// PATCH /api/returns/[id] — update return status, resolution details, or create exchange order
export const PATCH = withAuthAndRateLimit(
	async (req: NextRequest, { user, sellerId, supabase, body, params }) => {
		const { id } = params;
		const {
			status,
			resolution_type,
			refund_amount,
			exchange_order_id,
			return_tracking_id,
			return_delivery_company,
			notes,
		} = body!;

		// 1. Fetch return details and verify seller ownership
		const { data: returnObj, error: fetchError } = await supabase
			.from("returns")
			.select("*")
			.eq("id", id)
			.eq("seller_id", sellerId)
			.is("deleted_at", null)
			.single();

		if (fetchError || !returnObj) {
			return NextResponse.json(
				{ error: "Return request not found" },
				{ status: 404 },
			);
		}

		const rawUpdates: Record<string, unknown> = {
			status,
			updated_at: new Date().toISOString(),
		};

		if (resolution_type !== undefined)
			rawUpdates.resolution_type = resolution_type;
		if (refund_amount !== undefined) rawUpdates.refund_amount = refund_amount;
		if (exchange_order_id !== undefined)
			rawUpdates.exchange_order_id = exchange_order_id;
		if (return_tracking_id !== undefined)
			rawUpdates.return_tracking_id = return_tracking_id;
		if (return_delivery_company !== undefined)
			rawUpdates.return_delivery_company = return_delivery_company;

		if (status === "approved" && returnObj.status === "requested") {
			rawUpdates.approved_at = new Date().toISOString();
		} else if (status === "received" && returnObj.status !== "received") {
			rawUpdates.received_at = new Date().toISOString();
		} else if (
			["refunded", "exchanged", "closed", "rejected"].includes(status) &&
			!returnObj.resolved_at
		) {
			rawUpdates.resolved_at = new Date().toISOString();
		}

		// Special: Auto-create exchange order if status changes to exchanged and exchange_order_id not set
		if (
			status === "exchanged" &&
			!returnObj.exchange_order_id &&
			!exchange_order_id
		) {
			// Fetch original order details
			const { data: originalOrder, error: orderError } = await supabase
				.from("orders")
				.select("*")
				.eq("id", returnObj.order_id)
				.single();

			if (orderError || !originalOrder) {
				return NextResponse.json(
					{ error: "Original order not found for exchange" },
					{ status: 404 },
				);
			}

			// Map items
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
				resolution_type === "exchange" ? 0 : refund_amount || 0;

			// Create new order
			const { data: newOrder, error: insertOrderError } = await supabase
				.from("orders")
				.insert({
					seller_id: sellerId,
					customer_id: originalOrder.customer_id,
					items: exchangeItems,
					total_price: exchangeTotal,
					delivery_cost: 0,
					wilaya: originalOrder.wilaya,
					commune: originalOrder.commune,
					address: originalOrder.address,
					notes: `طلب استبدال للطلب رقم #${originalOrder.order_number} (RET: ${returnObj.return_number})`,
					status: "pending",
					confirmation_status: "confirmed",
				})
				.select()
				.single();

			if (insertOrderError) {
				return NextResponse.json(
					{
						error: `Failed to create exchange order: ${insertOrderError.message}`,
					},
					{ status: 500 },
				);
			}

			rawUpdates.exchange_order_id = newOrder.id;

			// Add timeline log for auto-created order
			await supabase.from("return_notes").insert({
				return_id: id,
				author_id: user?.id || null,
				type: "system",
				content: `تم إنشاء طلب استبدال جديد برقم #${newOrder.order_number} تلقائياً.`,
			});
		}

		// 2. Perform DB update
		const { data: updatedReturn, error: updateError } = await supabase
			.from("returns")
			.update(rawUpdates)
			.eq("id", id)
			.select()
			.single();

		if (updateError) {
			return NextResponse.json({ error: updateError.message }, { status: 500 });
		}

		// 3. Add custom note if provided
		if (notes) {
			await supabase.from("return_notes").insert({
				return_id: id,
				author_id: user?.id || null,
				type: "note",
				content: notes!,
			});
		}

		return NextResponse.json({ return: updatedReturn });
	},
	{
		schema: updateReturnStatusSchema,
		requireAuth: true,
	},
);

// DELETE /api/returns/[id] — delete return request (cascades return notes in DB)
export const DELETE = withAuthAndRateLimit(
	async (
		req: NextRequest,
		{ user: _userIgnored, sellerId, supabase, params },
	) => {
		const { id } = params;
		const { error } = await supabase
			.from("returns")
			.update({ deleted_at: new Date().toISOString() })
			.eq("id", id)
			.eq("seller_id", sellerId);

		if (error) {
			return NextResponse.json({ error: error.message }, { status: 500 });
		}

		return NextResponse.json({ success: true });
	},
	{ requireAuth: true },
);
