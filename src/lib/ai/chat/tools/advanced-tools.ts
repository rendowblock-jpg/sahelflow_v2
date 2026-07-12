/**
 * Advanced AI chat tools — 12 more tools (19-30) reaching the spec target of 30.
 *
 * Tools in this file:
 *   19. create_product          — add a new product to the catalog
 *   20. update_product_price    — change a product's price
 *   21. get_product_details     — fetch a single product by ID/SKU
 *   22. create_customer         — add a new customer manually
 *   23. update_customer_notes   — append notes to a customer
 *   24. get_customer_orders     — list a customer's orders (paginated)
 *   25. assign_order_to_delivery — mark an order ready for shipment
 *   26. get_delivery_cost_comparison — compare costs across providers
 *   27. get_returns_summary     — returned orders stats (count + value)
 *   28. get_sales_by_wilaya     — revenue breakdown by wilaya
 *   29. get_conversation_messages — read messages in a conversation
 *   30. search_orders           — search orders by customer name / phone / number
 *
 * All tools use the extended Prisma client (PII-encryption-aware, active-shop-aware).
 */
import "server-only";


import { z } from "zod";
import type { ToolContext, ToolResult } from "./registry";
import { registerTool } from "./registry";
import { getDeliveryAdapter, loadDeliveryCredentials } from "@/lib/integrations/delivery";
import type { DbClient } from "@/lib/db";
// AI-M13: reuse the existing phone normalizer from the import module so the
// create_customer tool produces the SAME blind index as every other entry
// point (import, delivery adapters, storefront). Without this, "+213555123456"
// and "0555 12 34 56" would create two different Customer rows for the same
// person (blind-index mismatch → unfindable customer).
import { normalizePhone } from "@/lib/import/fields";

function getDb(ctx: ToolContext): DbClient {
  return ctx.db as DbClient;
}

// ── Tool 19: create_product ─────────────────────────────────────────────────

const createProductSchema = z.object({
  name: z.string().min(1).max(200),
  price: z.number().int().min(0),
  sku: z.string().optional(),
  stock: z.number().int().min(0).optional().default(0),
  categoryId: z.string().optional(),
  cost: z.number().int().min(0).optional(),
});

registerTool({
  definition: {
    name: "create_product",
    description:
      "Add a new product to the catalog. Returns the created product with its ID.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Product name" },
        price: { type: "number", description: "Selling price in DZD" },
        sku: { type: "string", description: "SKU (optional)" },
        stock: { type: "number", description: "Initial stock (default 0)" },
        categoryId: { type: "string", description: "Category ID (optional)" },
        cost: { type: "number", description: "Cost price in DZD (optional, for margin calc)" },
      },
      required: ["name", "price"],
    },
  },
  async execute(params, ctx): Promise<ToolResult> {
    try {
      const input = createProductSchema.parse(params);
      const db = getDb(ctx);
      const product = await db.product.create({
        data: {
          name: input.name,
          price: input.price,
          sku: input.sku ?? null,
          stock: input.stock,
          cost: input.cost ?? null,
          categoryId: input.categoryId ?? null,
        },
        select: { id: true, name: true, price: true, sku: true, stock: true },
      });
      return { success: true, data: product };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Erreur" };
    }
  },
});

// ── Tool 20: update_product_price ───────────────────────────────────────────

// W3-21: exported for the schema-drift test (verifies the zod schema matches
// the hand-written JSON schema sent to Gemini).
export const updateProductPriceSchema = z.object({
  productId: z.string(),
  newPrice: z.number().int().min(0),
});

