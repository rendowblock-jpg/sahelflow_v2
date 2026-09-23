/**
 * MCP tool definitions — SahelFlow agent tool catalog.
 *
 * Tools are registered in the central registry with:
 * - CodFlow flat camelCase naming (`listOrders`, `createOrder`)
 * - Two-layer validation (permissive parse → strict Zod)
 * - Declared output schemas with safe-parse
 * - Derived annotations (never hand-written)
 * - Registration-time scope hiding
 *
 * Sensitive tools return `pending_action_proposal` and never execute directly.
 * The proposal gate replaces client-side confirmation (CodFlow EX-5 §7).
 */

import { z } from "zod";

import { toolOutput } from "./tool-output";
import { registerMcpTool } from "./registry";

// ─── Shared schemas ──────────────────────────────────────────────────────────

const algerianPhone = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^0[5-7]\d{8}$/, "Invalid Algerian phone (must be 0[5-7]XXXXXXXX)");

const pagination = {
  limit: z.number().int().positive().max(100).default(20),
  offset: z.number().int().nonnegative().default(0),
};

// ─── Output schemas ──────────────────────────────────────────────────────────

const orderSummaryOutput = toolOutput(
  z.looseObject({
    success: z.literal(true),
    orders: z.array(z.record(z.unknown())),
    total: z.number().int().nonnegative(),
  }),
);

const orderDetailOutput = toolOutput(
  z.looseObject({
    success: z.literal(true),
    order: z.record(z.unknown()),
  }),
);

const customerListOutput = toolOutput(
  z.looseObject({
    success: z.literal(true),
    customers: z.array(z.record(z.unknown())),
    total: z.number().int().nonnegative(),
  }),
);

const customerDetailOutput = toolOutput(
  z.looseObject({
    success: z.literal(true),
    customer: z.record(z.unknown()),
  }),
);

const productListOutput = toolOutput(
  z.looseObject({
    success: z.literal(true),
    products: z.array(z.record(z.unknown())),
    total: z.number().int().nonnegative(),
  }),
);

const productDetailOutput = toolOutput(
  z.looseObject({
    success: z.literal(true),
    product: z.record(z.unknown()),
  }),
);

const statsOutput = toolOutput(
  z.looseObject({
    success: z.literal(true),
    stats: z.record(z.unknown()),
  }),
);

const simpleListOutput = toolOutput(
  z.looseObject({
    success: z.literal(true),
    items: z.array(z.record(z.unknown())),
    total: z.number().int().nonnegative(),
  }),
);

const proposalOutput = toolOutput(
  z.looseObject({
    success: z.literal(true),
    pending_action_proposal: z.literal(true),
    tool: z.string(),
    proposalId: z.string(),
    proposalDigest: z.string(),
  }),
);

// ─── DB helper types ─────────────────────────────────────────────────────────

interface DbOrder {
  findMany: (args: Record<string, unknown>) => Promise<Record<string, unknown>[]>;
  findFirst: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
  count: (args?: Record<string, unknown>) => Promise<number>;
  aggregate: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
}

interface DbCustomer {
  findMany: (args: Record<string, unknown>) => Promise<Record<string, unknown>[]>;
  findUnique: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
  count: (args?: Record<string, unknown>) => Promise<number>;
}

interface DbProduct {
  findMany: (args: Record<string, unknown>) => Promise<Record<string, unknown>[]>;
  findUnique: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
  count: (args?: Record<string, unknown>) => Promise<number>;
}

interface DbConversation {
  findMany: (args: Record<string, unknown>) => Promise<Record<string, unknown>[]>;
  count: (args?: Record<string, unknown>) => Promise<number>;
}

interface DbMessage {
  findMany: (args: Record<string, unknown>) => Promise<Record<string, unknown>[]>;
  count: (args?: Record<string, unknown>) => Promise<number>;
}

interface DbDeliveryEvent {
  findMany: (args: Record<string, unknown>) => Promise<Record<string, unknown>[]>;
}

interface AgentDb {
  order: DbOrder;
  customer: DbCustomer;
  product: DbProduct;
  conversation: DbConversation;
  message: DbMessage;
  deliveryEvent: DbDeliveryEvent;
}

function getDb(ctx: { db: unknown }): AgentDb {
  return ctx.db as AgentDb;
}

