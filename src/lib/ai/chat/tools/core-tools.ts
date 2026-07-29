/**
 * Core AI chat tools. Confirmation is deliberately absent from AI authority:
 * pending→confirmed requires the trusted manual command with seller approval,
 * expected version and idempotency.
 */
import "server-only";

import { z } from "zod";
import type { ToolContext, ToolResult } from "./registry";
import { registerTool } from "./registry";
import { getDeliveryAdapter, loadDeliveryCredentials } from "@/lib/integrations/delivery";
import type { DbClient } from "@/lib/db";
import { orderService } from "@/lib/data/order-service";
import { grossRevenue } from "@/lib/data/metrics";

function getDb(ctx: ToolContext): DbClient {
  return ctx.db as DbClient;
}

const searchProductsSchema = z.object({
  query: z.string().optional().describe("Search term for product name or SKU"),
  category: z.string().optional().describe("Filter by category name"),
  limit: z.number().int().min(1).max(50).optional().default(10),
});

registerTool({
  definition: {
    name: "search_products",
    description: "Search products by name, SKU, or category. Returns matching products with stock and price.",
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
            { deletedAt: null },
          ],
        },
        include: { category: true },
        take: input.limit,
        orderBy: { name: "asc" },
      });
      return {
        success: true,
        data: products.map((product) => ({
          id: product.id,
          name: product.name,
          sku: product.sku,
          price: product.price,
          stock: product.stock,
          category: product.category?.name,
        })),
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Erreur" };
    }
  },
});

const searchCustomersSchema = z.object({
  query: z.string().describe("Search by customer name or phone"),
  limit: z.number().int().min(1).max(50).optional().default(10),
});

registerTool({
  definition: {
    name: "search_customers",
    description:
      "Search customers by decrypted name substring or exact phone. Returns matching customers with order count and total spent.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Name substring or exact phone" },
        limit: { type: "number", description: "Max results (default 10)" },
      },
      required: ["query"],
    },
  },
  async execute(params, ctx): Promise<ToolResult> {
    try {
      const input = searchCustomersSchema.parse(params);
      const db = getDb(ctx);
      const query = input.query.trim();
      const byPhone = await db.customer.findFirst({
        where: { phone: query, deletedAt: null },
      });
      if (byPhone) {
        return {
          success: true,
          data: [{
            id: byPhone.id,
            name: byPhone.name,
            phone: byPhone.phone,
            wilaya: byPhone.wilaya,
            orderCount: byPhone.orderCount,
            totalSpent: byPhone.totalSpent,
          }],
        };
      }

      const all = await db.customer.findMany({
        where: { deletedAt: null },
        take: 500,
        orderBy: { createdAt: "desc" },
      });
      const lowerQuery = query.toLowerCase();
      const filtered = all
        .filter((customer) => customer.name.toLowerCase().includes(lowerQuery))
        .slice(0, input.limit);
      return {
        success: true,
        data: filtered.map((customer) => ({
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          wilaya: customer.wilaya,
          orderCount: customer.orderCount,
          totalSpent: customer.totalSpent,
        })),
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Erreur" };
    }
  },
});

export const createOrderSchema = z.object({
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
    description: "Create a draft AI-sourced order for an existing customer. Seller confirmation remains manual and governed.",
    requiresConfirmation: true,
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
      const customer = await db.customer.findFirst({
        where: { id: input.customerId, deletedAt: null },
        select: { id: true },
      });
      if (!customer) {
        return { success: false, error: `Client introuvable ou supprimé: ${input.customerId}` };
      }

      const products = await db.product.findMany({
        where: { id: { in: input.items.map((item) => item.productId) }, deletedAt: null },
      });
      const productMap = new Map(products.map((product) => [product.id, product]));
      const items = input.items.map((item) => {
        const product = productMap.get(item.productId);
        if (!product) throw new Error(`Produit introuvable: ${item.productId}`);
        return {
          productId: item.productId,
          productName: product.name,
          quantity: item.quantity,
          unitPrice: product.price,
        };
      });

      const order = await orderService.create(
        { prisma: db, shop: ctx.shop },
        {
          customerId: input.customerId,
          items,
          wilaya: input.wilaya,
          commune: input.commune,
          address: input.address,
          phone: input.phone,
          source: "ai_chat",
          notes: input.notes,
        },
      );
      return {
        success: true,
        data: {
          id: order.id,
          orderNumber: order.orderNumber,
          total: order.totalPrice,
          status: order.status,
        },
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Erreur" };
    }
  },
});

