import { timingSafeEqual as nodeTimingSafeEqual } from "crypto";
import { z } from "zod";

// === Webhook Schemas ===

export const evolutionWebhookSchema = z
	.object({
		event: z.string().min(1),
		instance: z.string().min(1),
		data: z.unknown().optional(),
	})
	.passthrough();

export const internalWebhookSchema = z
	.object({
		type: z.enum(["order.created", "message.received"]),
		orderId: z.string().uuid().optional(),
		sellerId: z.string().uuid(),
		conversationId: z.string().uuid().optional(),
	})
	.refine(
		(data) =>
			(data.type === "order.created" && data.orderId) ||
			(data.type === "message.received" && data.conversationId),
		{
			message:
				"orderId required for order.created, conversationId required for message.received",
		},
	);

// === Inbox Schemas ===

export const sendMessageSchema = z.object({
	conversationId: z.string().uuid(),
	text: z.string().min(1).max(4000),
	replyToId: z.string().uuid().optional(),
	quotedText: z.string().max(200).optional(),
});

export const aiSuggestSchema = z.object({
	conversationId: z.string().uuid(),
	lastMessage: z.string().min(1).max(2000).optional(),
});

// === AI Schemas ===

export const aiRequestSchema = z.object({
	action: z.enum([
		"extract_order",
		"ask_assistant",
		"suggest_replies",
		"agent_execute",
	]),
	message: z.string().max(4000).optional(),
	question: z.string().max(4000).optional(),
	businessContext: z.string().max(8000).optional(),
	conversationHistory: z
		.array(
			z.object({
				role: z.enum(["user", "assistant"]),
				content: z.string(),
			}),
		)
		.max(50)
		.optional(),
	orderContext: z.unknown().optional(),
	languageInstruction: z.string().max(500).optional(),
	locale: z.enum(["ar", "fr", "en"]).optional(),
});

// === Agent Schemas ===

export const processOrderSchema = z.object({
	orderId: z.string().uuid(),
});

export const agentConfigSchema = z.object({
	agent_config: z.record(z.string(), z.unknown()),
});

// === Integration Schemas ===

export const integrationSyncSchema = z.object({
	integration_id: z.string().uuid(),
});

// === Store API Schemas ===

export const placeOrderSchema = z.object({
	form: z.object({
		name: z.string().min(1, "Name is required"),
		phone: z
			.string()
			.regex(
				/^(0)?(5|6|7)\d{8}$/,
				"Must be a valid Algerian mobile number (05/06/07XXXXXXXX)",
			),
		wilaya: z.string().min(1, "Wilaya is required"),
		commune: z.string().min(1, "Commune is required"),
		address: z.string().min(1, "Address is required"),
		notes: z.string().optional(),
	}),
	items: z
		.array(
			z.object({
				name: z.string(),
				quantity: z.number().int().min(1),
				price: z.number().min(0),
				product_id: z.string().uuid(),
				variant: z.string().optional(),
			}),
		)
		.min(1, "Cart is empty"),
	total: z.number().min(0),
	deliveryCost: z.number().min(0),
	deliveryType: z.enum(["home", "desk"]).optional(),
});

// === Returns Schemas ===

export const createReturnSchema = z.object({
	orderId: z.string().uuid(),
	type: z.enum(["return", "exchange", "refund"]),
	reason: z.enum([
		"wrong_product",
		"damaged",
		"changed_mind",
		"not_as_described",
		"wrong_size",
		"defective",
		"late_delivery",
		"other",
	]),
	reason_details: z.string().optional(),
	resolution_type: z.enum(["refund", "exchange", "credit", "reject"]),
	refund_amount: z.number().min(0).optional(),
	items: z
		.array(
			z.object({
				product_id: z.string().uuid(),
				product_name: z.string(),
				quantity: z.number().int().positive(),
				price: z.number().min(0),
				cost_price: z.number().min(0).optional(),
				variant_id: z.string().uuid().optional(),
			}),
		)
		.min(1, "At least one item must be returned"),
	photos: z.array(z.string()).optional(),
	return_tracking_id: z.string().optional(),
	return_delivery_company: z.string().optional(),
});

export const updateReturnStatusSchema = z.object({
	status: z.enum([
		"requested",
		"approved",
		"pickup",
		"received",
		"inspected",
		"refunded",
		"exchanged",
		"rejected",
		"closed",
	]),
	resolution_type: z.enum(["refund", "exchange", "credit", "reject"]).optional(),
	refund_amount: z.number().min(0).optional(),
	exchange_order_id: z.string().uuid().optional(),
	return_tracking_id: z.string().optional(),
	return_delivery_company: z.string().optional(),
	notes: z.string().optional(),
});

export const addReturnNoteSchema = z.object({
	content: z.string().min(1, "Note content cannot be empty"),
	type: z.enum(["note", "status_change", "system", "customer"]).optional(),
});

export const createExpenseSchema = z.object({
	category: z.enum([
		"ads",
		"packaging",
		"delivery_fees",
		"returns",
		"supplies",
		"salary",
		"rent",
		"other",
	]),
	amount: z.number().positive("Amount must be greater than 0"),
	description: z.string().nullable().optional(),
	receipt_url: z.string().nullable().optional(),
	expense_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format, must be YYYY-MM-DD").optional(),
});

export const updateExpenseSchema = z.object({
	category: z.enum([
		"ads",
		"packaging",
		"delivery_fees",
		"returns",
		"supplies",
		"salary",
		"rent",
		"other",
	]).optional(),
	amount: z.number().positive("Amount must be greater than 0").optional(),
	description: z.string().nullable().optional(),
	receipt_url: z.string().nullable().optional(),
	expense_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format, must be YYYY-MM-DD").optional(),
});

// === Timing-safe comparison utility ===
// Uses Node's native crypto.timingSafeEqual for constant-time comparison.
// Length check is performed first; for fixed-length webhook secrets this
// does not leak sensitive information.

export function timingSafeEqual(a: string, b: string): boolean {
	const bufA = Buffer.from(a, "utf8");
	const bufB = Buffer.from(b, "utf8");
	if (bufA.length !== bufB.length) {
		return false;
	}
	return nodeTimingSafeEqual(bufA, bufB);
}

// === Order Status and Confirmation Schemas ===

export const updateOrderStatusSchema = z.object({
	status: z.enum([
		"draft",
		"pending",
		"confirmed",
		"shipped",
		"delivered",
		"returned",
		"refused",
		"cancelled",
	]),
});

export const updateOrderConfirmationSchema = z.object({
	confirmation_status: z.enum([
		"rappel",
		"en_attente",
		"doublon",
		"faux_numero",
		"boite_vocale",
		"confirmed",
		"annule",
	]).optional(),
	confirmation_attempts: z.number().int().nonnegative().optional(),
	confirmation_notes: z.string().nullable().optional(),
	upsell_offered: z.boolean().optional(),
});

