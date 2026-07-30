/**
 * Extended AI chat tools — 12 additional tools that expand the agent's
 * operational surface. Combined with the 6 core tools, the agent now has
 * 18 tools (spec target: 30).
 *
 * Tools in this file:
 *   7.  get_order_details      — fetch a single order by orderNumber/id
 *   8.  list_recent_orders     — list N most recent orders (with status filter)
 *   9.  get_customer_details   — fetch a customer + their order history
 *   10. get_low_stock_products — products at or below threshold
 *   11. get_revenue_report     — revenue over a date range
 *   12. get_delivery_status    — check delivery tracking for an order
 *   13. search_conversations   — find WhatsApp conversations by contact name
 *   14. get_pending_deliveries — list deliveries pending/in-transit
 *   15. get_top_products       — best-selling products by quantity/revenue
 *   16. update_product_stock   — adjust stock (manual corrections)
 *   17. cancel_order           — cancel an order (with reason)
 *   18. get_wilaya_risk        — assess risk for a wilaya
 *
 * All tools use the extended Prisma client (PII-encryption-aware). Read tools
 * return plaintext; write tools encrypt transparently.
 */
import "server-only";


import { z } from "zod";
import type { ToolContext, ToolResult } from "./registry";
import { registerTool } from "./registry";
import { assessOrderRisk } from "@/lib/wilaya-risk/engine";
import type { DbClient } from "@/lib/db";
import { productService } from "@/lib/data/product-service";

function getDb(ctx: ToolContext): DbClient {
  return ctx.db as DbClient;
}

// ── Tool 7: get_order_details ───────────────────────────────────────────────

const getOrderDetailsSchema = z.object({
  orderNumber: z.string().optional().describe("The order number (e.g. CMD-0001)"),
  orderId: z.string().optional().describe("The order ID (cuid)"),
});

registerTool({
  definition: {
    name: "get_order_details",
    description:
      "Fetch a single order by order number or ID. Returns the order with its items, customer, and delivery status.",
    parameters: {
      type: "object",
      properties: {
        orderNumber: { type: "string", description: "The order number (e.g. CMD-0001)" },
        orderId: { type: "string", description: "The order ID (cuid)" },
      },
    },
  },
  async execute(params, ctx): Promise<ToolResult> {
    try {
      const input = getOrderDetailsSchema.parse(params);
      if (!input.orderNumber && !input.orderId) {
        return { success: false, error: "Either orderNumber or orderId is required" };
      }
      const db = getDb(ctx);
      const order = await db.order.findFirst({
        where: input.orderNumber
          ? { orderNumber: input.orderNumber, deletedAt: null }
          : { id: input.orderId!, deletedAt: null },
        include: {
          items: true,
          customer: { select: { id: true, name: true, phone: true } },
          delivery: { where: { deletedAt: null } },
        },
      });
      if (!order) return { success: false, error: "Commande introuvable" };
      return {
        success: true,
        data: {
          id: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          totalPrice: order.totalPrice,
          deliveryCost: order.deliveryCost,
          wilaya: order.wilaya,
          commune: order.commune,
          phone: order.phone,
          notes: order.notes,
          source: order.source,
          createdAt: order.createdAt,
          confirmedAt: order.confirmedAt,
          shippedAt: order.shippedAt,
          deliveredAt: order.deliveredAt,
          customer: order.customer,
          items: order.items.map((i) => ({
            productName: i.productName,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            total: i.total,
          })),
          delivery: order.delivery
            ? {
                status: order.delivery.status,
                provider: order.delivery.provider,
                trackingNumber: order.delivery.trackingNumber,
              }
            : null,
        },
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Erreur" };
    }
  },
});

// ── Tool 8: list_recent_orders ──────────────────────────────────────────────

const listRecentOrdersSchema = z.object({
  status: z
    .enum(["draft", "confirmed", "shipped", "delivered", "returned", "cancelled"])
    .optional()
    .describe("Filter by status"),
  limit: z.number().int().min(1).max(50).optional().default(10),
});

registerTool({
  definition: {
    name: "list_recent_orders",
    description:
      "List the most recent orders, optionally filtered by status. Returns a summary (order number, customer, total, status, date).",
    parameters: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["draft", "confirmed", "shipped", "delivered", "returned", "cancelled"],
          description: "Filter by status",
        },
        limit: { type: "number", description: "Max results (default 10, max 50)" },
      },
    },
  },
  async execute(params, ctx): Promise<ToolResult> {
    try {
      const input = listRecentOrdersSchema.parse(params);
      const db = getDb(ctx);
      const orders = await db.order.findMany({
        where: input.status ? { status: input.status, deletedAt: null } : { deletedAt: null },
        include: {
          customer: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: input.limit,
      });
      return {
        success: true,
        data: orders.map((o) => ({
          orderNumber: o.orderNumber,
          customerName: o.customer.name,
          status: o.status,
          totalPrice: o.totalPrice,
          wilaya: o.wilaya,
          createdAt: o.createdAt,
        })),
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Erreur" };
    }
  },
});

