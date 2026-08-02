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
import {
  getDeliveryAdapter,
  loadDeliveryCredentials,
} from "@/lib/integrations/delivery";
import type { DbClient } from "@/lib/db";
import { orderService } from "@/lib/data/order-service";
import { grossRevenue } from "@/lib/data/metrics";
import { getProfitabilityProjection } from "@/lib/accounting/profitability";
import { sourceBusinessPrincipal } from "@/lib/business-truth/principal";
import { createCanonicalSourceOrder } from "@/lib/orders/canonical-source-order";
import { currentAiSourceProposal } from "@/lib/ai/chat/source-proposal";

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
    description:
      "Search products by name, SKU, or category. Returns matching products with stock + price.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search term for product name or SKU",
        },
        category: { type: "string", description: "Filter by category name" },
        limit: {
          type: "number",
          description: "Max results (default 10, max 50)",
        },
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
              ? {
                  OR: [
                    { name: { contains: input.query } },
                    { sku: { contains: input.query } },
                  ],
                }
              : {},
            input.category
              ? { category: { name: { contains: input.category } } }
              : {},
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
      return {
        success: false,
        error: error instanceof Error ? error.message : "Erreur",
      };
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
    description:
      "Search customers by name or phone. " +
      "Phone search uses exact match (the phone is stored as a blind index, " +
      "so substring search is not supported). " +
      "Name search fetches all customers and filters in memory after decryption. " +
      "Returns matching customers with order count + total spent.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search by name (substring) or phone (exact match)",
        },
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
          data: [
            {
              id: byPhone.id,
              name: byPhone.name,
              phone: byPhone.phone,
              wilaya: byPhone.wilaya,
              orderCount: byPhone.orderCount,
              totalSpent: byPhone.totalSpent,
            },
          ],
        };
      }

      const all = await db.customer.findMany({
        where: { deletedAt: null },
        take: 500,
        orderBy: { createdAt: "desc" },
      });
      const lowerQuery = query.toLowerCase();
      const filtered = all
        .filter((customer) =>
          customer.name.toLowerCase().includes(lowerQuery),
        )
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
      return {
        success: false,
        error: error instanceof Error ? error.message : "Erreur",
      };
    }
  },
});

// ── Tool 3: create_order ────────────────────────────────────────────────────

export const createOrderSchema = z.object({
  customerId: z.string().describe("Existing customer ID"),
  items: z
    .array(
      z.object({
        productId: z.string(),
        productVariantId: z.string().optional(),
        quantity: z.number().int().min(1),
      }),
    )
    .min(1),
  wilaya: z.string(),
  commune: z.string(),
  address: z.string(),
  phone: z.string(),
  notes: z.string().optional(),
});

registerTool({
  definition: {
    name: "create_order",
    description:
      "Create a canonical AI draft for an existing customer. Items reference exact product IDs and, when required, exact variant IDs. The seller submits the draft before confirmation.",
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
              productVariantId: {
                type: "string",
                description: "Required when the product has active variants",
              },
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
      required: [
        "customerId",
        "items",
        "wilaya",
        "commune",
        "address",
        "phone",
      ],
    },
  },
  async execute(params, ctx): Promise<ToolResult> {
    try {
      const input = createOrderSchema.parse(params);
      const db = getDb(ctx);
      const persistedProposal = currentAiSourceProposal();
      const sourceIdentity =
        ctx.sourceIdentity ?? persistedProposal?.sourceIdentity;
      const sourceOrderId =
        ctx.sourceOrderId ?? persistedProposal?.sourceOrderId;
      if (!sourceIdentity || !sourceOrderId) {
        return {
          success: false,
          error:
            "La proposition IA n'a pas d'identité persistée; rechargez la conversation avant de réessayer.",
        };
      }

      const customer = await db.customer.findFirst({
        where: { id: input.customerId, deletedAt: null },
        select: { id: true },
      });
      if (!customer) {
        return {
          success: false,
          error: `Client introuvable ou supprimé: ${input.customerId}`,
        };
      }

      const command = await createCanonicalSourceOrder(
        {
          prisma: db,
          shop: ctx.shop,
          businessPrincipal: sourceBusinessPrincipal(
            "ai_chat",
            sourceIdentity,
          ),
        },
        {
          idempotencyKey: `ai-order:${sourceOrderId}`,
          correlationId: `ai:${sourceIdentity}:${sourceOrderId}`,
          source: "ai_chat",
          sourceIdentity,
          sourceOrderId,
          sourceRevision: sourceOrderId,
          sourceDetails: {
            proposalId: sourceOrderId,
            tool: "create_order",
          },
          initialStatus: "draft",
          customerId: input.customerId,
          items: input.items.map((item) => ({
            productId: item.productId,
            productVariantId: item.productVariantId ?? null,
            quantity: item.quantity,
          })),
          wilaya: input.wilaya,
          commune: input.commune,
          address: input.address,
          phone: input.phone,
          deliveryCost: 0,
          notes: input.notes,
        },
      );

      return {
        success: true,
        data: {
          id: command.result.order.id,
          orderNumber: command.result.order.orderNumber,
          total: command.result.order.totalPrice,
          status: command.result.order.status,
          replayed: command.replayed,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Erreur",
      };
    }
  },
});

