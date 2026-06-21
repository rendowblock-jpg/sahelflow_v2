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

import { z } from "zod";
import type { ToolContext, ToolResult } from "./registry";
import { registerTool } from "./registry";
import { getDeliveryAdapter, loadDeliveryCredentials } from "@/lib/integrations/delivery";
import type { DbClient } from "@/lib/db";

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

const updateProductPriceSchema = z.object({
  productId: z.string(),
  newPrice: z.number().int().min(0),
});

registerTool({
  definition: {
    name: "update_product_price",
    description: "Update a product's selling price. Useful for promotions or price adjustments.",
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
        where: input.productId ? { id: input.productId } : { sku: input.sku },
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
      const customer = await db.customer.create({
        data: {
          name: input.name,
          phone: input.phone,
          phone2: input.phone2 ?? null,
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
      const existing = await db.customer.findUnique({
        where: { id: input.customerId },
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
        where: { customerId: input.customerId },
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

      const order = await db.order.findUnique({
        where: { orderNumber: input.orderNumber },
        include: {
          customer: true,
          items: true,
          delivery: true,
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

      // Create the Delivery record + update order status to 'shipped'
      const delivery = await db.delivery.create({
        data: {
          orderId: order.id,
          provider: input.provider,
          trackingNumber: result.trackingId,
          cost: result.cost,
          status: "created",
        },
      });

      await db.order.update({
        where: { id: order.id },
        data: { status: "shipped", shippedAt: new Date() },
      });

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
        db.order.count({ where: { ...where, status: "returned" } }),
        db.order.count({ where: { ...where, status: "cancelled" } }),
        db.order.count({ where }),
      ]);

      const returnedValue = await db.order.aggregate({
        where: { ...where, status: "returned" },
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

      // Search by order number first (exact-ish), then by customer name/phone
      const orders = await db.order.findMany({
        where: {
          AND: [
            input.status ? { status: input.status } : {},
            {
              OR: [
                { orderNumber: { contains: q } },
                { phone: { contains: q } },
                { customer: { name: { contains: q } } },
                { customer: { phone: { contains: q } } },
              ],
            },
          ],
        },
        include: {
          customer: { select: { name: true, phone: true } },
        },
        orderBy: { createdAt: "desc" },
        take: input.limit,
      });

      return {
        success: true,
        data: orders.map((o) => ({
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
