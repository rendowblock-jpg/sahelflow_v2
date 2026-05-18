/**
 * SahelFlow Automation Executor
 *
 * Recipe-based automation engine.
 * Fires matching automation rules when events occur (order status changes, risk thresholds, etc.).
 * Updates run_count and last_run_at on matched automations.
 */

import { createClient as createServiceClient } from "@supabase/supabase-js";
import { RECIPES, type Recipe } from "./recipes";
import { getDeliveryAdapter } from "@/lib/delivery/adapters";
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

      // Update run_count and last_run_at
      await supabaseSvc
        .from("automations")
        .update({
          run_count: (row.run_count || 0) + 1,
          last_run_at: new Date().toISOString(),
        })
        .eq("id", row.id);

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
      return true;
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
          .single();
        const existingNotes = (existing?.notes as string) || "";
        await supabaseSvc
          .from("orders")
          .update({
            notes:
              `⚠️ Flagged by automation — high risk\n${existingNotes}`.trim(),
          })
          .eq("id", data.order_id);
      }
      break;
    }
    case "block_customer": {
      if (data.customer_id) {
        await supabaseSvc
          .from("customers")
          .update({ is_blocked: true })
          .eq("id", data.customer_id);
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
        try {
          const { data: order } = await supabaseSvc
            .from("orders")
            .select(
              "id, order_number, status, items, total_price, wilaya, commune, address, customer:customers(name, phone, wilaya, commune, address)",
            )
            .eq("id", data.order_id as string)
            .single();

          if (!order) break;

          const { data: integration } = await supabaseSvc
            .from("integrations")
            .select("credentials")
            .eq("seller_id", event.sellerId)
            .eq("platform", "yalidine")
            .eq("is_active", true)
            .single();

          if (!integration) {
            await supabaseSvc.from("agent_activity").insert({
              seller_id: event.sellerId,
              type: "alert",
              title: `Shipment creation skipped — Yalidine not configured`,
              description: `Order ${(order as Record<string, unknown>).order_number} was confirmed but no Yalidine integration found. Create shipment manually.`,
              metadata: { recipe: recipe.id, order_id: data.order_id },
            });
            break;
          }

          const adapter = getDeliveryAdapter("yalidine");
          if (!adapter) break;

          const customer = (order as Record<string, unknown>)
            .customer as Record<string, string> | null;
          const shipmentItems =
            ((order as Record<string, unknown>).items as Array<
              Record<string, unknown>
            >) || [];

          const result = await adapter.createShipment(
            {
              orderId: (order as Record<string, unknown>).id as string,
              orderNumber: (order as Record<string, unknown>)
                .order_number as string,
              customer: {
                name: customer?.name || "Unknown",
                phone: customer?.phone || "",
                wilaya:
                  customer?.wilaya ||
                  ((order as Record<string, unknown>).wilaya as string) ||
                  "",
                commune:
                  customer?.commune ||
                  ((order as Record<string, unknown>).commune as string) ||
                  "",
                address:
                  customer?.address ||
                  ((order as Record<string, unknown>).address as string) ||
                  "",
              },
              items: shipmentItems.map((i) => ({
                name: String(i.product_name || i.name || "Item"),
                quantity: Number(i.quantity || 1),
                unitPrice: Number(i.unit_price || i.price || 0),
              })),
              totalPrice: Number(
                (order as Record<string, unknown>).total_price,
              ),
              weight: 0.5,
              notes: "",
            },
            integration.credentials as Record<string, unknown>,
          );

          if (result.success) {
            await supabaseSvc.from("deliveries").insert({
              order_id: data.order_id as string,
              seller_id: event.sellerId,
              provider: "yalidine",
              tracking_number: result.trackingId,
              status: "created",
              raw_response: result as unknown as Record<string, unknown>,
            });

            await supabaseSvc
              .from("orders")
              .update({
                tracking_id: result.trackingId,
                delivery_company: "yalidine",
              })
              .eq("id", data.order_id);

            console.log(
              `[RecipeExecutor] Shipment created for order ${data.order_id}: ${result.trackingId}`,
            );
          } else {
            await supabaseSvc.from("agent_activity").insert({
              seller_id: event.sellerId,
              type: "alert",
              title: `Shipment creation failed for order ${(order as Record<string, unknown>).order_number}`,
              description: `Error: ${result.error}. Create shipment manually from the Delivery page.`,
              metadata: {
                recipe: recipe.id,
                order_id: data.order_id,
                error: result.error,
              },
            });
          }
        } catch (shipmentErr) {
          console.error(
            `[RecipeExecutor] Shipment creation error for order ${data.order_id}:`,
            shipmentErr,
          );
          await supabaseSvc.from("agent_activity").insert({
            seller_id: event.sellerId,
            type: "alert",
            title: `Shipment creation error`,
            description: `Failed to create shipment for order. Try manually from Delivery page.`,
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
    await supabaseSvc.from("automations").insert(toInsert);
  }
}