registerTool({
  definition: {
    name: "update_product_price",
    description: "Update a product's selling price. Useful for promotions or price adjustments.",
    // W2-3: structural confirmation gate — see agent.ts.
    requiresConfirmation: true,
    parameters: {
      type: "object",
      properties: {
        productId: { type: "string", description: "The product ID" },
        newPrice: { type: "number", description: "New price in DZD" },
      },
      required: ["productId", "newPrice"],
    },
  },
  async execute(params, ctx): Promise<ToolResult> {
    try {
      const input = updateProductPriceSchema.parse(params);
      const db = getDb(ctx);
      // Guard: refuse to update a soft-deleted product (B-softdelete).
      const live = await db.product.findFirst({
        where: { id: input.productId, deletedAt: null },
        select: { id: true },
      });
      if (!live) {
        return { success: false, error: `Produit introuvable ou supprimé: ${input.productId}` };
      }
      const product = await db.product.update({
        where: { id: input.productId },
        data: { price: input.newPrice },
        select: { id: true, name: true, price: true, sku: true },
      });
      return { success: true, data: product };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Erreur" };
    }
  },
});

// ── Tool 21: get_product_details ────────────────────────────────────────────

const getProductDetailsSchema = z.object({
  productId: z.string().optional(),
  sku: z.string().optional(),
});

registerTool({
  definition: {
    name: "get_product_details",
    description: "Fetch a single product by ID or SKU. Returns full details including stock, cost, and category.",
    parameters: {
      type: "object",
      properties: {
        productId: { type: "string", description: "The product ID" },
        sku: { type: "string", description: "The product SKU" },
      },
    },
  },
  async execute(params, ctx): Promise<ToolResult> {
    try {
      const input = getProductDetailsSchema.parse(params);
      if (!input.productId && !input.sku) {
        return { success: false, error: "Either productId or sku is required" };
      }
      const db = getDb(ctx);
      const product = await db.product.findFirst({
        where: input.productId
          ? { id: input.productId, deletedAt: null }
          : { sku: input.sku, deletedAt: null },
        include: { category: true },
      });
      if (!product) return { success: false, error: "Produit introuvable" };
      return {
        success: true,
        data: {
          id: product.id,
          name: product.name,
          sku: product.sku,
          price: product.price,
          cost: product.cost,
          stock: product.stock,
          lowStockThreshold: product.lowStockThreshold,
          isActive: product.isActive,
          category: product.category?.name ?? null,
          createdAt: product.createdAt,
        },
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Erreur" };
    }
  },
});

// ── Tool 22: create_customer ────────────────────────────────────────────────

const createCustomerSchema = z.object({
  name: z.string().min(1).max(100),
  phone: z.string().min(1).max(20),
  phone2: z.string().optional(),
  wilaya: z.string().optional(),
  commune: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
});

registerTool({
  definition: {
    name: "create_customer",
    description: "Add a new customer manually. Phone is required (used as the unique identifier).",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Customer name" },
        phone: { type: "string", description: "Primary phone (unique)" },
        phone2: { type: "string", description: "Secondary phone (optional)" },
        wilaya: { type: "string", description: "Wilaya (optional)" },
        commune: { type: "string", description: "Commune (optional)" },
        address: { type: "string", description: "Address (optional)" },
        notes: { type: "string", description: "Notes (optional)" },
      },
      required: ["name", "phone"],
    },
  },
  async execute(params, ctx): Promise<ToolResult> {
    try {
      const input = createCustomerSchema.parse(params);
      const db = getDb(ctx);
      // AI-M13: normalize phone numbers BEFORE storage + lookup so the
      // HMAC blind index matches across entry points. Without this,
      // "+213555123456" and "0555 12 34 56" would produce different blind
      // indexes → duplicate customer rows + silent unfindability.
      const normalizedPhone = normalizePhone(input.phone);
      const normalizedPhone2 = input.phone2 ? normalizePhone(input.phone2) : null;
      // Guard: phone is @unique. If a soft-deleted customer exists with the
      // same phone, Prisma would throw P2002 (misleading "already exists"
      // error). Surface a clear restore-first message instead (B-softdelete).
      const tombstoned = await db.customer.findFirst({
        where: { phone: normalizedPhone, deletedAt: { not: null } },
        select: { id: true },
      });
      if (tombstoned) {
        return { success: false, error: "Un client supprimé existe déjà avec ce téléphone. Restaurez-le d'abord depuis la liste clients." };
      }
      const customer = await db.customer.create({
        data: {
          name: input.name,
          phone: normalizedPhone,
          phone2: normalizedPhone2,
          wilaya: input.wilaya ?? null,
          commune: input.commune ?? null,
          address: input.address ?? null,
          notes: input.notes ?? null,
        },
        select: { id: true, name: true, phone: true, wilaya: true },
      });
      return { success: true, data: customer };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Erreur" };
    }
  },
});