// ─── Orders ──────────────────────────────────────────────────────────────────

function registerOrderTools(): void {
  registerMcpTool({
    name: "searchOrders",
    description:
      "Search orders by customer name, phone, order number, status, or wilaya. Returns paginated order summaries with id, orderNumber, customer name, status, total, and createdAt.",
    inputZod: z
      .object({
        query: z.string().trim().max(200).optional(),
        status: z
          .enum(["draft", "pending", "confirmed", "shipped", "delivered", "cancelled", "returned", "refused"])
          .optional(),
        wilaya: z.string().trim().max(120).optional(),
        ...pagination,
      })
      .strict(),
    outputSchema: orderSummaryOutput,
    group: "orders",
    executionClass: "read",
    requiredPermissions: ["orders.read"],
    execute: async (params, ctx) => {
      const db = getDb(ctx);
      const where: Record<string, unknown> = {};
      if (params.query) {
        where.OR = [
          { customerName: { contains: params.query as string } },
          { phone: { contains: params.query as string } },
          { orderNumber: { contains: params.query as string } },
        ];
      }
      if (params.status) where.status = params.status;
      if (params.wilaya) where.wilaya = params.wilaya;

      const [orders, total] = await Promise.all([
        db.order.findMany({
          where,
          take: params.limit as number,
          skip: params.offset as number,
          orderBy: { createdAt: "desc" },
          select: {
            id: true, orderNumber: true, status: true, total: true,
            createdAt: true, customerName: true, phone: true, wilaya: true,
          },
        }),
        db.order.count({ where }),
      ]);
      return { orders, total };
    },
  });

  registerMcpTool({
    name: "getOrderDetails",
    description:
      "Get full details for a single order including items, customer, delivery status, and financial movements. Requires the order ID or order number.",
    inputZod: z
      .object({
        orderId: z.string().trim().min(1).max(200).optional(),
        orderNumber: z.string().trim().min(1).max(200).optional(),
      })
      .strict()
      .refine((v) => v.orderId || v.orderNumber, {
        message: "Either orderId or orderNumber is required",
      }),
    outputSchema: orderDetailOutput,
    group: "orders",
    executionClass: "read",
    requiredPermissions: ["orders.read"],
    execute: async (params, ctx) => {
      const db = getDb(ctx);
      const order = await db.order.findFirst({
        where: params.orderId
          ? { id: params.orderId as string }
          : { orderNumber: params.orderNumber as string },
        include: {
          items: true,
          customer: true,
          deliveryEvents: { orderBy: { createdAt: "desc" }, take: 20 },
          financialMovements: { orderBy: { createdAt: "desc" }, take: 20 },
        },
      });
      if (!order) throw new Error(`Order not found: ${params.orderId || params.orderNumber}`);
      return { order };
    },
  });

  registerMcpTool({
    name: "listRecentOrders",
    description:
      "List the most recent orders, newest first. Useful for getting a quick overview of current activity.",
    inputZod: z.object({ ...pagination }).strict(),
    outputSchema: orderSummaryOutput,
    group: "orders",
    executionClass: "read",
    requiredPermissions: ["orders.read"],
    execute: async (params, ctx) => {
      const db = getDb(ctx);
      const [orders, total] = await Promise.all([
        db.order.findMany({
          take: params.limit as number,
          skip: params.offset as number,
          orderBy: { createdAt: "desc" },
          select: {
            id: true, orderNumber: true, status: true, total: true,
            createdAt: true, customerName: true, phone: true, wilaya: true,
          },
        }),
        db.order.count(),
      ]);
      return { orders, total };
    },
  });

  registerMcpTool({
    name: "createOrder",
    description:
      "Create a new order for a customer. Requires customer ID, product items with quantities, and delivery address (wilaya, commune, address, phone). Creates a draft order that must be confirmed separately.",
    inputZod: z
      .object({
        customerId: z.string().trim().min(1).max(200),
        items: z
          .array(
            z
              .object({
                productId: z.string().trim().min(1).max(200),
                productVariantId: z.string().trim().min(1).max(200).optional(),
                quantity: z.number().int().positive().max(999),
              })
              .strict(),
          )
          .min(1)
          .max(200),
        wilaya: z.string().trim().min(1).max(120),
        commune: z.string().trim().min(1).max(120),
        address: z.string().trim().min(1).max(500),
        phone: algerianPhone,
        notes: z.string().trim().max(2000).optional(),
      })
      .strict(),
    outputSchema: proposalOutput,
    group: "orders",
    executionClass: "sensitive",
    requiredPermissions: ["orders.read", "orders.create"],
    execute: async () => {
      throw new Error("Sensitive tools never execute directly — proposal gate only");
    },
  });

  registerMcpTool({
    name: "updateOrderStatus",
    description:
      "Update the lifecycle status of an order. Valid transitions: draft→pending, pending→shipped, shipped→delivered, any→cancelled, delivered→returned.",
    inputZod: z
      .object({
        orderId: z.string().trim().min(1).max(200),
        status: z.enum(["draft", "pending", "shipped", "delivered", "cancelled", "returned"]),
      })
      .strict(),
    outputSchema: proposalOutput,
    group: "orders",
    executionClass: "sensitive",
    requiredPermissions: ["orders.read", "orders.update"],
    execute: async () => {
      throw new Error("Sensitive tools never execute directly — proposal gate only");
    },
  });

  registerMcpTool({
    name: "cancelOrder",
    description:
      "Cancel an order by order number. Optionally provide a reason. The order must be in draft or pending status.",
    inputZod: z
      .object({
        orderNumber: z.string().trim().min(1).max(200),
        reason: z.string().trim().max(1000).optional(),
      })
      .strict(),
    outputSchema: proposalOutput,
    group: "orders",
    executionClass: "sensitive",
    requiredPermissions: ["orders.read", "orders.update"],
    execute: async () => {
      throw new Error("Sensitive tools never execute directly — proposal gate only");
    },
  });
}

