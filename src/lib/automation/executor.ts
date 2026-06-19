/**
 * SahelFlow Automation Executor
 *
 * Recipe-based automation engine.
 * Fires matching automation rules when events occur (order status changes, risk thresholds, etc.).
 * Updates run_count and last_run_at on matched automations.
 */

import { createClient as createServiceClient } from "@supabase/supabase-js";
import { RECIPES, type Recipe } from "./recipes";
import { createShipmentForOrder } from "@/lib/delivery/shipment-service";
import { sendText } from "@/lib/channels/evolution-api";
import {
	interpolateTemplate,
	buildTemplateVars,
} from "@/lib/channels/template-interpolation";

function getServiceSupabase() {
	const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
	if (!url || !key) {
		throw new Error(
			"[Executor] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
		);
	}
	return createServiceClient(url, key);
}

export interface AutomationEvent {
	type: string;
	sellerId: string;
	data: Record<string, unknown>;
}

/**
 * Check which recipes match this event and execute their actions
 */
export async function executeRecipes(event: AutomationEvent): Promise<{
	executed: string[];
	skipped: string[];
}> {
	const supabaseSvc = getServiceSupabase();

	// Get the seller's active automations
	const { data: automations } = await supabaseSvc
		.from("automations")
		.select(
			"id, name, trigger_type, trigger_config, action_type, action_config, active, run_count",
		)
		.eq("seller_id", event.sellerId)
		.eq("active", true);

	if (!automations || automations.length === 0) {
		return { executed: [], skipped: [] };
	}

	// Log structured warnings for any misconfigured automations
	for (const a of automations) {
		if (!a.trigger_config) {
			console.warn(
				JSON.stringify({
					type: "automation_config_warning",
					message: `Automation "${a.name}" (ID: ${a.id}) has null trigger_config`,
					sellerId: event.sellerId,
					automationId: a.id,
				}),
			);
		} else if (!(a.trigger_config as Record<string, unknown>).recipe_id) {
			console.warn(
				JSON.stringify({
					type: "automation_config_warning",
					message: `Automation "${a.name}" (ID: ${a.id}) is missing recipe_id in trigger_config`,
					sellerId: event.sellerId,
					automationId: a.id,
				}),
			);
		}
	}

	const executed: string[] = [];
	const skipped: string[] = [];

	for (const recipe of RECIPES) {
		// Find this recipe in the seller's automations table
		const row = automations.find(
			(a) =>
				a.trigger_type === recipe.trigger.type &&
				(a.trigger_config as Record<string, unknown> | null)?.recipe_id ===
					recipe.id,
		);

		// Skip if not seeded or not active
		if (!row || !row.active) {
			skipped.push(recipe.id);
			continue;
		}

		// Check if trigger type matches the event
		if (recipe.trigger.type !== event.type) {
			skipped.push(recipe.id);
			continue;
		}

		// Evaluate trigger conditions
		if (!evaluateConditions(recipe, event)) {
			skipped.push(recipe.id);
			continue;
		}

		// Execute the action
		try {
			await executeRecipeAction(recipe, event);

			// W2 fix: atomic increment via RPC (prevents race condition where
			// concurrent events read the same run_count and lose increments).
			// Falls back to read-then-write if RPC not available.
			const { error: incrErr } = await supabaseSvc.rpc(
				"increment_automation_run_count",
				{ p_automation_id: row.id },
			);
			if (incrErr) {
				// Fallback: best-effort non-atomic update (pre-PR #9 behavior)
				await supabaseSvc
					.from("automations")
					.update({
						run_count: (row.run_count || 0) + 1,
						last_run_at: new Date().toISOString(),
					})
					.eq("id", row.id);
			}

			executed.push(recipe.id);
		} catch (e) {
			console.error(
				`[RecipeExecutor] Failed to execute recipe ${recipe.id}:`,
				e,
			);
			skipped.push(recipe.id);
		}
	}

	return { executed, skipped };
}

