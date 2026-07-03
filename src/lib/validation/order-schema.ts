/**
 * Order form validation schema (Phase 3).
 *
 * Shared between the client form (react-hook-form) and the server API.
 * This is the single source of truth for order-form validation — the client
 * uses it for inline validation, the server re-validates on submit.
 *
 * Zod v4 syntax.
 */
import { z } from "zod";

export const orderItemSchema = z.object({
  productId: z.string().min(1, "Product is required"),
  productName: z.string().min(1),
  productVariantId: z.string().nullable().optional(),
  productVariantName: z.string().nullable().optional(),
  quantity: z.number().int().min(1, "Quantity must be at least 1"),
  unitPrice: z.number().min(0, "Price cannot be negative"),
});

export const orderFormSchema = z.object({
  // Customer
  customerId: z.string().optional(),
  isNewCustomer: z.boolean(),
  newCustomerName: z.string().optional(),
  // Delivery
  wilaya: z.string().min(1, "Wilaya is required"),
  commune: z.string().min(1, "Commune is required"),
  address: z.string().min(1, "Address is required"),
  phone: z.string().min(1, "Phone is required").refine(
    (v) => v.replace(/\D/g, "").length >= 9,
    "Invalid phone number",
  ),
  // Items
  items: z.array(orderItemSchema).min(1, "At least one item is required"),
  // Pricing
  deliveryCost: z.number().min(0, "Delivery cost cannot be negative"),
}).superRefine((data, ctx) => {
  // If not new customer, customerId is required
  if (!data.isNewCustomer && !data.customerId) {
    ctx.addIssue({
      code: "custom",
      path: ["customerId"],
      message: "Please select a customer or create a new one",
    });
  }
  // If new customer, name is required
  if (data.isNewCustomer && !data.newCustomerName?.trim()) {
    ctx.addIssue({
      code: "custom",
      path: ["newCustomerName"],
      message: "Customer name is required",
    });
  }
});

export type OrderFormValues = z.infer<typeof orderFormSchema>;