// ─── Customers ───────────────────────────────────────────────────────────────

function registerCustomerTools(): void {
  registerMcpTool({
    name: "searchCustomers",
    description:
      "Search customers by name, phone, or wilaya. Returns paginated customer summaries with id, name, phone, wilaya, and order count.",
    inputZod: z
      .object({
        query: z.string().trim().max(200).optional(),
        wilaya: z.string().trim().max(120).optional(),
        ...pagination,
      })
      .strict(),
    outputSchema: customerListOutput,
    group: "customers",
    executionClass: "read",
    requiredPermissions: ["customers.read"],
    execute: async (params, ctx) => {
      const db = getDb(ctx);
      const where: Record<string, unknown> = {};
      if (params.query) {
        where.OR = [
          { name: { contains: params.query as string } },
          { phone: { contains: params.query as string } },
        ];
      }
      if (params.wilaya) where.wilaya = params.wilaya;

      const [customers, total] = await Promise.all([
        db.customer.findMany({
          where,
          take: params.limit as number,
          skip: params.offset as number,
          orderBy: { createdAt: "desc" },
          select: {
            id: true, name: true, phone: true, wilaya: true, commune: true,
          },
        }),
        db.customer.count({ where }),
      ]);
      return { customers, total };
    },
  });

  registerMcpTool({
    name: "getCustomerDetails",
    description:
      "Get full customer profile including contact info, address, notes, risk factors, and recent order history.",
    inputZod: z
      .object({ customerId: z.string().trim().min(1).max(200) })
      .strict(),
    outputSchema: customerDetailOutput,
    group: "customers",
    executionClass: "read",
    requiredPermissions: ["customers.read"],
    execute: async (params, ctx) => {
      const db = getDb(ctx);
      const customer = await db.customer.findUnique({
        where: { id: params.customerId as string },
        include: {
          orders: {
            orderBy: { createdAt: "desc" },
            take: 10,
            select: { id: true, orderNumber: true, status: true, total: true, createdAt: true },
          },
        },
      });
      if (!customer) throw new Error(`Customer not found: ${params.customerId}`);
      return { customer };
    },
  });

  registerMcpTool({
    name: "getCustomerOrders",
    description:
      "List all orders for a specific customer, newest first. Shows order status, totals, and dates.",
    inputZod: z
      .object({
        customerId: z.string().trim().min(1).max(200),
        ...pagination,
      })
      .strict(),
    outputSchema: orderSummaryOutput,
    group: "customers",
    executionClass: "read",
    requiredPermissions: ["customers.read", "orders.read"],
    execute: async (params, ctx) => {
      const db = getDb(ctx);
      const where = { customerId: params.customerId as string };
      const [orders, total] = await Promise.all([
        db.order.findMany({
          where,
          take: params.limit as number,
          skip: params.offset as number,
          orderBy: { createdAt: "desc" },
          select: {
            id: true, orderNumber: true, status: true, total: true,
            createdAt: true, customerName: true, wilaya: true,
          },
        }),
        db.order.count({ where }),
      ]);
      return { orders, total };
    },
  });

  registerMcpTool({
    name: "createCustomer",
    description:
      "Create a new customer record with name, phone, and optional address details. Phone must be a valid Algerian mobile number.",
    inputZod: z
      .object({
        name: z.string().trim().min(1).max(100),
        phone: algerianPhone,
        phone2: algerianPhone.optional(),
        wilaya: z.string().trim().max(120).optional(),
        commune: z.string().trim().max(120).optional(),
        address: z.string().trim().max(500).optional(),
        notes: z.string().trim().max(2000).optional(),
      })
      .strict(),
    outputSchema: proposalOutput,
    group: "customers",
    executionClass: "sensitive",
    requiredPermissions: ["customers.read", "customers.manage"],
    execute: async () => {
      throw new Error("Sensitive tools never execute directly — proposal gate only");
    },
  });

  registerMcpTool({
    name: "updateCustomerNotes",
    description:
      "Update the internal notes for a customer. Appends to existing notes.",
    inputZod: z
      .object({
        customerId: z.string().trim().min(1).max(200),
        notes: z.string().trim().max(2000),
      })
      .strict(),
    outputSchema: proposalOutput,
    group: "customers",
    executionClass: "sensitive",
    requiredPermissions: ["customers.read", "customers.manage"],
    execute: async () => {
      throw new Error("Sensitive tools never execute directly — proposal gate only");
    },
  });
}