registerTool({
  definition: {
    name: "get_stats",
    description: "Get total orders, all-time gross revenue, customers and low-stock count.",
    parameters: { type: "object", properties: {} },
  },
  async execute(_params, ctx): Promise<ToolResult> {
    try {
      const db = getDb(ctx);
      const allTime = {
        from: new Date(0),
        to: new Date(Date.now() + 86_400_000),
      };
      const [totalOrders, grossRevenueAllTime, totalCustomers, lowStockCount] = await Promise.all([
        db.order.count({ where: { deletedAt: null } }),
        grossRevenue(db, allTime),
        db.customer.count({ where: { deletedAt: null } }),
        db.product.count({
          where: {
            stock: { lte: db.product.fields.lowStockThreshold },
            isActive: true,
            deletedAt: null,
          },
        }),
      ]);
      return {
        success: true,
        data: {
          totalOrders,
          grossRevenue: grossRevenueAllTime,
          totalCustomers,
          lowStockCount,
        },
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Erreur" };
    }
  },
});

const updateOrderStatusSchema = z.object({
  orderId: z.string(),
  status: z.enum(["draft", "pending", "shipped", "delivered", "cancelled", "returned"]),
});

registerTool({
  definition: {
    name: "update_order_status",
    description:
      "Update a compatibility order status except confirmation. Confirmation requires manual trusted approval and is not available to AI.",
    parameters: {
      type: "object",
      properties: {
        orderId: { type: "string" },
        status: { type: "string", description: "draft|pending|shipped|delivered|cancelled|returned" },
      },
      required: ["orderId", "status"],
    },
  },
  async execute(params, ctx): Promise<ToolResult> {
    try {
      const input = updateOrderStatusSchema.parse(params);
      const db = getDb(ctx);
      const order = await orderService.updateStatus(
        { prisma: db, shop: ctx.shop },
        input.orderId,
        input.status,
        { actor: "ai" },
      );
      return {
        success: true,
        data: {
          id: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
        },
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Erreur" };
    }
  },
});

const estimateDeliverySchema = z.object({
  provider: z.enum(["yalidine", "maystro", "zrexpress"]).default("yalidine"),
  wilaya: z.string(),
  weight: z.number().positive().default(1),
  codAmount: z.number().min(0).default(0),
});

registerTool({
  definition: {
    name: "estimate_delivery_cost",
    description: "Estimate delivery cost to a wilaya. Default provider is Yalidine.",
    parameters: {
      type: "object",
      properties: {
        provider: { type: "string", description: "yalidine|maystro|zrexpress" },
        wilaya: { type: "string", description: "Wilaya name" },
        weight: { type: "number", description: "Weight in kg" },
        codAmount: { type: "number", description: "COD amount in DA" },
      },
      required: ["wilaya"],
    },
  },
  async execute(params, ctx): Promise<ToolResult> {
    try {
      const input = estimateDeliverySchema.parse(params);
      const db = getDb(ctx);
      const adapter = getDeliveryAdapter(input.provider);
      const creds = await loadDeliveryCredentials({ prisma: db, shop: ctx.shop }, input.provider);
      const estimate = await adapter.estimateCost(
        { wilaya: input.wilaya, weight: input.weight, codAmount: input.codAmount },
        creds,
      );
      return { success: estimate.available, data: estimate, error: estimate.error };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Erreur" };
    }
  },
});

export const coreTools = [
  "search_products",
  "search_customers",
  "create_order",
  "get_stats",
  "update_order_status",
  "estimate_delivery_cost",
] as const;