function evaluateConditions(recipe: Recipe, event: AutomationEvent): boolean {
	const config = recipe.trigger.config;
	const data = event.data;

	switch (recipe.trigger.type) {
		case "order.created": {
			const maxRisk = Number(config.max_risk ?? 100);
			const riskScore = Number(data.risk_score ?? 0);
			return riskScore <= maxRisk;
		}
		case "risk.threshold": {
			const threshold = Number(config.threshold ?? 70);
			const riskScore = Number(data.risk_score ?? 0);
			return riskScore >= threshold;
		}
		case "stock.low": {
			const threshold = Number(config.threshold ?? 5);
			const stock = Number(data.stock ?? 0);
			return stock <= threshold;
		}
		case "return.threshold": {
			const maxReturns = Number(config.max_returns ?? 3);
			const returnedOrders = Number(data.returned_orders ?? 0);
			return returnedOrders >= maxReturns;
		}
		case "message.first":
		case "order.delivered":
		case "order.confirmed": {
			return true;
		}
		default:
			// W1 fix: fail-closed for unknown trigger types.
			// Previously returned true (fail-open), meaning any new/unknown
			// trigger type would ALWAYS match — executing actions on events
			// that shouldn't trigger them.
			return false;
	}
}

async function executeRecipeAction(
	recipe: Recipe,
	event: AutomationEvent,
): Promise<void> {
	const supabaseSvc = getServiceSupabase();
	const config = recipe.action.config;
	const data = event.data;

	switch (recipe.action.type) {
		case "update_status": {
			const newStatus = String(config.new_status || "confirmed");
			if (data.order_id) {
				// Use atomic production RPC for status updates to ensure stock/stats integrity
				const { error: rpcError } = await supabaseSvc.rpc(
					"atomic_update_order_status",
					{
						p_order_id: data.order_id as string,
						p_new_status: newStatus,
					},
				);

				if (rpcError) {
					console.error(
						`[RecipeExecutor] Failed atomic update for order ${data.order_id}:`,
						rpcError,
					);
				} else {
					console.log(
						`[RecipeExecutor] Atomically updated order ${data.order_id} to ${newStatus}`,
					);
				}
			}
			break;
		}
		case "flag_review": {
			if (data.order_id) {
				const { data: existing } = await supabaseSvc
					.from("orders")
					.select("notes")
					.eq("id", data.order_id)
					.eq("seller_id", event.sellerId)
					.single();
				const existingNotes = (existing?.notes as string) || "";
				await supabaseSvc
					.from("orders")
					.update({
						notes:
							`⚠️ Flagged by automation — high risk\n${existingNotes}`.trim(),
					})
					.eq("id", data.order_id)
					.eq("seller_id", event.sellerId);
			}
			break;
		}
		case "block_customer": {
			if (data.customer_id) {
				await supabaseSvc
					.from("customers")
					.update({ is_blocked: true })
					.eq("id", data.customer_id)
					.eq("seller_id", event.sellerId);
			}
			break;
		}
		case "notify": {
			// Log to agent_activity so the seller sees the notification in their feed
			await supabaseSvc.from("agent_activity").insert({
				seller_id: event.sellerId,
				type: "automation_notify",
				title: "Automation Alert",
				description: String(
					config.message || "Automation triggered a notification.",
				),
				metadata: { channel: config.channel, recipe: recipe.id },
			});
			break;
		}
		case "send_template": {
			const templateSlug = String(config.template || "welcome");

			const { data: template } = await supabaseSvc
				.from("whatsapp_templates")
				.select("content, active")
				.eq("seller_id", event.sellerId)
				.eq("slug", templateSlug)
				.eq("active", true)
				.single();

			if (!template) {
				await supabaseSvc.from("agent_activity").insert({
					seller_id: event.sellerId,
					type: "warning",
					title: `Template "${templateSlug}" not found or inactive`,
					description: `The automation tried to send template "${templateSlug}" but it doesn't exist or is disabled. Create it in Settings > Templates.`,
					metadata: { recipe: recipe.id, template: templateSlug },
				});
				break;
			}

			const { data: channel } = await supabaseSvc
				.from("channels")
				.select("name, active")
				.eq("seller_id", event.sellerId)
				.eq("type", "whatsapp")
				.eq("active", true)
				.limit(1)
				.maybeSingle();

			if (!channel) {
				await supabaseSvc.from("agent_activity").insert({
					seller_id: event.sellerId,
					type: "warning",
					title: `WhatsApp not connected — template not sent`,
					description: `Template "${templateSlug}" was triggered but WhatsApp is not connected. Connect in Settings > Channels.`,
					metadata: { recipe: recipe.id, template: templateSlug },
				});
				break;
			}

			let phone: string | undefined;
			let templateVars: ReturnType<typeof buildTemplateVars> =
				buildTemplateVars({});

			if (data.order_id) {
				const { data: order } = await supabaseSvc
					.from("orders")
					.select(
						"id, order_number, total_price, wilaya, items, customer:customers(name, phone)",
					)
					.eq("id", data.order_id as string)
					.single();

				if (order) {
					const customer = (order as Record<string, unknown>)
						.customer as Record<string, string> | null;
					phone = customer?.phone || undefined;
					const { data: seller } = await supabaseSvc
						.from("sellers")
						.select("business_name")
						.eq("id", event.sellerId)
						.single();
					templateVars = buildTemplateVars({
						customer_name: customer?.name,
						order_number: (order as Record<string, unknown>)
							.order_number as string,
						wilaya:
							((order as Record<string, unknown>).wilaya as string) ||
							undefined,
						items:
							((order as Record<string, unknown>).items as Array<{
								product_name: string;
								quantity: number;
							}>) || undefined,
						total_price:
							Number((order as Record<string, unknown>).total_price) ||
							undefined,
						business_name: seller?.business_name || undefined,
					});
				}
			} else if (data.customer_phone) {
				phone = String(data.customer_phone);
				templateVars = buildTemplateVars({
					customer_name: String(data.customer_name || ""),
					business_name: String(data.business_name || ""),
				});
			}

			if (!phone) {
				await supabaseSvc.from("agent_activity").insert({
					seller_id: event.sellerId,
					type: "warning",
					title: `No phone number — template not sent`,
					description: `Template "${templateSlug}" was triggered but no customer phone number was found.`,
					metadata: { recipe: recipe.id, template: templateSlug },
				});
				break;
			}

			try {
				const message = interpolateTemplate(template.content, templateVars);
				await sendText(channel.name, phone, message);

				await supabaseSvc.from("agent_activity").insert({
					seller_id: event.sellerId,
					type: "automation",
					title: `Template "${templateSlug}" sent successfully`,
					description: `WhatsApp message sent to ${phone.slice(-4).padStart(phone.length, "*")}`,
					metadata: {
						recipe: recipe.id,
						template: templateSlug,
						phone: phone.slice(-4),
					},
				});
			} catch (sendErr) {
				console.error(
					`[RecipeExecutor] Failed to send template "${templateSlug}":`,
					sendErr,
				);
				await supabaseSvc.from("agent_activity").insert({
					seller_id: event.sellerId,
					type: "alert",
					title: `Failed to send template "${templateSlug}"`,
					description: `Error: ${(sendErr as Error).message}. Check WhatsApp connection in Settings.`,
					metadata: { recipe: recipe.id, template: templateSlug },
				});
			}
			break;
		}
      case "create_shipment": {
        if (data.order_id) {
          const { data: order } = await supabaseSvc
            .from("orders")
            .select(
              "id, order_number, status, items, total_price, wilaya, commune, address, customer:customers(name, phone, wilaya, commune, address)",
            )
            .eq("id", data.order_id as string)
            .single();

          if (!order) break;

          const customer = (order as Record<string, unknown>)
            .customer as Record<string, string> | null;
          const shipmentItems = ((order as Record<string, unknown>).items as Array<
            Record<string, unknown>
          >) || [];

          try {
            const result = await createShipmentForOrder({
              supabase: supabaseSvc,
              sellerId: event.sellerId,
              orderId: (order as Record<string, unknown>).id as string,
              orderNumber: (order as Record<string, unknown>).order_number as string,
              totalPrice: Number((order as Record<string, unknown>).total_price),
              customer: {
                name: customer?.name || "Unknown",
                phone: customer?.phone || "",
                wilaya: customer?.wilaya || ((order as Record<string, unknown>).wilaya as string) || "",
                commune: customer?.commune || ((order as Record<string, unknown>).commune as string) || "",
                address: customer?.address || ((order as Record<string, unknown>).address as string) || "",
              },
              items: shipmentItems.map((i) => ({
                product_name: String(i.product_name || i.name || "Item"),
                quantity: Number(i.quantity || 1),
                unit_price: Number(i.unit_price || i.price || 0),
                weight: Number(i.weight || 0),
              })),
            });

            if (result.success) {
              await supabaseSvc
                .from("orders")
                .update({ tracking_id: result.trackingId, delivery_company: "yalidine" })
                .eq("id", data.order_id);
              console.log("[RecipeExecutor] Shipment created for order " + data.order_id + ": " + result.trackingId);
            } else {
              await supabaseSvc.from("agent_activity").insert({
                seller_id: event.sellerId,
                type: "alert",
                title: "Shipment creation failed for order " + (order as Record<string, unknown>).order_number,
                description: "Error: " + result.error + ". Create shipment manually from the Delivery page.",
                metadata: { recipe: recipe.id, order_id: data.order_id, error: result.error },
              });
            }
          } catch (shipmentErr) {
            console.error("[RecipeExecutor] Shipment creation error for order " + data.order_id + ":", shipmentErr);
            await supabaseSvc.from("agent_activity").insert({
              seller_id: event.sellerId,
              type: "alert",
              title: "Shipment creation error",
              description: "Failed to create shipment for order. Try manually from Delivery page.",
              metadata: { recipe: recipe.id, order_id: data.order_id },
            });
          }
        }
        break;
      }
		default:
			console.log(
				`[RecipeExecutor] Unknown action type: ${recipe.action.type}`,
			);
	}
}