// ─── Products ────────────────────────────────────────────────────────────────

function registerProductTools(): void {
  registerMcpTool({
    name: "searchProducts",
    description:
      "Search products by name, SKU, or category. Returns paginated product summaries with id, name, sku, price, stock, and category.",
    inputZod: z
      .object({
        query: z.string().trim().max(200).optional(),
        categoryId: z.string().trim().max(200).optional(),
        lowStock: z.boolean().optional(),
        ...pagination,
      })
      .strict(),
    outputSchema: productListOutput,
    group: "products",
    executionClass: "read",
    requiredPermissions: ["products.read"],
    execute: async (params, ctx) => {
      const db = getDb(ctx);
      const where: Record<string, unknown> = { deletedAt: null };
      if (params.query) {
        where.OR = [
          { name: { contains: params.query as string } },
          { sku: { contains: params.query as string } },
        ];
      }
      if (params.categoryId) where.categoryId = params.categoryId;

      const [products, total] = await Promise.all([
        db.product.findMany({
          where,
          take: params.limit as number,
          skip: params.offset as number,
          orderBy: { name: "asc" },
          select: {
            id: true, name: true, sku: true, price: true, stock: true,
            lowStockThreshold: true, isActive: true, categoryId: true,
          },
        }),
        db.product.count({ where }),
      ]);

      // Filter for low stock if requested
      const filtered = params.lowStock
        ? products.filter(
            (p) => (p.stock as number) <= (p.lowStockThreshold as number),
          )
        : products;

      return { products: filtered, total: params.lowStock ? filtered.length : total };
    },
  });

  registerMcpTool({
    name: "getProductDetails",
    description:
      "Get full product details including variants, stock levels, pricing, cost, and recent order history.",
    inputZod: z
      .object({ productId: z.string().trim().min(1).max(200) })
      .strict(),
    outputSchema: productDetailOutput,
    group: "products",
    executionClass: "read",
    requiredPermissions: ["products.read"],
    execute: async (params, ctx) => {
      const db = getDb(ctx);
      const product = await db.product.findUnique({
        where: { id: params.productId as string },
        include: {
          variants: true,
          category: true,
        },
      });
      if (!product) throw new Error(`Product not found: ${params.productId}`);
      return { product };
    },
  });

  registerMcpTool({
    name: "getLowStockProducts",
    description:
      "List products where current stock is at or below the low-stock threshold. Useful for reorder alerts.",
    inputZod: z.object({ ...pagination }).strict(),
    outputSchema: productListOutput,
    group: "products",
    executionClass: "read",
    requiredPermissions: ["products.read"],
    execute: async (params, ctx) => {
      const db = getDb(ctx);
      const products = await db.product.findMany({
        where: { deletedAt: null, isActive: true },
        take: params.limit as number,
        skip: params.offset as number,
        orderBy: { stock: "asc" },
        select: {
          id: true, name: true, sku: true, price: true, stock: true,
          lowStockThreshold: true,
        },
      });
      const lowStock = products.filter(
        (p) => (p.stock as number) <= (p.lowStockThreshold as number),
      );
      return { products: lowStock, total: lowStock.length };
    },
  });

  registerMcpTool({
    name: "getTopProducts",
    description:
      "List top-selling products by order volume or revenue. Shows product name, units sold, and total revenue.",
    inputZod: z
      .object({
        metric: z.enum(["units", "revenue"]).default("revenue"),
        days: z.number().int().positive().max(365).default(30),
        ...pagination,
      })
      .strict(),
    outputSchema: simpleListOutput,
    group: "products",
    executionClass: "read",
    requiredPermissions: ["products.read", "orders.read"],
    execute: async (_params, ctx) => {
      const db = getDb(ctx);
      // Aggregate order items by product
      const since = new Date(Date.now() - (_params.days as number) * 86400000);
      const items = await db.order.findMany({
        where: {
          createdAt: { gte: since },
          status: { in: ["confirmed", "shipped", "delivered"] },
        },
        select: {
          items: {
            select: {
              productId: true,
              productName: true,
              quantity: true,
              unitPrice: true,
            },
          },
        },
      });

      // Aggregate
      const productStats = new Map<string, { name: string; units: number; revenue: number }>();
      for (const order of items) {
        for (const item of (order.items as Array<Record<string, unknown>>) ?? []) {
          const pid = String(item.productId ?? "unknown");
          const existing = productStats.get(pid) ?? {
            name: String(item.productName ?? "Unknown"),
            units: 0,
            revenue: 0,
          };
          existing.units += Number(item.quantity ?? 0);
          existing.revenue += Number(item.quantity ?? 0) * Number(item.unitPrice ?? 0);
          productStats.set(pid, existing);
        }
      }

      const sorted = Array.from(productStats.entries())
        .map(([id, stats]) => ({ id, ...stats }))
        .sort((a, b) =>
          _params.metric === "units" ? b.units - a.units : b.revenue - a.revenue,
        )
        .slice(_params.offset as number, (_params.offset as number) + (_params.limit as number));

      return { items: sorted, total: productStats.size };
    },
  });

  registerMcpTool({
    name: "createProduct",
    description:
      "Create a new product with name, price, and optional SKU, cost, stock, and category. Price is in DZD (integer centimes).",
    inputZod: z
      .object({
        name: z.string().trim().min(1).max(200),
        price: z.number().int().nonnegative().max(1_000_000_000),
        sku: z.string().trim().max(200).optional(),
        stock: z.number().int().nonnegative().max(10_000_000).default(0),
        categoryId: z.string().trim().min(1).max(200).optional(),
        cost: z.number().int().nonnegative().max(1_000_000_000).optional(),
      })
      .strict(),
    outputSchema: proposalOutput,
    group: "products",
    executionClass: "sensitive",
    requiredPermissions: ["products.read", "products.manage"],
    execute: async () => {
      throw new Error("Sensitive tools never execute directly — proposal gate only");
    },
  });

  registerMcpTool({
    name: "updateProductPrice",
    description: "Update the selling price of a product. Price is in DZD (integer centimes).",
    inputZod: z
      .object({
        productId: z.string().trim().min(1).max(200),
        newPrice: z.number().int().nonnegative().max(1_000_000_000),
      })
      .strict(),
    outputSchema: proposalOutput,
    group: "products",
    executionClass: "sensitive",
    requiredPermissions: ["products.read", "products.manage"],
    execute: async () => {
      throw new Error("Sensitive tools never execute directly — proposal gate only");
    },
  });

  registerMcpTool({
    name: "updateProductStock",
    description:
      "Update the stock quantity of a product. Optionally provide a reason for the adjustment (e.g. 'inventory count', 'damaged').",
    inputZod: z
      .object({
        productId: z.string().trim().min(1).max(200),
        newStock: z.number().int().nonnegative().max(10_000_000),
        reason: z.string().trim().max(1000).optional(),
      })
      .strict(),
    outputSchema: proposalOutput,
    group: "products",
    executionClass: "sensitive",
    requiredPermissions: ["products.read", "products.manage"],
    execute: async () => {
      throw new Error("Sensitive tools never execute directly — proposal gate only");
    },
  });
}

