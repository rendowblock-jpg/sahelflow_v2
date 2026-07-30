/**
 * Zod validation schemas for all input boundaries.
 *
 * Every service function's input is validated against one of these schemas.
 */
import { z } from "zod";

export const nonEmptyString = z.string().trim().min(1);

export const dzPhone = z
  .string()
  .trim()
  .regex(/^0[5-7]\d{8}$/, "Invalid Algerian phone (must be 0[5-7]XXXXXXXX)");

export const nonNegInt = z.number().int().nonnegative();
export const posInt = z.number().int().positive();
export const cuid = z.string().regex(/^c[a-z0-9]{20,}$/i, "Invalid ID format");
export const isoDate = z.string().datetime();

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
  "import",
  "webstore",
  "storefront",
  "ai_chat",
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
  status: orderStatusSchema.optional(),
  sourceOrderId: z.string().nullable().optional(),
  orderNumberPrefix: z.string().optional(),
});

export const updateOrderStatusSchema = z.object({
  status: orderStatusSchema,
});

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
  address: z.string().optional(),
  wilaya: nonEmptyString.optional(),
  commune: nonEmptyString.optional(),
  phone: dzPhone.optional(),
  totalPrice: nonNegInt.optional(),
  items: z.array(updateOrderItemSchema).optional(),
});

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

export const productVariantSchema = z.object({
  id: z.string().optional(),
  name: nonEmptyString,
  sku: nonEmptyString.nullable().optional(),
  price: nonNegInt.nullable().optional(),
  stock: z.number().int().default(0),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

export const createProductSchema = z.object({
  name: nonEmptyString,
  sku: nonEmptyString.nullable().optional(),
  price: nonNegInt,
  cost: nonNegInt.nullable().optional(),
  stock: z.number().int().default(0),
  lowStockThreshold: nonNegInt.default(5),
  categoryId: cuid.nullable().optional(),
  variants: z.array(productVariantSchema).nullable().optional(),
  images: z.array(nonEmptyString).nullable().optional(),
  isActive: z.boolean().default(true),
});

export const updateProductSchema = createProductSchema.partial();

export const createCategorySchema = z.object({ name: nonEmptyString });

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

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type ExpenseCategory = z.infer<typeof expenseCategorySchema>;
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
