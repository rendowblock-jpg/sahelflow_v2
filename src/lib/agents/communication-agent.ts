/**
 * SahelFlow Communication Agent
 * Parses WhatsApp messages to extract order data and suggests smart replies.
 *
 * Features:
 *   - Extract structured order info from unstructured text
 *   - Generate contextual reply suggestions (draft-only, never auto-sends)
 *   - Classify message intent (order, inquiry, complaint, tracking)
 */

import { callLLMJson } from "./groq";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { matchProductToCatalog } from "@/lib/ai/extraction";
import { getAlgerianLanguagePrompt } from "@/lib/ai/prompts/algerian";
import { calculateDeliveryCost } from "@/lib/data/shipping-calculator";

function getServiceSupabase() {
	const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
	if (!url || !key) {
		throw new Error(
			"[CommAgent] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
		);
	}
	return createServiceClient(url, key);
}

// ======= Types =======

export interface ExtractedOrder {
	customer_name: string | null;
	phone: string | null;
	wilaya: string | null;
	commune: string | null;
	address: string | null;
	products: {
		name: string;
		quantity: number;
		variant?: string;
	}[];
	confidence: number; // 0-100, how confident is the extraction
	notes: string | null;
}

export interface MessageClassification {
	intent: "order" | "inquiry" | "complaint" | "tracking" | "greeting" | "other";
	sentiment: "positive" | "neutral" | "negative";
	urgency: "low" | "medium" | "high";
	summary: string;
}

export interface SuggestedReply {
	text: string;
	tone: "formal" | "friendly" | "urgent";
	language: "ar" | "fr" | "en" | "darija";
}

// ======= Order Extraction =======

/**
 * Extract order details from a WhatsApp conversation
 */
export async function extractOrderFromConversation(
	messages: { from: string; body: string; timestamp: string }[],
	sellerProducts?: { id: string; name: string; price: number; sku?: string }[],
): Promise<ExtractedOrder> {
	try {
		const { extractOrderWithCatalog } = await import("@/lib/ai/extraction");
		const mappedMessages = messages.map((m) => `[${m.from}]: ${m.body}`);
		const catalog = sellerProducts
			? sellerProducts.map((p) => ({
					id: p.id,
					name: p.name || "",
					price: p.price || 0,
					variants: [],
				}))
			: [];

		const extraction = await extractOrderWithCatalog(mappedMessages, catalog);

		return {
			customer_name: extraction.customer_name || null,
			phone: extraction.phone || null,
			wilaya: extraction.wilaya || null,
			commune: extraction.commune || null,
			address: extraction.address || null,
			products: extraction.products.map((p) => ({
				name: p.name || p.product_name || "",
				quantity: p.quantity,
				variant: p.variant || undefined,
			})),
			confidence: Math.round(extraction.confidence * 100),
			notes: null,
		};
	} catch (err) {
		console.error("[CommAgent] Order extraction failed:", err);
		return {
			customer_name: null,
			phone: null,
			wilaya: null,
			commune: null,
			address: null,
			products: [],
			confidence: 0,
			notes: "Extraction failed — could not parse conversation",
		};
	}
}

// ======= Message Classification =======

/**
 * Classify the intent and sentiment of a customer message
 */
export async function classifyMessage(
	message: string,
): Promise<MessageClassification> {
	const prompt = `Classify this customer message from an Algerian e-commerce WhatsApp conversation.
Message may be in Arabic, Darija, French, or English. The message may contain Franco-Arab numerals (3=ع, 7=ح). Consider this when classifying.

MESSAGE: "${message}"

Return ONLY valid JSON:
{
  "intent": "order" | "inquiry" | "complaint" | "tracking" | "greeting" | "other",
  "sentiment": "positive" | "neutral" | "negative",
  "urgency": "low" | "medium" | "high",
  "summary": "one-line summary in English"
}`;

	try {
		return await callLLMJson<MessageClassification>(
			[{ role: "user", content: prompt }],
			{ temperature: 0.1 },
		);
	} catch {
		return {
			intent: "other",
			sentiment: "neutral",
			urgency: "low",
			summary: "Could not classify message",
		};
	}
}

// ======= Reply Suggestions =======

/**
 * Generate 3 contextual reply suggestions (DRAFT ONLY — never auto-sends)
 */
export async function suggestReplies(
	conversationMessages: { from: string; body: string }[],
	orderContext?: string | null,
	languagePreference: string = "auto",
): Promise<SuggestedReply[]> {
	const conversationText = conversationMessages
		.slice(-8)
		.map((m) => `[${m.from}]: ${m.body}`)
		.join("\n");

	const langInstruction =
		languagePreference === "auto"
			? "Reply in professional Arabic (فصحى) or French based on the detected language. NEVER reply in Darija, dialect, or Franco-Arab — always use formal language."
			: `Reply in ${languagePreference}. Use formal, professional tone — never use dialect.`;

	const prompt = `You are a helpful Algerian e-commerce seller's assistant. Generate 3 reply suggestions for the last customer message.

CONVERSATION:
${conversationText}

${orderContext ? `ORDER CONTEXT:\n${orderContext}\n` : ""}

${getAlgerianLanguagePrompt()}

RULES:
- ${langInstruction}
- Keep replies SHORT (1-2 sentences max)
- Be professional but warm
- Include one formal, one friendly, and one action-oriented reply
- For COD orders, always mention delivery
- Never promise exact delivery times (say "2-5 jours" or "dans les plus brefs délais")

Return ONLY a JSON array:
[
  {"text": "reply text", "tone": "formal", "language": "detected language code"},
  {"text": "reply text", "tone": "friendly", "language": "detected language code"},
  {"text": "reply text", "tone": "urgent", "language": "detected language code"}
]`;

	try {
		const replies = await callLLMJson<SuggestedReply[]>(
			[{ role: "user", content: prompt }],
			{ temperature: 0.6 },
		);
		return Array.isArray(replies) ? replies.slice(0, 3) : [];
	} catch {
		return [
			{
				text: "Merci pour votre message ! Je vérifie et je reviens vers vous.",
				tone: "formal",
				language: "fr",
			},
			{
				text: "Salam! Oui c'est disponible 😊",
				tone: "friendly",
				language: "darija",
			},
			{
				text: "Commande notée ✅ Envoyez-moi votre adresse complète svp.",
				tone: "urgent",
				language: "fr",
			},
		];
	}
}

