/**
 * Zod validation schemas for all input boundaries.
 *
 * Every service function's input is validated against one of these schemas.
 * This is the AAA standard (design system Section 12.2: "Zod validation on
 * all input boundaries — forms, file imports, AI responses, polling responses").
 */
import { z } from "zod";

// ─── Primitives ───────────────────────────────────────────────────────────────

/** Non-empty string, trimmed */
export const nonEmptyString = z.string().trim().min(1);

/** Algerian phone: 10 digits starting with 0[5-7] */
export const dzPhone = z
  .string()
  .trim()
  .regex(/^0[5-7]\d{8}$/, "Invalid Algerian phone (must be 0[5-7]XXXXXXXX)");

/** Non-negative integer (DZD money, quantities, stock) */
export const nonNegInt = z.number().int().nonnegative();

/** Positive integer */
export const posInt = z.number().int().positive();

/** Cuid ID */
export const cuid = z.string().regex(/^c[a-z0-9]{20,}$/i, "Invalid ID format");

/** ISO date string */
export const isoDate = z.string().datetime();

// ─── Order ────────────────────────────────────────────────────────────────────

export const orderStatusSchema = z.enum([
  "draft",
  "pending",
  "confirmed",
  "shipped",
  "delivered",
  "returned",
  "refused",
  "cancelled",
]);

export const orderSourceSchema = z.enum([
  "whatsapp",
  "tiktok",
  "manual",
  "webstore",
  "shopify",
  "woocommerce",
  "youcan",
]);

export const createOrderItemSchema = z.object({
  productId: cuid.nullable().optional(),
  productVariantId: cuid.nullable().optional(),
  productName: nonEmptyString,
  productVariantName: nonEmptyString.nullable().optional(),
  quantity: posInt,
  unitPrice: nonNegInt,
});

export const createOrderSchema = z.object({
  customerId: cuid,
  items: z.array(createOrderItemSchema).min(1, "At least one item required"),
  wilaya: nonEmptyString,
  commune: nonEmptyString,
  address: nonEmptyString,
  phone: dzPhone,
  source: orderSourceSchema.default("manual"),
  sourceMetadata: z.record(z.string(), z.unknown()).nullable().optional(),
  notes: z.string().nullable().optional(),
  deliveryCost: nonNegInt.nullable().optional(),
});

export const updateOrderStatusSchema = z.object({
  status: orderStatusSchema,
});

/**
 * Schema for `orderService.update` — only notes / deliveryCost / address
 * are updatable via this method (items + status have their own dedicated
 * methods: `updateStatus`, item add/remove). Strict validation prevents
 * callers from passing arbitrary keys (which would be silently ignored
 * by Prisma's strict `data` shape — confusing for the caller).
 */
export const updateOrderItemSchema = z.object({
  id: z.string().optional(),
  productId: cuid.nullable().optional(),
  productVariantId: cuid.nullable().optional(),
  productName: nonEmptyString,
  productVariantName: nonEmptyString.nullable().optional(),
  quantity: posInt,
  unitPrice: nonNegInt,
  total: nonNegInt,
});

export const updateOrderSchema = z.object({
  notes: z.string().nullable().optional(),
  deliveryCost: nonNegInt.nullable().optional(),
  // Order.address is a required String in the schema (not nullable) —
  // it's the delivery destination, always present.
  address: z.string().optional(),
  wilaya: nonEmptyString.optional(),
  commune: nonEmptyString.optional(),
  phone: dzPhone.optional(),
  totalPrice: nonNegInt.optional(),
  items: z.array(updateOrderItemSchema).optional(),
});

// ─── Customer ─────────────────────────────────────────────────────────────────

export const createCustomerSchema = z.object({
  name: nonEmptyString,
  phone: dzPhone,
  phone2: dzPhone.nullable().optional(),
  wilaya: nonEmptyString.nullable().optional(),
  commune: nonEmptyString.nullable().optional(),
  address: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const updateCustomerSchema = createCustomerSchema.partial();

// ─── Product ──────────────────────────────────────────────────────────────────

export const productVariantSchema = z.object({
  id: z.string().optional(), // present when editing existing variant
  name: nonEmptyString,
  sku: nonEmptyString.nullable().optional(),
  price: nonNegInt.nullable().optional(), // overrides product.price if set
  stock: z.number().int().default(0),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

export const createProductSchema = z.object({
  name: nonEmptyString,
  sku: nonEmptyString.nullable().optional(),
  price: nonNegInt,
  cost: nonNegInt.nullable().optional(),
  stock: z.number().int().default(0), // can be negative (backorders)
  lowStockThreshold: nonNegInt.default(5),
  categoryId: cuid.nullable().optional(),
  variants: z.array(productVariantSchema).nullable().optional(),
  images: z.array(nonEmptyString).nullable().optional(),
  isActive: z.boolean().default(true),
});

export const updateProductSchema = createProductSchema.partial();

// ─── Category ─────────────────────────────────────────────────────────────────

export const createCategorySchema = z.object({
  name: nonEmptyString,
});

// ─── Delivery ─────────────────────────────────────────────────────────────────

export const deliveryProviderSchema = z.enum(["yalidine", "maystro", "zrexpress", "dhd"]);

export const createDeliverySchema = z.object({
  orderId: cuid,
  provider: deliveryProviderSchema,
});

// ─── Expense ──────────────────────────────────────────────────────────────────

/**
 * Expense categories (from v2). Stored as a plain string column on the
 * Expense model — no normalized lookup table. Mirrors the 8 fixed buckets
 * the merchant uses to classify operational outflows.
 */
export const expenseCategorySchema = z.enum([
  "ads",
  "packaging",
  "delivery_fees",
  "returns",
  "supplies",
  "salary",
  "rent",
  "other",
]);

export const createExpenseSchema = z.object({
  category: expenseCategorySchema,
  amount: posInt,
  date: isoDate,
  notes: z.string().nullable().optional(),
});

export const updateExpenseSchema = createExpenseSchema.partial();

// ─── Type exports ─────────────────────────────────────────────────────────────

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type CreateDeliveryInput = z.infer<typeof createDeliverySchema>;
export type ExpenseCategory = z.infer<typeof expenseCategorySchema>;
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
