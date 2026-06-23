/**
 * Core AI chat tools — 6 tools that let the agent interact with the app.
 *
 * Each tool reads/writes via the extended Prisma client (PII-encryption-aware).
 * The agent can: search products, search customers, create orders, get stats,
 * update order status, and estimate delivery cost.
 */
import "server-only";


import { z } from "zod";
import type { ToolContext, ToolResult } from "./registry";
import { registerTool } from "./registry";
import { getDeliveryAdapter, loadDeliveryCredentials } from "@/lib/integrations/delivery";
import type { DbClient } from "@/lib/db";
import { orderService } from "@/lib/data/order-service";

function getDb(ctx: ToolContext): DbClient {
  return ctx.db as DbClient;
}

// ── Tool 1: search_products ─────────────────────────────────────────────────

const searchProductsSchema = z.object({
  query: z.string().optional().describe("Search term for product name or SKU"),
  category: z.string().optional().describe("Filter by category name"),
  limit: z.number().int().min(1).max(50).optional().default(10),
});

registerTool({
  definition: {
    name: "search_products",
    description: "Search products by name, SKU, or category. Returns matching products with stock + price.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search term for product name or SKU" },
        category: { type: "string", description: "Filter by category name" },
        limit: { type: "number", description: "Max results (default 10, max 50)" },
      },
    },
  },
  async execute(params, ctx): Promise<ToolResult> {
    try {
      const input = searchProductsSchema.parse(params);
      const db = getDb(ctx);
      const products = await db.product.findMany({
        where: {
          AND: [
            input.query
              ? { OR: [{ name: { contains: input.query } }, { sku: { contains: input.query } }] }
              : {},
            input.category ? { category: { name: { contains: input.category } } } : {},
            { isActive: true },
          ],
        },
        include: { category: true },
        take: input.limit,
        orderBy: { name: "asc" },
      });
      return {
        success: true,
        data: products.map((p) => ({
          id: p.id,
          name: p.name,
          sku: p.sku,
          price: p.price,
          stock: p.stock,
          category: p.category?.name,
        })),
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Erreur" };
    }
  },
});

// ── Tool 2: search_customers ────────────────────────────────────────────────

const searchCustomersSchema = z.object({
  query: z.string().describe("Search by customer name or phone"),
  limit: z.number().int().min(1).max(50).optional().default(10),
});

registerTool({
  definition: {
    name: "search_customers",
    description: "Search customers by name or phone. Returns matching customers with order count + total spent.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search by name or phone" },
        limit: { type: "number", description: "Max results (default 10)" },
      },
      required: ["query"],
    },
  },
  async execute(params, ctx): Promise<ToolResult> {
    try {
      const input = searchCustomersSchema.parse(params);
      const db = getDb(ctx);
      const customers = await db.customer.findMany({
        where: {
          OR: [
            { name: { contains: input.query } },
            { phone: { contains: input.query } },
          ],
        },
        take: input.limit,
        orderBy: { createdAt: "desc" },
      });
      return {
        success: true,
        data: customers.map((c) => ({
          id: c.id,
          name: c.name,
          phone: c.phone,
          wilaya: c.wilaya,
          orderCount: c.orderCount,
          totalSpent: c.totalSpent,
        })),
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Erreur" };
    }
  },
});

// ── Tool 3: create_order ────────────────────────────────────────────────────

const createOrderSchema = z.object({
  customerId: z.string().describe("Existing customer ID"),
  items: z.array(z.object({
    productId: z.string(),
    quantity: z.number().int().min(1),
  })).min(1),
  wilaya: z.string(),
  commune: z.string(),
  address: z.string(),
  phone: z.string(),
  notes: z.string().optional(),
});

