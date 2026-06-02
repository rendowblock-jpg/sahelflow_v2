/**
 * SahelFlow Agent Orchestrator
 * Central routing layer that listens to events and dispatches to specialized agents.
 *
 * Events:
 *   - order.created     → Order Agent (risk assessment)
 *   - message.received  → Communication Agent (classify, extract, suggest)
 */

import { processOrder } from "./order-agent";
import { processIncomingMessage } from "./communication-agent";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { AgentConfig, DEFAULT_AGENT_CONFIG } from "./types";
export type { AgentConfig } from "./types";
export { DEFAULT_AGENT_CONFIG } from "./types";

function getServiceSupabase() {
	const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
	if (!url || !key)
		throw new Error("Missing Supabase service role configuration");
	return createServiceClient(url, key);
}

// ======= Types =======

export type AgentEvent =
	| { type: "order.created"; orderId: string; sellerId: string }
	| { type: "message.received"; conversationId: string; sellerId: string };

// ======= Config Loader =======

/**
 * Load seller's agent config from their settings JSON
 */
async function loadSellerAgentConfig(sellerId: string): Promise<AgentConfig> {
	const supabase = getServiceSupabase();

	const { data } = await supabase
		.from("sellers")
		.select("settings")
		.eq("id", sellerId)
		.single();

	const settings = data?.settings as Record<string, unknown> | null;
	const agentConfig = settings?.agent_config as
		| Partial<AgentConfig>
		| undefined;

	return {
		order: { ...DEFAULT_AGENT_CONFIG.order, ...agentConfig?.order },
		comm: { ...DEFAULT_AGENT_CONFIG.comm, ...agentConfig?.comm },
	};
}

// ======= Event Dispatcher =======

/**
 * Process an agent event — main entry point
 */
export async function dispatch(event: AgentEvent): Promise<{
	success: boolean;
	agent: string;
	result: unknown;
}> {
	try {
		const config = await loadSellerAgentConfig(event.sellerId);

		switch (event.type) {
			case "order.created": {
				if (!config.order.enabled) {
					return {
						success: true,
						agent: "order",
						result: { skipped: true, reason: "Agent disabled" },
					};
				}

				console.log(
					`[Orchestrator] Dispatching order.created → OrderAgent (order=${event.orderId})`,
				);
				const result = await processOrder(event.orderId, config.order);

				return { success: true, agent: "order", result };
			}

			case "message.received": {
				if (!config.comm.enabled) {
					return {
						success: true,
						agent: "comm",
						result: { skipped: true, reason: "Agent disabled" },
					};
				}

				console.log(
					`[Orchestrator] Dispatching message.received → CommAgent (conv=${event.conversationId})`,
				);
				const result = await processIncomingMessage(
					event.conversationId,
					event.sellerId,
				);

				// Store AI suggestions on the conversation for the inbox UI to pick up
				// Merge with existing metadata to avoid overwriting other fields
				const supabase = getServiceSupabase();
				const { data: existingConv } = await supabase
					.from("conversations")
					.select("metadata")
					.eq("id", event.conversationId)
					.single();

				const existingMetadata =
					(existingConv?.metadata as Record<string, unknown>) || {};
				await supabase
					.from("conversations")
					.update({
						metadata: {
							...existingMetadata,
							ai_classification: result.classification,
							ai_extracted_order: result.extractedOrder || null,
							ai_suggested_replies: result.suggestedReplies,
							ai_processed_at: new Date().toISOString(),
						},
					})
					.eq("id", event.conversationId);

				return { success: true, agent: "comm", result };
			}

			default:
				return {
					success: false,
					agent: "unknown",
					result: { error: "Unknown event type" },
				};
		}
	} catch (err) {
		console.log(
			JSON.stringify({
				type: "orchestrator",
				action: "dispatch_error",
				agent: event.type.split(".")[0],
				error: err instanceof Error ? err.message : "Unknown error",
			}),
		);
		return {
			success: false,
			agent: event.type.split(".")[0],
			result: { error: err instanceof Error ? err.message : "Unknown error" },
		};
	}
}