// ── Tool 9: get_customer_details ────────────────────────────────────────────

const getCustomerDetailsSchema = z.object({
  customerId: z.string().describe("The customer ID (cuid)"),
});

registerTool({
  definition: {
    name: "get_customer_details",
    description:
      "Fetch a customer's profile + their full order history. Useful for understanding a customer before acting on their order.",
    parameters: {
      type: "object",
      properties: {
        customerId: { type: "string", description: "The customer ID (cuid)" },
      },
      required: ["customerId"],
    },
  },
  async execute(params, ctx): Promise<ToolResult> {
    try {
      const input = getCustomerDetailsSchema.parse(params);
      const db = getDb(ctx);
      const customer = await db.customer.findFirst({
        where: { id: input.customerId, deletedAt: null },
        include: {
          orders: {
            where: { deletedAt: null },
            select: {
              orderNumber: true,
              status: true,
              totalPrice: true,
              createdAt: true,
            },
            orderBy: { createdAt: "desc" },
          },
        },
      });
      if (!customer) return { success: false, error: "Client introuvable" };
      return {
        success: true,
        data: {
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          phone2: customer.phone2,
          wilaya: customer.wilaya,
          commune: customer.commune,
          address: customer.address,
          notes: customer.notes,
          orderCount: customer.orderCount,
          totalSpent: customer.totalSpent,
          riskScore: customer.riskScore,
          createdAt: customer.createdAt,
          orders: customer.orders,
        },
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Erreur" };
    }
  },
});

// ── Tool 10: get_low_stock_products ─────────────────────────────────────────

const getLowStockSchema = z.object({
  threshold: z.number().int().min(0).max(1000).optional().default(5),
});

registerTool({
  definition: {
    name: "get_low_stock_products",
    description:
      "List active products at or below a stock threshold (default 5). Helps the seller know what to restock.",
    parameters: {
      type: "object",
      properties: {
        threshold: { type: "number", description: "Stock threshold (default 5)" },
      },
    },
  },
  async execute(params, ctx): Promise<ToolResult> {
    try {
      const input = getLowStockSchema.parse(params);
      const db = getDb(ctx);
      const products = await db.product.findMany({
        where: { isActive: true, stock: { lte: input.threshold }, deletedAt: null },
        select: { id: true, name: true, sku: true, stock: true, price: true },
        orderBy: { stock: "asc" },
      });
      return { success: true, data: products };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Erreur" };
    }
  },
});

// ── Tool 11: get_revenue_report ─────────────────────────────────────────────

const getRevenueReportSchema = z.object({
  period: z
    .enum(["today", "yesterday", "week", "month"])
    .optional()
    .default("today"),
});

registerTool({
  definition: {
    name: "get_revenue_report",
    description:
      "Get a revenue report for a time period (today, yesterday, this week, this month). Returns total revenue, order count, and average order value.",
    parameters: {
      type: "object",
      properties: {
        period: {
          type: "string",
          enum: ["today", "yesterday", "week", "month"],
          description: "Time period (default: today)",
        },
      },
    },
  },
  async execute(params, ctx): Promise<ToolResult> {
    try {
      const input = getRevenueReportSchema.parse(params);
      const db = getDb(ctx);
      const now = new Date();
      let start: Date;
      let end: Date = now;
      let label: string;

      switch (input.period) {
        case "today":
          start = new Date(now);
          start.setHours(0, 0, 0, 0);
          label = "Aujourd'hui";
          break;
        case "yesterday":
          start = new Date(now);
          start.setDate(start.getDate() - 1);
          start.setHours(0, 0, 0, 0);
          end = new Date(start);
          end.setHours(23, 59, 59, 999);
          label = "Hier";
          break;
        case "week":
          start = new Date(now);
          start.setDate(start.getDate() - 7);
          label = "7 derniers jours";
          break;
        case "month":
          start = new Date(now);
          start.setMonth(start.getMonth() - 1);
          label = "30 derniers jours";
          break;
      }

      const [agg, count] = await Promise.all([
        db.order.aggregate({
          where: {
            createdAt: { gte: start, lte: end },
            status: { not: "cancelled" },
            deletedAt: null,
          },
          _sum: { totalPrice: true },
        }),
        db.order.count({
          where: {
            createdAt: { gte: start, lte: end },
            status: { not: "cancelled" },
            deletedAt: null,
          },
        }),
      ]);

      const revenue = agg._sum.totalPrice ?? 0;
      const avg = count > 0 ? Math.round(revenue / count) : 0;

      return {
        success: true,
        data: {
          period: label,
          start: start.toISOString(),
          end: end.toISOString(),
          orderCount: count,
          revenue,
          averageOrderValue: avg,
        },
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Erreur" };
    }
  },
});

// ── Tool 12: get_delivery_status ────────────────────────────────────────────

const getDeliveryStatusSchema = z.object({
  orderNumber: z.string().optional(),
  orderId: z.string().optional(),
});

registerTool({
  definition: {
    name: "get_delivery_status",
    description:
      "Check the delivery status for an order. Returns the delivery provider, tracking number, and current status.",
    parameters: {
      type: "object",
      properties: {
        orderNumber: { type: "string", description: "The order number" },
        orderId: { type: "string", description: "The order ID" },
      },
    },
  },
  async execute(params, ctx): Promise<ToolResult> {
    try {
      const input = getDeliveryStatusSchema.parse(params);
      if (!input.orderNumber && !input.orderId) {
        return { success: false, error: "Either orderNumber or orderId is required" };
      }
      const db = getDb(ctx);
      const order = await db.order.findFirst({
        where: input.orderNumber
          ? { orderNumber: input.orderNumber, deletedAt: null }
          : { id: input.orderId!, deletedAt: null },
        include: { delivery: { where: { deletedAt: null } } },
      });
      if (!order) return { success: false, error: "Commande introuvable" };
      if (!order.delivery) {
        return {
          success: true,
          data: { hasDelivery: false, message: "Aucune livraison créée pour cette commande" },
        };
      }
      return {
        success: true,
        data: {
          hasDelivery: true,
          orderId: order.id,
          orderNumber: order.orderNumber,
          provider: order.delivery.provider,
          status: order.delivery.status,
          trackingNumber: order.delivery.trackingNumber,
          shippingCost: order.delivery.cost,
          createdAt: order.delivery.createdAt,
        },
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Erreur" };
    }
  },
});

// ── Tool 13: search_conversations ───────────────────────────────────────────

const searchConversationsSchema = z.object({
  query: z.string().describe("Search by contact name"),
  limit: z.number().int().min(1).max(50).optional().default(10),
});

registerTool({
  definition: {
    name: "search_conversations",
    description:
      "Search WhatsApp/TikTok conversations by contact name. Returns the conversation ID, channel, contact name, and last message time.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search by contact name" },
        limit: { type: "number", description: "Max results (default 10)" },
      },
      required: ["query"],
    },
  },
  async execute(params, ctx): Promise<ToolResult> {
    try {
      const input = searchConversationsSchema.parse(params);
      const db = getDb(ctx);
      const q = input.query.trim().toLowerCase();
      // Session 31 (AUDIT-7 AI6): contactName is AES-256-GCM encrypted at rest
      // (see CONVERSATION_PII_FIELDS). A DB-level `contains` filter searches
      // ciphertext and returns nothing in production. Instead, fetch a bounded
      // window of recent conversations (the PII extension transparently
      // decrypts contactName/contactPhone on read) and filter by substring in
      // memory. Conversations are bounded (hundreds, not millions) so this is
      // safe; 500 is a generous window for a COD seller's WhatsApp history.
      const candidates = await db.conversation.findMany({
        select: {
          id: true,
          channel: true,
          contactName: true,
          contactPhone: true,
          lastMessageAt: true,
          unreadCount: true,
        },
        orderBy: { lastMessageAt: "desc" },
        take: 500,
      });
      const matched = candidates
        .filter((c) => (c.contactName ?? "").toLowerCase().includes(q))
        .slice(0, input.limit);
      return {
        success: true,
        data: matched.map((c) => ({
          id: c.id,
          channel: c.channel,
          contactName: c.contactName,
          contactPhone: c.contactPhone,
          lastMessageAt: c.lastMessageAt,
          unreadCount: c.unreadCount,
        })),
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Erreur" };
    }
  },
});

// ── Tool 14: get_pending_deliveries ─────────────────────────────────────────

registerTool({
  definition: {
    name: "get_pending_deliveries",
    description:
      "List all deliveries that are pending or in transit (not yet delivered/returned). Helps the seller follow up on stuck shipments.",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max results (default 20)" },
      },
    },
  },
  async execute(params, ctx): Promise<ToolResult> {
    try {
      const limit = Math.min(Number(params.limit ?? 20), 50);
      const db = getDb(ctx);
      const deliveries = await db.delivery.findMany({
        where: {
          status: { in: ["pending", "created", "picked_up", "in_transit", "at_hub", "out_for_delivery"] },
          deletedAt: null,
          // Exclude deliveries whose order was soft-deleted — a delivery
          // without an active order is meaningless to follow up on.
          order: { deletedAt: null },
        },
        include: {
          order: {
            select: {
              orderNumber: true,
              customer: { select: { name: true } },
              wilaya: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      });
      return {
        success: true,
        data: deliveries.map((d) => ({
          id: d.id,
          provider: d.provider,
          status: d.status,
          trackingNumber: d.trackingNumber,
          shippingCost: d.cost,
          createdAt: d.createdAt,
          orderNumber: d.order?.orderNumber,
          customerName: d.order?.customer.name,
          wilaya: d.order?.wilaya,
        })),
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Erreur" };
    }
  },
});

// ── Tool 15: get_top_products ───────────────────────────────────────────────

const getTopProductsSchema = z.object({
  period: z.enum(["today", "week", "month", "all"]).optional().default("week"),
  metric: z.enum(["quantity", "revenue"]).optional().default("quantity"),
  limit: z.number().int().min(1).max(20).optional().default(5),
});

registerTool({
  definition: {
    name: "get_top_products",
    description:
      "Get the best-selling products by quantity or revenue over a time period. Useful for inventory + marketing decisions.",
    parameters: {
      type: "object",
      properties: {
        period: {
          type: "string",
          enum: ["today", "week", "month", "all"],
          description: "Time period (default: week)",
        },
        metric: {
          type: "string",
          enum: ["quantity", "revenue"],
          description: "Sort metric (default: quantity)",
        },
        limit: { type: "number", description: "Max results (default 5)" },
      },
    },
  },
  async execute(params, ctx): Promise<ToolResult> {
    try {
      const input = getTopProductsSchema.parse(params);
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

      const items = await db.orderItem.findMany({
        where: start
          ? { order: { createdAt: { gte: start }, deletedAt: null } }
          : { order: { deletedAt: null } },
        select: { productName: true, quantity: true, total: true },
      });

      const map = new Map<string, { quantity: number; revenue: number }>();
      for (const item of items) {
        const existing = map.get(item.productName) ?? { quantity: 0, revenue: 0 };
        existing.quantity += item.quantity;
        existing.revenue += item.total;
        map.set(item.productName, existing);
      }

      const sorted = Array.from(map.entries())
        .map(([name, s]) => ({ name, ...s }))
        .sort((a, b) =>
          input.metric === "quantity" ? b.quantity - a.quantity : b.revenue - a.revenue,
        )
        .slice(0, input.limit);

      return { success: true, data: sorted };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Erreur" };
    }
  },
});

// ── Tool 16: update_product_stock ───────────────────────────────────────────

// W3-21: exported for the schema-drift test (verifies the zod schema matches
// the hand-written JSON schema sent to Gemini).
export const updateProductStockSchema = z.object({
  productId: z.string().describe("The product ID (cuid)"),
  newStock: z.number().int().min(0).describe("The new stock value"),
  reason: z.string().optional().describe("Optional reason for the adjustment"),
});

registerTool({
  definition: {
    name: "update_product_stock",
    description:
      "Update a product's stock to a new value. Use for manual corrections (damaged goods, miscounts, restocks).",
    // W2-3: structural confirmation gate — see agent.ts.
    requiresConfirmation: true,
    parameters: {
      type: "object",
      properties: {
        productId: { type: "string", description: "The product ID" },
        newStock: { type: "number", description: "The new stock value" },
        reason: { type: "string", description: "Optional reason for the adjustment" },
      },
      required: ["productId", "newStock"],
    },
  },
  async execute(params, ctx): Promise<ToolResult> {
    try {
      const input = updateProductStockSchema.parse(params);
      const db = getDb(ctx);
      // Guard: refuse to update a soft-deleted product (B-softdelete).
      const live = await db.product.findFirst({
        where: { id: input.productId, deletedAt: null },
        select: { id: true },
      });
      if (!live) {
        return { success: false, error: `Produit introuvable ou supprimé: ${input.productId}` };
      }
      // Capture the prior stock so the audit entry can record before/after.
      const prior = await db.product.findUnique({
        where: { id: input.productId },
        select: { stock: true },
      });
      const product = await productService.update(
        { prisma: db, shop: ctx.shop },
        input.productId,
        { stock: input.newStock },
      );
      // AI-P4: record an audit-log entry for the stock adjustment so the
      // `reason` is preserved in the product timeline (AuditLog table).
      // Previously the reason was discarded, leaving no audit trail.
      const { logAuditAsync } = await import("@/lib/audit");
      logAuditAsync({ prisma: db, shop: ctx.shop }, {
        action: "product.stock.adjusted",
        entity: "product",
        entityId: input.productId,
        actor: "ai_assistant",
        before: { stock: prior?.stock ?? null },
        after: { stock: product.stock },
        metadata: {
          reason: input.reason ?? null,
          sku: product.sku,
          name: product.name,
        },
      });
      return {
        success: true,
        data: product,
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Erreur" };
    }
  },
});

// ── Tool 17: cancel_order ───────────────────────────────────────────────────

// W3-21: exported for the schema-drift test (verifies the zod schema matches
// the hand-written JSON schema sent to Gemini).
export const cancelOrderSchema = z.object({
  orderNumber: z.string().describe("The order number to cancel"),
  reason: z.string().optional().describe("Reason for cancellation"),
});

registerTool({
  definition: {
    name: "cancel_order",
    description:
      "Cancel an order by order number. Only works for orders in draft, pending, or confirmed status (not shipped/delivered). The reason is saved to the order notes.",
    // W2-3: structural confirmation gate — see agent.ts.
    requiresConfirmation: true,
    parameters: {
      type: "object",
      properties: {
        orderNumber: { type: "string", description: "The order number to cancel" },
        reason: { type: "string", description: "Reason for cancellation" },
      },
      required: ["orderNumber"],
    },
  },
  async execute(params, ctx): Promise<ToolResult> {
    try {
      const input = cancelOrderSchema.parse(params);
      const db = getDb(ctx);
      const order = await db.order.findFirst({
        where: { orderNumber: input.orderNumber, deletedAt: null },
        select: { id: true, status: true, notes: true },
      });
      if (!order) return { success: false, error: "Commande introuvable" };
      // AI-M2: the order state machine (ALLOWED_TRANSITIONS) permits
      // draft→cancelled AND pending→cancelled. The previous guard
      // rejected "pending" orders, which is more restrictive than the
      // state machine — sellers who confirmed-at-the-AI-but-not-yet-
      // shipped couldn't cancel via the AI. Align with the state machine.
      if (!["draft", "pending", "confirmed"].includes(order.status)) {
        return {
          success: false,
          error: `Impossible d'annuler une commande avec le statut "${order.status}". Seules les commandes en brouillon, en attente ou confirmées peuvent être annulées.`,
        };
      }
      // Route through orderService.updateStatus to enforce the state machine
      // and restore stock (D-002). Raw db.order.update bypasses all invariants.
      // AI-M4: pass actor: "ai" so the OrderChange ledger entry is attributed
      // to the AI assistant (not the user) — distinguishes AI-initiated
      // cancellations from human ones in the order timeline.
      const { orderService } = await import("@/lib/data/order-service");
      await orderService.updateStatus(
        { prisma: db, shop: ctx.shop },
        order.id,
        "cancelled",
        { actor: "ai" },
      );

      // Append the cancellation reason as a note (separate from status update
      // so the state machine isn't bypassed by a second raw write).
      const cancellationNote = input.reason
        ? `[Annulée: ${input.reason}]`
        : "[Annulée]";
      const newNotes = order.notes
        ? `${order.notes}\n${cancellationNote}`
        : cancellationNote;
      await db.order.update({
        where: { id: order.id },
        data: { notes: newNotes },
        select: { id: true },
      });
      const updated = await db.order.findFirst({
        where: { id: order.id, deletedAt: null },
        select: { id: true, orderNumber: true, status: true },
      });
      return { success: true, data: updated };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Erreur" };
    }
  },
});

// ── Tool 18: get_wilaya_risk ────────────────────────────────────────────────

const getWilayaRiskSchema = z.object({
  wilaya: z.string().describe("The wilaya name (Arabic or French)"),
});

registerTool({
  definition: {
    name: "get_wilaya_risk",
    description:
      "Assess the delivery risk for a wilaya. Returns the risk level (1-5), label, and a recommendation. Useful when deciding whether to accept a COD order.",
    parameters: {
      type: "object",
      properties: {
        wilaya: { type: "string", description: "The wilaya name (Arabic or French)" },
      },
      required: ["wilaya"],
    },
  },
  async execute(params, ctx): Promise<ToolResult> {
    try {
      const input = getWilayaRiskSchema.parse(params);
      const db = getDb(ctx);
      const profile = await db.wilayaRiskProfile.findUnique({
        where: { wilaya: input.wilaya },
      });
      if (!profile) {
        return {
          success: false,
          error: `Aucun profil de risque pour la wilaya "${input.wilaya}"`,
        };
      }
      const assessment = await assessOrderRisk(
        { prisma: db, shop: ctx.shop },
        input.wilaya,
      );
      return {
        success: true,
        data: {
          wilaya: profile.wilaya,
          riskLevel: profile.riskLevel,
          confirmationRate: profile.confirmationRate,
          returnRate: profile.returnRate,
          ...assessment,
        },
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Erreur" };
    }
  },
});