registerTool({
  definition: {
    name: "create_order",
    description: "Create a new order for an existing customer. Items reference product IDs. Returns the created order.",
    parameters: {
      type: "object",
      properties: {
        customerId: { type: "string", description: "Existing customer ID" },
        items: {
          type: "array",
          description: "Order items",
          items: {
            type: "object",
            properties: {
              productId: { type: "string" },
              quantity: { type: "number" },
            },
          },
        },
        wilaya: { type: "string" },
        commune: { type: "string" },
        address: { type: "string" },
        phone: { type: "string" },
        notes: { type: "string" },
      },
      required: ["customerId", "items", "wilaya", "commune", "address", "phone"],
    },
  },
  async execute(params, ctx): Promise<ToolResult> {
    try {
      const input = createOrderSchema.parse(params);
      const db = getDb(ctx);

      // Fetch products to get current prices
      const products = await db.product.findMany({
        where: { id: { in: input.items.map((i) => i.productId) } },
      });
      const productMap = new Map(products.map((p) => [p.id, p]));

      const items = input.items.map((i) => {
        const product = productMap.get(i.productId);
        if (!product) throw new Error(`Produit introuvable: ${i.productId}`);
        return {
          productId: i.productId,
          productName: product.name,
          quantity: i.quantity,
          unitPrice: product.price,
          total: product.price * i.quantity,
        };
      });

      const total = items.reduce((sum, i) => sum + i.total, 0);

      // Generate order number
      const orderCount = await db.order.count();
      const orderNumber = `ORD-${String(orderCount + 1).padStart(4, "0")}`;

      const order = await db.order.create({
        data: {
          orderNumber,
          customerId: input.customerId,
          status: "draft",
          items: { create: items },
          totalPrice: total,
          wilaya: input.wilaya,
          commune: input.commune,
          address: input.address,
          phone: input.phone,
          source: "ai_chat",
          notes: input.notes,
        },
        include: { items: true },
      });

      return {
        success: true,
        data: {
          id: order.id,
          orderNumber: order.orderNumber,
          total: order.totalPrice,
          status: order.status,
        },
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Erreur" };
    }
  },
});

// ── Tool 4: get_stats ───────────────────────────────────────────────────────

registerTool({
  definition: {
    name: "get_stats",
    description: "Get dashboard statistics: total orders, revenue, customers, low stock count. No parameters.",
    parameters: { type: "object", properties: {} },
  },
  async execute(_params, ctx): Promise<ToolResult> {
    try {
      const db = getDb(ctx);
      // Revenue = sum of totalPrice for orders that are confirmed/shipped/delivered.
      // Excludes drafts, cancellations, and returns — those are not realized revenue.
      const [totalOrders, revenueAgg, totalCustomers, lowStockCount] = await Promise.all([
        db.order.count(),
        db.order.aggregate({
          _sum: { totalPrice: true },
          where: { status: { in: ["confirmed", "shipped", "delivered"] } },
        }),
        db.customer.count(),
        db.product.count({ where: { stock: { lte: db.product.fields.lowStockThreshold }, isActive: true } }),
      ]);
      const totalRevenue = revenueAgg._sum.totalPrice ?? 0;
      return {
        success: true,
        data: {
          totalOrders,
          totalRevenue,
          totalCustomers,
          lowStockCount,
        },
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Erreur" };
    }
  },
});

// ── Tool 5: update_order_status ─────────────────────────────────────────────

const updateOrderStatusSchema = z.object({
  orderId: z.string(),
  status: z.enum(["draft", "pending", "confirmed", "shipped", "delivered", "cancelled", "returned"]),
});

registerTool({
  definition: {
    name: "update_order_status",
    description:
      "Update the status of an order. Valid statuses: draft, pending, confirmed, shipped, delivered, cancelled, returned. " +
      "Transitions are validated by the order state machine — invalid transitions are rejected. " +
      "Side effects (stock deduction on confirm, stock restoration on cancel/return, customer stats update on deliver) are applied automatically.",
    parameters: {
      type: "object",
      properties: {
        orderId: { type: "string" },
        status: { type: "string", description: "draft|pending|confirmed|shipped|delivered|cancelled|returned" },
      },
      required: ["orderId", "status"],
    },
  },
  async execute(params, ctx): Promise<ToolResult> {
    try {
      const input = updateOrderStatusSchema.parse(params);
      const db = getDb(ctx);
      // Route through orderService.updateStatus — NOT a direct db.order.update.
      // The service enforces the order state machine (assertCanTransition),
      // applies stock side-effects (triggersStockDeduction /
      // triggersStockRestoration), updates customer stats
      // (triggersCustomerStatsUpdate), and sets timestamp fields
      // (confirmedAt / shippedAt / deliveredAt) — all in a transaction.
      // A direct db.order.update would bypass all of this (D-002).
      const order = await orderService.updateStatus(
        { prisma: db },
        input.orderId,
        input.status,
      );
      return {
        success: true,
        data: {
          id: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
        },
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Erreur" };
    }
  },
});

// ── Tool 6: estimate_delivery_cost ──────────────────────────────────────────

const estimateDeliverySchema = z.object({
  provider: z.enum(["yalidine", "maystro", "zrexpress"]).default("yalidine"),
  wilaya: z.string(),
  weight: z.number().positive().default(1),
  codAmount: z.number().min(0).default(0),
});

registerTool({
  definition: {
    name: "estimate_delivery_cost",
    description: "Estimate the delivery cost for a shipment to a wilaya. Default provider is Yalidine.",
    parameters: {
      type: "object",
      properties: {
        provider: { type: "string", description: "yalidine|maystro|zrexpress (default: yalidine)" },
        wilaya: { type: "string", description: "Wilaya name" },
        weight: { type: "number", description: "Weight in kg (default 1)" },
        codAmount: { type: "number", description: "COD amount in DA (default 0)" },
      },
      required: ["wilaya"],
    },
  },
  async execute(params, ctx): Promise<ToolResult> {
    try {
      const input = estimateDeliverySchema.parse(params);
      void ctx;
      const adapter = getDeliveryAdapter(input.provider);
      const creds = await loadDeliveryCredentials(input.provider);
      const estimate = await adapter.estimateCost(
        { wilaya: input.wilaya, weight: input.weight, codAmount: input.codAmount },
        creds,
      );
      return { success: estimate.available, data: estimate, error: estimate.error };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Erreur" };
    }
  },
});

// ── Export all tools (for the agent to import) ──────────────────────────────

export const coreTools = [
  "search_products",
  "search_customers",
  "create_order",
  "get_stats",
  "update_order_status",
  "estimate_delivery_cost",
] as const;