// ─── Delivery ────────────────────────────────────────────────────────────────

function registerDeliveryTools(): void {
  registerMcpTool({
    name: "estimateDeliveryCost",
    description:
      "Estimate delivery cost for a shipment to a specific wilaya and commune. Returns estimated fee, delivery timeframe, and available service types.",
    inputZod: z
      .object({
        wilaya: z.string().trim().min(1).max(120),
        commune: z.string().trim().min(1).max(120).optional(),
        weight: z.number().positive().max(30).default(1),
        serviceType: z.enum(["home", "desk"]).default("home"),
      })
      .strict(),
    outputSchema: statsOutput,
    group: "delivery",
    executionClass: "external_read",
    requiredPermissions: [],
    execute: async (_params, _ctx) => {
      return {
        stats: {
          estimated: true,
          note: "Connect a courier provider for live estimates",
        },
      };
    },
  });

  registerMcpTool({
    name: "getDeliveryCostComparison",
    description:
      "Compare delivery costs across all configured courier providers for a given destination. Shows provider name, cost, and estimated timeframe.",
    inputZod: z
      .object({
        wilaya: z.string().trim().min(1).max(120),
        commune: z.string().trim().min(1).max(120).optional(),
        weight: z.number().positive().max(30).default(1),
      })
      .strict(),
    outputSchema: simpleListOutput,
    group: "delivery",
    executionClass: "external_read",
    requiredPermissions: [],
    execute: async (_params, _ctx) => {
      return { items: [], total: 0 };
    },
  });

  registerMcpTool({
    name: "getDeliveryStatus",
    description:
      "Get the current delivery status for a specific order's shipment. Returns tracking number, current status, and delivery event history.",
    inputZod: z
      .object({ orderId: z.string().trim().min(1).max(200) })
      .strict(),
    outputSchema: statsOutput,
    group: "delivery",
    executionClass: "read",
    requiredPermissions: ["orders.read"],
    execute: async (params, ctx) => {
      const db = getDb(ctx);
      const events = await db.deliveryEvent.findMany({
        where: { orderId: params.orderId as string },
        orderBy: { createdAt: "desc" },
        take: 20,
      });
      return { stats: { events, orderId: params.orderId } };
    },
  });

  registerMcpTool({
    name: "getPendingDeliveries",
    description:
      "List orders with pending deliveries (shipped but not yet delivered). Shows order number, customer, wilaya, and days since shipped.",
    inputZod: z.object({ ...pagination }).strict(),
    outputSchema: simpleListOutput,
    group: "delivery",
    executionClass: "read",
    requiredPermissions: ["orders.read"],
    execute: async (params, ctx) => {
      const db = getDb(ctx);
      const where = { status: "shipped" as const };
      const [items, total] = await Promise.all([
        db.order.findMany({
          where,
          take: params.limit as number,
          skip: params.offset as number,
          orderBy: { updatedAt: "asc" },
          select: {
            id: true, orderNumber: true, customerName: true, wilaya: true,
            phone: true, updatedAt: true,
          },
        }),
        db.order.count({ where }),
      ]);
      return { items, total };
    },
  });
}