// ── Tool 4: get_stats ───────────────────────────────────────────────────────

registerTool({
  definition: {
    name: "get_stats",
    description:
      "Get dashboard statistics with gross order value, realized delivery revenue, net revenue, net profit, customers, and low-stock count. No parameters.",
    parameters: { type: "object", properties: {} },
  },
  async execute(_params, ctx): Promise<ToolResult> {
    try {
      const db = getDb(ctx);
      const allTime = {
        from: new Date(0),
        to: new Date(Date.now() + 86_400_000),
      };
      const [totalOrders, grossOrderValue, profitability, totalCustomers, lowStockCount] =
        await Promise.all([
          db.order.count({ where: { deletedAt: null } }),
          grossRevenue(db, allTime),
          getProfitabilityProjection(db, allTime),
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
          grossRevenue: grossOrderValue,
          grossOrderValue,
          realizedRevenue: profitability.grossRevenue,
          netRevenue: profitability.netRevenue,
          netProfit: profitability.netProfit,
          profitabilityComplete: profitability.profitabilityComplete,
          totalCustomers,
          lowStockCount,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Erreur",
      };
    }
  },
});

// ── Tool 5: update_order_status ─────────────────────────────────────────────

const updateOrderStatusSchema = z.object({
  orderId: z.string(),
  status: z.enum([
    "draft",
    "pending",
    "confirmed",
    "shipped",
    "delivered",
    "cancelled",
    "returned",
  ]),
});

registerTool({
  definition: {
    name: "update_order_status",
    description:
      "Update the status of a legacy-compatible order. Canonical orders require their governed seller actions. Valid statuses: draft, pending, confirmed, shipped, delivered, cancelled, returned.",
    parameters: {
      type: "object",
      properties: {
        orderId: { type: "string" },
        status: {
          type: "string",
          description:
            "draft|pending|confirmed|shipped|delivered|cancelled|returned",
        },
      },
      required: ["orderId", "status"],
    },
  },
  async execute(params, ctx): Promise<ToolResult> {
    try {
      const input = updateOrderStatusSchema.parse(params);
      if (input.status === "confirmed") {
        return {
          success: false,
          error:
            "La confirmation exige la commande gouvernée; l’IA ne peut pas utiliser le chemin historique.",
        };
      }
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
      return {
        success: false,
        error: error instanceof Error ? error.message : "Erreur",
      };
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
    description:
      "Estimate the delivery cost for a shipment to a wilaya. Default provider is Yalidine.",
    parameters: {
      type: "object",
      properties: {
        provider: {
          type: "string",
          description: "yalidine|maystro|zrexpress (default: yalidine)",
        },
        wilaya: { type: "string", description: "Wilaya name" },
        weight: { type: "number", description: "Weight in kg (default 1)" },
        codAmount: {
          type: "number",
          description: "COD amount in DA (default 0)",
        },
      },
      required: ["wilaya"],
    },
  },
  async execute(params, ctx): Promise<ToolResult> {
    try {
      const input = estimateDeliverySchema.parse(params);
      const db = getDb(ctx);
      const adapter = getDeliveryAdapter(input.provider);
      const credentials = await loadDeliveryCredentials(
        { prisma: db, shop: ctx.shop },
        input.provider,
      );
      const estimate = await adapter.estimateCost(
        {
          wilaya: input.wilaya,
          weight: input.weight,
          codAmount: input.codAmount,
        },
        credentials,
      );
      return {
        success: estimate.available,
        data: estimate,
        error: estimate.error,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Erreur",
      };
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
