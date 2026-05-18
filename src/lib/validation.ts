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