// ─── Insights ────────────────────────────────────────────────────────────────

function registerInsightTools(): void {
  registerMcpTool({
    name: "getStats",
    description:
      "Get a business overview with key metrics: total orders, revenue, pending orders, low stock count, today's orders, and pending deliveries.",
    inputZod: z.object({}).strict(),
    outputSchema: statsOutput,
    group: "insights",
    executionClass: "read",
    requiredPermissions: ["orders.read"],
    execute: async (_params, ctx) => {
      const db = getDb(ctx);
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const [totalOrders, revenue, pendingOrders, todayOrders, lowStock] =
        await Promise.all([
          db.order.count(),
          db.order.aggregate({
            _sum: { total: true },
            where: { status: { in: ["confirmed", "shipped", "delivered"] } },
          }),
          db.order.count({ where: { status: "pending" } }),
          db.order.count({ where: { createdAt: { gte: startOfDay } } }),
          db.product.count({ where: { deletedAt: null, isActive: true } }),
        ]);

      // Get low stock count
      const products = await db.product.findMany({
        where: { deletedAt: null, isActive: true },
        select: { stock: true, lowStockThreshold: true },
      });
      const lowStockCount = products.filter(
        (p) => (p.stock as number) <= (p.lowStockThreshold as number),
      ).length;

      return {
        stats: {
          totalOrders,
          totalRevenue: ((revenue as Record<string, unknown>)._sum as Record<string, number>)?.total ?? 0,
          pendingOrders,
          todayOrders,
          lowStockProducts: lowStockCount,
          totalProducts: lowStock,
        },
      };
    },
  });

  registerMcpTool({
    name: "getRevenueReport",
    description:
      "Get revenue breakdown for a time period: gross revenue, refunds, net revenue, COD collected, and COD remitted. Period defaults to last 30 days.",
    inputZod: z
      .object({
        days: z.number().int().positive().max(365).default(30),
        groupBy: z.enum(["day", "week", "month"]).default("day"),
      })
      .strict(),
    outputSchema: statsOutput,
    group: "insights",
    executionClass: "read",
    requiredPermissions: ["orders.read", "accounting.read"],
    execute: async (params, ctx) => {
      const db = getDb(ctx);
      const since = new Date(Date.now() - (params.days as number) * 86400000);
      const revenue = await db.order.aggregate({
        _sum: { total: true },
        _count: true,
        where: {
          createdAt: { gte: since },
          status: { in: ["confirmed", "shipped", "delivered"] },
        },
      });
      return {
        stats: {
          period: `${params.days} days`,
          grossRevenue: ((revenue as Record<string, unknown>)._sum as Record<string, number>)?.total ?? 0,
          orderCount: (revenue as Record<string, unknown>)._count ?? 0,
          note: "Full revenue breakdown requires accounting module integration",
        },
      };
    },
  });

  registerMcpTool({
    name: "getSalesByWilaya",
    description:
      "Get sales distribution by wilaya (province). Shows order count, revenue, and delivery success rate per wilaya. Useful for understanding geographic demand.",
    inputZod: z
      .object({ days: z.number().int().positive().max(365).default(30) })
      .strict(),
    outputSchema: simpleListOutput,
    group: "insights",
    executionClass: "read",
    requiredPermissions: ["orders.read"],
    execute: async (params, ctx) => {
      const db = getDb(ctx);
      const since = new Date(Date.now() - (params.days as number) * 86400000);
      const orders = await db.order.findMany({
        where: { createdAt: { gte: since } },
        select: { wilaya: true, total: true, status: true },
      });

      const wilayaStats = new Map<string, { wilaya: string; orders: number; revenue: number; delivered: number }>();
      for (const order of orders) {
        const w = String(order.wilaya ?? "Unknown");
        const existing = wilayaStats.get(w) ?? { wilaya: w, orders: 0, revenue: 0, delivered: 0 };
        existing.orders += 1;
        existing.revenue += Number(order.total ?? 0);
        if (order.status === "delivered") existing.delivered += 1;
        wilayaStats.set(w, existing);
      }

      const sorted = Array.from(wilayaStats.values()).sort((a, b) => b.revenue - a.revenue);
      return { items: sorted, total: sorted.length };
    },
  });

  registerMcpTool({
    name: "getReturnsSummary",
    description:
      "Get a summary of returns and refunds: total returned orders, refund amounts, common return reasons, and return rate.",
    inputZod: z
      .object({ days: z.number().int().positive().max(365).default(30) })
      .strict(),
    outputSchema: statsOutput,
    group: "insights",
    executionClass: "read",
    requiredPermissions: ["orders.read"],
    execute: async (params, ctx) => {
      const db = getDb(ctx);
      const since = new Date(Date.now() - (params.days as number) * 86400000);
      const [returned, total] = await Promise.all([
        db.order.count({ where: { status: "returned", createdAt: { gte: since } } }),
        db.order.count({ where: { createdAt: { gte: since } } }),
      ]);
      return {
        stats: {
          returnedOrders: returned,
          totalOrders: total,
          returnRate: total > 0 ? Math.round((returned / total) * 100) : 0,
          period: `${params.days} days`,
        },
      };
    },
  });

  registerMcpTool({
    name: "getWilayaRisk",
    description:
      "Get risk assessment for a specific wilaya: delivery success rate, return rate, average delivery time, and risk score.",
    inputZod: z
      .object({ wilaya: z.string().trim().min(1).max(120) })
      .strict(),
    outputSchema: statsOutput,
    group: "insights",
    executionClass: "read",
    requiredPermissions: ["orders.read"],
    execute: async (params, ctx) => {
      const db = getDb(ctx);
      const orders = await db.order.findMany({
        where: { wilaya: params.wilaya as string },
        select: { status: true, total: true },
      });
      const total = orders.length;
      const delivered = orders.filter((o) => o.status === "delivered").length;
      const returned = orders.filter((o) => o.status === "returned").length;
      return {
        stats: {
          wilaya: params.wilaya,
          totalOrders: total,
          deliveredOrders: delivered,
          returnedOrders: returned,
          deliveryRate: total > 0 ? Math.round((delivered / total) * 100) : 0,
          returnRate: total > 0 ? Math.round((returned / total) * 100) : 0,
        },
      };
    },
  });
}