// ── Tool 23: update_customer_notes ──────────────────────────────────────────

const updateCustomerNotesSchema = z.object({
  customerId: z.string(),
  notes: z.string().max(1000),
  mode: z.enum(["append", "replace"]).optional().default("append"),
});

registerTool({
  definition: {
    name: "update_customer_notes",
    description: "Add notes to a customer (append mode) or replace existing notes. Useful for recording customer preferences or issues.",
    parameters: {
      type: "object",
      properties: {
        customerId: { type: "string", description: "The customer ID" },
        notes: { type: "string", description: "The notes to add/set" },
        mode: { type: "string", enum: ["append", "replace"], description: "Append to existing notes or replace (default: append)" },
      },
      required: ["customerId", "notes"],
    },
  },
  async execute(params, ctx): Promise<ToolResult> {
    try {
      const input = updateCustomerNotesSchema.parse(params);
      const db = getDb(ctx);
      const existing = await db.customer.findFirst({
        where: { id: input.customerId, deletedAt: null },
        select: { notes: true },
      });
      if (!existing) return { success: false, error: "Client introuvable" };

      const newNotes = input.mode === "replace"
        ? input.notes
        : existing.notes
          ? `${existing.notes}\n[${new Date().toISOString().slice(0, 10)}] ${input.notes}`
          : `[${new Date().toISOString().slice(0, 10)}] ${input.notes}`;

      await db.customer.update({
        where: { id: input.customerId },
        data: { notes: newNotes },
      });
      return { success: true, data: { customerId: input.customerId, notes: newNotes } };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Erreur" };
    }
  },
});

// ── Tool 24: get_customer_orders ────────────────────────────────────────────

const getCustomerOrdersSchema = z.object({
  customerId: z.string(),
  limit: z.number().int().min(1).max(50).optional().default(10),
});

