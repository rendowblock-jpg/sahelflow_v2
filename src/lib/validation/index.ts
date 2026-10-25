/**
 * Zod validation schemas for all input boundaries.
 *
 * Every service function's input is validated against one of these schemas.
 * This is the AAA standard (design system Section 12.2: "Zod validation on
 * all input boundaries — forms, file imports, AI responses, polling responses").
 */
import { z } from "zod";

import { normalizeDZPhone } from "./phone";

// ─── Primitives ───────────────────────────────────────────────────────────────

/** Non-empty string, trimmed */
export const nonEmptyString = z.string().trim().min(1);

/**
 * Characters a person may reasonably type or paste inside a phone number:
 * digits, spaces, dashes, dots, brackets and one leading "+". Anything else
 * (letters, ";", Arabic digits...) is NOT normalised, so it fails the strict
 * check below instead of being silently stripped into a valid-looking number.
 */
const DZ_PHONE_TYPED_CHARS = /^\+?[\d\s().-]+$/;

/**
 * Turn what a person typed into the local form, or hand the value back
 * untouched so the strict check below rejects it. A leading "+" marks an
 * international number: only Algeria's own code (+213) is rewritten, so a
 * foreign number can never be coerced into somebody else's local one.
 */
function toLocalDzPhone(value: string): string {
  if (!DZ_PHONE_TYPED_CHARS.test(value)) return value;
  if (value.startsWith("+") && !value.replace(/\D/g, "").startsWith("213")) {
    return value;
  }
  return normalizeDZPhone(value);
}

/**
 * Algerian phone: 10 digits starting with 0[5-7].
 *
 * The common spellings of one number ("+213555123456", "00213555123456",
 * "0555 12 34 56", and the nine digits "555123456" a spreadsheet leaves after
 * dropping the leading zero) are normalised with the canonical
 * `normalizeDZPhone` BEFORE the strict check, so the OUTPUT is always the
 * strict local form and everything else is still rejected with the same
 * message (S03c-12). Built with `.transform().pipe()` rather than
 * `z.preprocess` so the schema's INPUT type stays `string` (a preprocess would
 * widen it to `unknown` and break react-hook-form resolvers and `z.input`).
 */
export const dzPhone = z
  .string()
  .trim()
  .transform(toLocalDzPhone)
  .pipe(
    z
      .string()
      .regex(/^0[5-7]\d{8}$/, "Invalid Algerian phone (must be 0[5-7]XXXXXXXX)"),
  );

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

export const updateOrderStatusSchema = z.object({
  status: orderStatusSchema,
});

/**
 * Schema for `orderService.update` — the legacy compatibility PATCH surface.
 *
 * B7-1 money-truth rule: `totalPrice` is NOT an accepted input. It is derived
 * server-side (Σ unitPrice×quantity + deliveryCost, mirroring create) and only
 * recomputed when a money-bearing field (`items` / `deliveryCost`) is actually
 * present — so contact-only edits never rewrite money. Item-level `total` is
 * still required and validated against unitPrice×quantity in the service, but
 * the persisted value is the server-derived one. Status authority: money-bearing
 * fields are rejected on orders past confirmation (stock already reserved);
 * contact fields stay editable — see orderService.update.
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
  stock: nonNegInt.default(0),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

export const createProductSchema = z.object({
  name: nonEmptyString,
  sku: nonEmptyString.nullable().optional(),
  price: nonNegInt,
  cost: nonNegInt.nullable().optional(),
  // S03c-04: stock is never negative. Backorders are not a stated feature and a
  // negative count blocks every canonical confirm of the product (available =
  // stock - holds). Reservations, not negative stock, express over-commitment.
  stock: nonNegInt.default(0),
  lowStockThreshold: nonNegInt.default(5),
  categoryId: cuid.nullable().optional(),
  variants: z.array(productVariantSchema).nullable().optional(),
  images: z.array(nonEmptyString).nullable().optional(),
  isActive: z.boolean().default(true),
});

/**
 * updateProductSchema deliberately does NOT use `createProductSchema.partial()`
 * alone. In zod v4, `.partial()` PRESERVES create-time `.default()` backfill:
 *
 *   createProductSchema.partial().parse({ name: "x" })
 *   → { name: "x", stock: 0, lowStockThreshold: 5, isActive: true }
 *
 * Every absent field silently came back as its create default, and update
 * routes write the parsed object straight into Prisma — so a PATCH that only
 * renamed a product reset its stock to 0, force-republished it (isActive:
 * true), restored the default low-stock threshold, and falsely tripped the
 * `data.stock !== undefined` canonical-catalog gate and low-stock dispatch in
 * product-service.update. Update semantics require "absent in the request
 * body" = "do not touch": the three default-carrying fields are overridden
 * with default-free optionals. Variant-level defaults inside an explicitly
 * provided `variants` array are unchanged — variant edits are full-set
 * replacement (missing variant ids are deleted), so those defaults are
 * intended (pinned by src/lib/validation/__tests__/update-schemas.test.ts).
 */
export const updateProductSchema = createProductSchema.partial().extend({
  stock: nonNegInt.optional(), // never negative, like create (S03c-04)
  lowStockThreshold: nonNegInt.optional(),
  isActive: z.boolean().optional(),
});

// ─── Category ─────────────────────────────────────────────────────────────────

export const createCategorySchema = z.object({
  name: nonEmptyString,
});

// ─── Delivery ─────────────────────────────────────────────────────────────────
// (Phase 5) createDeliverySchema + deliveryProviderSchema removed — they were
// only consumed by deliveryService.create, which was dead production code.
// The API routes (/api/delivery/create, /sync, /[id]) define their own
// per-route z.object schemas inline.

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

export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type ExpenseCategory = z.infer<typeof expenseCategorySchema>;
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