/**
 * Seed the automations table with all RECIPES for a seller if they don't already exist
 */
export async function ensureRecipesExist(sellerId: string): Promise<void> {
	const supabaseSvc = getServiceSupabase();

	// Check which recipes already exist for this seller
	const { data: existing } = await supabaseSvc
		.from("automations")
		.select("trigger_config")
		.eq("seller_id", sellerId);

	const existingRecipeIds = new Set(
		(existing || [])
			.map(
				(r) => (r.trigger_config as Record<string, unknown> | null)?.recipe_id,
			)
			.filter(Boolean),
	);

	// Insert missing recipes (no upsert needed — we already filter out existing)
	const toInsert = RECIPES.filter((r) => !existingRecipeIds.has(r.id)).map(
		(recipe) => ({
			seller_id: sellerId,
			name: recipe.id,
			trigger_type: recipe.trigger.type,
			trigger_config: { ...recipe.trigger.config, recipe_id: recipe.id },
			action_type: recipe.action.type,
			action_config: recipe.action.config,
			active: recipe.default_active,
			run_count: 0,
		}),
	);

	if (toInsert.length > 0) {
		// W3 fix: handle TOCTOU race. The unique index idx_automations_recipe_unique
		// on (seller_id, trigger_type, trigger_config->>recipe_id) prevents duplicates,
		// but concurrent onboarding calls may both try to insert the same recipe.
		// Catch 23505 (unique_violation) and ignore — the recipe already exists.
		const { error: insertErr } = await supabaseSvc
			.from("automations")
			.insert(toInsert);
		if (insertErr && insertErr.code !== "23505") {
			throw new Error(
				`Failed to seed automation recipes: ${insertErr.message}`,
			);
		}
	}
}