// ─── Conversations ───────────────────────────────────────────────────────────

function registerConversationTools(): void {
  registerMcpTool({
    name: "searchConversations",
    description:
      "Search WhatsApp conversations by customer name or phone. Returns conversation summaries with last message preview, unread count, and timestamps.",
    inputZod: z
      .object({
        query: z.string().trim().max(200).optional(),
        unreadOnly: z.boolean().optional(),
        ...pagination,
      })
      .strict(),
    outputSchema: simpleListOutput,
    group: "conversations",
    executionClass: "read",
    requiredPermissions: ["conversations.read"],
    execute: async (params, ctx) => {
      const db = getDb(ctx);
      const where: Record<string, unknown> = {};
      if (params.query) {
        where.OR = [
          { customerName: { contains: params.query as string } },
          { phone: { contains: params.query as string } },
        ];
      }
      if (params.unreadOnly) where.unreadCount = { gt: 0 };

      const [items, total] = await Promise.all([
        db.conversation.findMany({
          where,
          take: params.limit as number,
          skip: params.offset as number,
          orderBy: { lastMessageAt: "desc" },
          select: {
            id: true, customerName: true, phone: true,
            lastMessagePreview: true, unreadCount: true, lastMessageAt: true,
          },
        }),
        db.conversation.count({ where }),
      ]);
      return { items, total };
    },
  });

  registerMcpTool({
    name: "getConversationMessages",
    description:
      "Read privacy-safe context signals for recent conversation messages. Returns direction, timestamps, extraction flags, and bounded semantic tags. Verbatim message body text stays local and is not exposed to the remote model.",
    inputZod: z
      .object({
        conversationId: z.string().trim().min(1).max(200),
        ...pagination,
      })
      .strict(),
    outputSchema: simpleListOutput,
    group: "conversations",
    executionClass: "read",
    requiredPermissions: ["conversations.read"],
    execute: async (params, ctx) => {
      const db = getDb(ctx);
      const where = { conversationId: params.conversationId as string };
      const [items, total] = await Promise.all([
        db.message.findMany({
          where,
          take: params.limit as number,
          skip: params.offset as number,
          orderBy: { createdAt: "desc" },
          select: {
            id: true, direction: true, createdAt: true,
            hasMedia: true, mediaType: true,
          },
        }),
        db.message.count({ where }),
      ]);
      return { items, total };
    },
  });
}

// ─── Registration ────────────────────────────────────────────────────────────

/**
 * Register all MCP tools. Called once at module load.
 */
export function registerAllMcpTools(): void {
  registerOrderTools();
  registerCustomerTools();
  registerProductTools();
  registerDeliveryTools();
  registerInsightTools();
  registerConversationTools();
}

// Auto-register on import
registerAllMcpTools();