// ======= Integration with Inbox =======

/**
 * Process incoming message for a conversation
 * Called by the orchestrator when a new message arrives
 */
export async function processIncomingMessage(
	conversationId: string,
	sellerId: string,
): Promise<{
	classification: MessageClassification;
	extractedOrder?: ExtractedOrder;
	suggestedReplies: SuggestedReply[];
	draftOrderNumber?: string;
}> {
	const supabase = getServiceSupabase();

	// 1. Fetch conversation messages
	const { data: messages } = await supabase
		.from("messages")
		.select("direction, content, created_at")
		.eq("conversation_id", conversationId)
		.order("created_at", { ascending: true })
		.limit(20);

	if (!messages || messages.length === 0) {
		return {
			classification: {
				intent: "other",
				sentiment: "neutral",
				urgency: "low",
				summary: "No messages",
			},
			suggestedReplies: [],
		};
	}

	const formattedMessages = messages.map((m) => ({
		from: m.direction === "inbound" ? "Customer" : "Seller",
		body: m.content || "",
		timestamp: m.created_at,
	}));

	const lastMessage = formattedMessages[formattedMessages.length - 1];

	// 2. Classify the latest customer message
	const classification = await classifyMessage(lastMessage.body);

	// 3. If it looks like an order, extract details
	let extractedOrder: ExtractedOrder | undefined;
	let sellerProducts: Array<{
		id: string;
		name: string;
		price: number;
		sku?: string | null;
	}> | null = null;
	if (classification.intent === "order") {
		// Fetch seller's products for matching
		const { data: products } = await supabase
			.from("products")
			.select("id, name, price, sku")
			.eq("seller_id", sellerId)
			.eq("active", true);
		sellerProducts = products;

		extractedOrder = await extractOrderFromConversation(
			formattedMessages,
			products || undefined,
		);
	}

	let draftOrderNumber: string | undefined;
	if (extractedOrder && extractedOrder.confidence >= 50) {
		try {
			if (!sellerProducts) {
				const { data: products } = await supabase
					.from("products")
					.select("id, name, price, sku")
					.eq("seller_id", sellerId)
					.eq("active", true);
				sellerProducts = products;
			}
			const catalog = sellerProducts;

			const matchedItems: Array<{
				product_id: string | null;
				product_name: string;
				quantity: number;
				unit_price: number;
				variant?: string | null;
			}> = [];
			let totalPrice = 0;

			for (const product of extractedOrder.products) {
				const match = catalog
					? matchProductToCatalog(product.name, catalog)
					: null;
				const price = match?.price || 0;
				matchedItems.push({
					product_id: match?.id || null,
					product_name: match?.name || product.name,
					quantity: product.quantity,
					unit_price: price,
					variant: product.variant || null,
				});
				totalPrice += product.quantity * price;
			}

			if (matchedItems.length > 0) {
				const deliveryCost = await calculateDeliveryCost(
					supabase,
					sellerId,
					extractedOrder.wilaya,
					"home",
				);

				const { data: rpcResult, error: rpcError } = await supabase.rpc(
					"atomic_create_order",
					{
						p_seller_id: sellerId,
						p_customer_name: extractedOrder.customer_name || "Unknown",
						p_customer_phone: extractedOrder.phone || null,
						p_customer_wilaya: extractedOrder.wilaya || null,
						p_customer_commune: extractedOrder.commune || null,
						p_customer_address: extractedOrder.address || null,
						p_items: matchedItems,
						p_total_price: totalPrice,
						p_delivery_cost: deliveryCost,
						p_net_profit: 0,
						p_wilaya: extractedOrder.wilaya || null,
						p_commune: extractedOrder.commune || null,
						p_address: extractedOrder.address || null,
						p_source: "whatsapp",
						p_external_id: null,
						p_notes: "Auto-extracted from WhatsApp conversation",
						p_delivery_type: "home",
						p_status: "draft",
					},
				);

				if (rpcError) {
					console.error("[CommAgent] atomic_create_order RPC error:", rpcError);
				} else if (rpcResult) {
					const result = rpcResult as Record<string, unknown>;
					draftOrderNumber = result.order_number as string;
				}
			}
		} catch (draftErr) {
			console.error("[CommAgent] Draft order creation failed:", draftErr);
		}
	}

	// 4. Generate reply suggestions
	const orderCtx = extractedOrder
		? `Extracted order: ${extractedOrder.products.map((p) => `${p.quantity}x ${p.name}`).join(", ")} → ${extractedOrder.wilaya || "unknown wilaya"}`
		: undefined;

	const suggestedReplies = await suggestReplies(formattedMessages, orderCtx);

	return { classification, extractedOrder, suggestedReplies, draftOrderNumber };
}