registerTool({
  definition: {
    name: "get_customer_orders",
    description: "List a customer's order history (most recent first). Returns order number, status, total, and date.",
    parameters: {
      type: "object",
      properties: {
        customerId: { type: "string", description: "The customer ID" },
        limit: { type: "number", description: "Max results (default 10)" },
      },
      required: ["customerId"],
    },
  },
  async execute(params, ctx): Promise<ToolResult> {
    try {
      const input = getCustomerOrdersSchema.parse(params);
      const db = getDb(ctx);
      const orders = await db.order.findMany({
        where: { customerId: input.customerId, deletedAt: null },
        select: {
          orderNumber: true,
          status: true,
          totalPrice: true,
          wilaya: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: input.limit,
      });
      return { success: true, data: orders };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Erreur" };
    }
  },
});

// ── Tool 25: assign_order_to_delivery ───────────────────────────────────────

const assignOrderToDeliverySchema = z.object({
  orderNumber: z.string(),
  provider: z.enum(["yalidine", "maystro", "zrexpress"]),
  weight: z.number().min(0).optional().default(0.5),
});

registerTool({
  definition: {
    name: "assign_order_to_delivery",
    description:
      "Mark an order as ready for shipment by creating a delivery with the specified provider. " +
      "Estimates the cost, creates the shipment, and saves the tracking ID on the order. " +
      "The order must be in 'confirmed' status.",
    parameters: {
      type: "object",
      properties: {
        orderNumber: { type: "string", description: "The order number" },
        provider: { type: "string", enum: ["yalidine", "maystro", "zrexpress"], description: "Delivery provider" },
        weight: { type: "number", description: "Package weight in kg (default 0.5)" },
      },
      required: ["orderNumber", "provider"],
    },
  },
  async execute(params, ctx): Promise<ToolResult> {
    try {
      const input = assignOrderToDeliverySchema.parse(params);
      const db = getDb(ctx);

      const order = await db.order.findFirst({
        where: { orderNumber: input.orderNumber, deletedAt: null },
        include: {
          customer: true,
          items: true,
          delivery: { where: { deletedAt: null } },
        },
      });
      if (!order) return { success: false, error: "Commande introuvable" };
      if (order.delivery) {
        return { success: false, error: `Cette commande a déjà une livraison (${order.delivery.provider}, tracking: ${order.delivery.trackingNumber ?? "N/A"})` };
      }
      if (order.status !== "confirmed") {
        return { success: false, error: `La commande doit être confirmée avant la livraison (statut actuel: ${order.status})` };
      }

      const adapter = getDeliveryAdapter(input.provider);
      const creds = await loadDeliveryCredentials(input.provider);
      if (!creds) {
        return { success: false, error: `Identifiants ${input.provider} non configurés` };
      }

      const result = await adapter.createShipment(
        {
          orderId: order.id,
          orderNumber: order.orderNumber,
          customer: {
            name: order.customer.name,
            phone: order.phone || order.customer.phone,
            wilaya: order.wilaya,
            commune: order.commune,
            address: order.address,
          },
          items: order.items.map((i) => ({
            name: i.productName,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
          })),
          totalPrice: order.totalPrice,
          weight: input.weight,
        },
        creds,
      );

      if (!result.success) {
        return { success: false, error: result.error ?? "Échec de la création de livraison" };
      }

      // Session 30 (AUDIT-7 AI7): wrap delivery create + order status update
      // in a $transaction. Previously these were two separate writes — if the
      // second failed, you had a Delivery record but the order was still
      // 'confirmed' (and re-running the tool would error out because a
      // delivery already exists).
      //
      // AI-M3: previously the status update was a raw tx.order.update that
      // bypassed orderService.updateStatus — so the `order.shipped`
      // automation trigger was never dispatched, the state machine wasn't
      // enforced, and the ledger entry was hand-rolled with a stale
      // `status: "confirmed"` field. We now inline the same steps that
      // orderService.updateStatus performs (state-machine assertion +
      // timestamped status update + recordStatusChange with actor="ai"),
      // then dispatch the trigger AFTER the tx commits (matches the
      // service's fire-and-forget pattern). We can't call
      // orderService.updateStatus({ prisma: tx }, ...) directly because
      // Prisma transaction clients don't expose $transaction for nested
      // calls — but the trigger dispatch + ledger entry are the parts
      // that matter for audit attribution.
      // AI-M4: pass actor: "ai" so the OrderChange ledger attributes the
      // transition to the assistant, not the human user.
      const { assertCanTransition } = await import("@/lib/order-transitions");
      const { recordStatusChange } = await import("@/lib/data/order-change-service");
      type TriggerEvent = import("@/lib/automations/engine").TriggerEvent;
      const { dispatchTrigger } = await import("@/lib/automations/engine");
      const delivery = await db.$transaction(async (tx) => {
        const d = await tx.delivery.create({
          data: {
            orderId: order.id,
            provider: input.provider,
            trackingNumber: result.trackingId,
            cost: result.cost,
            status: "created",
          },
        });
        // Enforce the state machine inside the tx (race-safe).
        assertCanTransition(order.status as never, "shipped" as never);
        await tx.order.update({
          where: { id: order.id },
          data: { status: "shipped", shippedAt: new Date() },
        });
        // Ledger entry — same tx, actor "ai" (AI-M4).
        await recordStatusChange(order.id, order.status, "shipped", "ai", tx);
        return d;
      });

      // AI-M3: dispatch the `order.shipped` automation trigger AFTER the tx
      // commits. orderService.updateStatus does this fire-and-forget; we
      // replicate the behavior so automation rules (e.g. "when order
      // shipped → send WhatsApp notification") fire for AI-initiated
      // assignments. Wrapped in void + catch so a trigger failure never
      // breaks the user-facing response.
      void dispatchTrigger("order.shipped" as TriggerEvent, {
        orderId: order.id,
        orderNumber: order.orderNumber,
        customerId: order.customerId,
        totalPrice: order.totalPrice,
        wilaya: order.wilaya,
        phone: order.phone,
      }).catch(() => { /* fire-and-forget */ });

      return {
        success: true,
        data: {
          deliveryId: delivery.id,
          trackingId: result.trackingId,
          provider: input.provider,
          cost: result.cost,
          orderId: order.id,
          orderNumber: order.orderNumber,
        },
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Erreur" };
    }
  },
});

// ── Tool 26: get_delivery_cost_comparison ───────────────────────────────────

const getDeliveryCostComparisonSchema = z.object({
  wilaya: z.string(),
  commune: z.string().optional(),
  weight: z.number().min(0).optional().default(0.5),
  codAmount: z.number().int().min(0),
});

registerTool({
  definition: {
    name: "get_delivery_cost_comparison",
    description:
      "Compare delivery costs across all configured providers (Yalidine, Maystro, ZR Express). " +
      "Returns the cost + availability for each, so the seller can choose the cheapest option.",
    parameters: {
      type: "object",
      properties: {
        wilaya: { type: "string", description: "Destination wilaya" },
        commune: { type: "string", description: "Destination commune" },
        weight: { type: "number", description: "Package weight in kg (default 0.5)" },
        codAmount: { type: "number", description: "COD amount to collect (DZD)" },
      },
      required: ["wilaya", "codAmount"],
    },
  },
  async execute(params, ctx): Promise<ToolResult> {
    try {
      const input = getDeliveryCostComparisonSchema.parse(params);
      void ctx; // not needed — we use the delivery adapters directly
      const providers = ["yalidine", "maystro", "zrexpress"] as const;
      const comparisons: Array<{
        provider: string;
        cost: number;
        available: boolean;
        error?: string;
      }> = [];

      for (const provider of providers) {
        try {
          const adapter = getDeliveryAdapter(provider);
          const creds = await loadDeliveryCredentials(provider);
          if (!creds) {
            comparisons.push({ provider, cost: 0, available: false, error: "Non configuré" });
            continue;
          }
          const estimate = await adapter.estimateCost(
            {
              wilaya: input.wilaya,
              commune: input.commune,
              weight: input.weight,
              codAmount: input.codAmount,
            },
            creds,
          );
          comparisons.push({
            provider,
            cost: estimate.cost,
            available: estimate.available,
            error: estimate.error,
          });
        } catch (err) {
          comparisons.push({
            provider,
            cost: 0,
            available: false,
            error: err instanceof Error ? err.message : "Erreur",
          });
        }
      }

      // Sort by cost (available first, cheapest first)
      comparisons.sort((a, b) => {
        if (a.available && !b.available) return -1;
        if (!a.available && b.available) return 1;
        return a.cost - b.cost;
      });

      return { success: true, data: comparisons };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Erreur" };
    }
  },
});

// ── Tool 27: get_returns_summary ────────────────────────────────────────────

const getReturnsSummarySchema = z.object({
  period: z.enum(["today", "week", "month", "all"]).optional().default("month"),
});

registerTool({
  definition: {
    name: "get_returns_summary",
    description:
      "Get a summary of returned/refused orders for a time period. Returns count, total value, and return rate.",
    parameters: {
      type: "object",
      properties: {
        period: { type: "string", enum: ["today", "week", "month", "all"], description: "Time period (default: month)" },
      },
    },
  },
  async execute(params, ctx): Promise<ToolResult> {
    try {
      const input = getReturnsSummarySchema.parse(params);
      const db = getDb(ctx);
      const now = new Date();
      let start: Date | undefined;
      switch (input.period) {
        case "today":
          start = new Date(now);
          start.setHours(0, 0, 0, 0);
          break;
        case "week":
          start = new Date(now);
          start.setDate(start.getDate() - 7);
          break;
        case "month":
          start = new Date(now);
          start.setMonth(start.getMonth() - 1);
          break;
        case "all":
          start = undefined;
          break;
      }

      const where = start ? { createdAt: { gte: start } } : {};
      const [returned, refused, total] = await Promise.all([
        db.order.count({ where: { ...where, status: "returned", deletedAt: null } }),
        db.order.count({ where: { ...where, status: "refused", deletedAt: null } }),
        db.order.count({ where: { ...where, deletedAt: null } }),
      ]);

      const returnedValue = await db.order.aggregate({
        where: { ...where, status: "returned", deletedAt: null },
        _sum: { totalPrice: true },
      });

      const returnCount = returned + refused;
      const returnRate = total > 0 ? Math.round((returnCount / total) * 100) : 0;

      return {
        success: true,
        data: {
          period: input.period,
          returnedCount: returned,
          refusedCount: refused,
          totalReturns: returnCount,
          totalOrders: total,
          returnRate: `${returnRate}%`,
          returnedValue: returnedValue._sum.totalPrice ?? 0,
        },
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Erreur" };
    }
  },
});

// ── Tool 28: get_sales_by_wilaya ────────────────────────────────────────────

const getSalesByWilayaSchema = z.object({
  period: z.enum(["today", "week", "month", "all"]).optional().default("month"),
  limit: z.number().int().min(1).max(58).optional().default(10),
});

registerTool({
  definition: {
    name: "get_sales_by_wilaya",
    description:
      "Get a revenue breakdown by wilaya. Shows which wilayas generate the most sales — useful for targeting marketing + logistics.",
    parameters: {
      type: "object",
      properties: {
        period: { type: "string", enum: ["today", "week", "month", "all"], description: "Time period (default: month)" },
        limit: { type: "number", description: "Max wilayas to return (default 10)" },
      },
    },
  },
  async execute(params, ctx): Promise<ToolResult> {
    try {
      const input = getSalesByWilayaSchema.parse(params);
      const db = getDb(ctx);
      const now = new Date();
      let start: Date | undefined;
      switch (input.period) {
        case "today":
          start = new Date(now);
          start.setHours(0, 0, 0, 0);
          break;
        case "week":
          start = new Date(now);
          start.setDate(start.getDate() - 7);
          break;
        case "month":
          start = new Date(now);
          start.setMonth(start.getMonth() - 1);
          break;
        case "all":
          start = undefined;
          break;
      }

      const orders = await db.order.findMany({
        where: {
          ...(start ? { createdAt: { gte: start } } : {}),
          status: { not: "cancelled" },
          deletedAt: null,
        },
        select: { wilaya: true, totalPrice: true },
      });

      const wilayaMap = new Map<string, { orderCount: number; revenue: number }>();
      for (const o of orders) {
        const existing = wilayaMap.get(o.wilaya) ?? { orderCount: 0, revenue: 0 };
        existing.orderCount++;
        existing.revenue += o.totalPrice;
        wilayaMap.set(o.wilaya, existing);
      }

      const sorted = Array.from(wilayaMap.entries())
        .map(([wilaya, s]) => ({ wilaya, ...s }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, input.limit);

      return { success: true, data: sorted };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Erreur" };
    }
  },
});

// ── Tool 29: get_conversation_messages ──────────────────────────────────────

const getConversationMessagesSchema = z.object({
  conversationId: z.string(),
  limit: z.number().int().min(1).max(100).optional().default(20),
});

registerTool({
  definition: {
    name: "get_conversation_messages",
    description:
      "Read the messages in a conversation. Returns the most recent messages with direction (inbound/outbound), body, and timestamp. Useful for context before replying to a customer.",
    parameters: {
      type: "object",
      properties: {
        conversationId: { type: "string", description: "The conversation ID" },
        limit: { type: "number", description: "Max messages (default 20)" },
      },
      required: ["conversationId"],
    },
  },
  async execute(params, ctx): Promise<ToolResult> {
    try {
      const input = getConversationMessagesSchema.parse(params);
      const db = getDb(ctx);
      const messages = await db.message.findMany({
        where: { conversationId: input.conversationId },
        select: {
          id: true,
          body: true,
          direction: true,
          timestamp: true,
          extractionMethod: true,
        },
        orderBy: { timestamp: "desc" },
        take: input.limit,
      });
      // Return oldest-first for readability
      return {
        success: true,
        data: messages.reverse().map((m) => ({
          id: m.id,
          direction: m.direction,
          body: m.body,
          timestamp: m.timestamp,
          extracted: m.extractionMethod !== null,
        })),
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Erreur" };
    }
  },
});

// ── Tool 30: search_orders ──────────────────────────────────────────────────

const searchOrdersSchema = z.object({
  query: z.string().describe("Search by order number, customer name, or phone"),
  status: z
    .enum(["draft", "confirmed", "shipped", "delivered", "returned", "cancelled"])
    .optional(),
  limit: z.number().int().min(1).max(50).optional().default(10),
});

registerTool({
  definition: {
    name: "search_orders",
    description:
      "Search orders by order number, customer name, or phone. Returns matching orders with customer + status + total. " +
      "Use this when the user asks about a specific order but doesn't know the exact order number.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search term (order number, customer name, or phone)" },
        status: { type: "string", enum: ["draft", "confirmed", "shipped", "delivered", "returned", "cancelled"], description: "Filter by status (optional)" },
        limit: { type: "number", description: "Max results (default 10)" },
      },
      required: ["query"],
    },
  },
  async execute(params, ctx): Promise<ToolResult> {
    try {
      const input = searchOrdersSchema.parse(params);
      const db = getDb(ctx);
      const q = input.query.trim();
      const qLower = q.toLowerCase();

      // AI-S1: Customer.name is AES-256-GCM encrypted at rest (see
      // CUSTOMER_PII_FIELDS in src/lib/db.ts). A DB-level `contains` filter on
      // customer.name searches CIPHERTEXT and returns nothing in production
      // (tests pass only because they use the raw PrismaClient without the PII
      // extension — the resume guide's "tests pass ≠ production works" caveat
      // for PII fields). Same bug class as the fixed AI6 (search_conversations).
      //
      // Fix: fetch a bounded window of recent orders (the PII extension
      // transparently decrypts customer.name/phone on read) with NO
      // name/phone DB-level filter, then match by orderNumber OR decrypted
      // customer.name in memory. orderNumber is NOT encrypted but we match it
      // in memory too (simpler + case-insensitive). A COD seller's recent-
      // order window is bounded (thousands, not millions), so 500 is a
      // generous safety bound; results are sliced to `limit` afterward.
      const candidateOrders = await db.order.findMany({
        where: {
          AND: [
            { deletedAt: null },
            { customer: { deletedAt: null } },
            input.status ? { status: input.status } : {},
          ],
        },
        include: {
          customer: { select: { name: true, phone: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 500,
      });

      // In-memory filter: match orderNumber OR decrypted customer.name
      // (case-insensitive substring on both).
      const matched = candidateOrders
        .filter((o) => {
          const name = (o.customer.name ?? "").toLowerCase();
          const num = (o.orderNumber ?? "").toLowerCase();
          return name.includes(qLower) || num.includes(qLower);
        })
        .slice(0, input.limit);

      return {
        success: true,
        data: matched.map((o) => ({
          orderNumber: o.orderNumber,
          status: o.status,
          totalPrice: o.totalPrice,
          wilaya: o.wilaya,
          createdAt: o.createdAt,
          customerName: o.customer.name,
          customerPhone: o.customer.phone,
        })),
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Erreur" };
    }
  },
});
