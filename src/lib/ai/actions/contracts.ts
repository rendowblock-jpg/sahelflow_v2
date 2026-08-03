import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";

import { normalizePhone } from "@/lib/import/fields";
import type { Phase2Action } from "@/lib/identity/permissions";
import { SahelFlowError } from "@/types/errors";

export const AI_ACTION_PROPOSAL_TTL_MS = 10 * 60_000;

export type AiToolExecutionClass =
  | "read"
  | "external_read"
  | "sensitive"
  | "blocked";

export interface AiToolPolicy {
  executionClass: AiToolExecutionClass;
  requiredPermissions: readonly Phase2Action[];
  argsSchema?: z.ZodType<Record<string, unknown>>;
  blockedReasonCode?: string;
}

const algerianPhoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .transform((value) => normalizePhone(value))
  .refine(
    (value) => /^0[5-7]\d{8}$/.test(value),
    "Invalid Algerian phone (must be 0[5-7]XXXXXXXX)",
  );

const createOrderArgsSchema = z
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
    commune: z.string().trim().max(120),
    address: z.string().trim().max(500),
    phone: algerianPhoneSchema,
    notes: z.string().trim().max(2000).optional(),
  })
  .strict();

const updateOrderStatusArgsSchema = z
  .object({
    orderId: z.string().trim().min(1).max(200),
    status: z.enum([
      "draft",
      "pending",
      "shipped",
      "delivered",
      "cancelled",
      "returned",
    ]),
  })
  .strict();

const updateProductStockArgsSchema = z
  .object({
    productId: z.string().trim().min(1).max(200),
    newStock: z.number().int().nonnegative().max(10_000_000),
    reason: z.string().trim().max(1000).optional(),
  })
  .strict();

const cancelOrderArgsSchema = z
  .object({
    orderNumber: z.string().trim().min(1).max(200),
    reason: z.string().trim().max(1000).optional(),
  })
  .strict();

const createProductArgsSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    price: z.number().int().nonnegative().max(1_000_000_000),
    sku: z.string().trim().max(200).optional(),
    stock: z.number().int().nonnegative().max(10_000_000).default(0),
    categoryId: z.string().trim().min(1).max(200).optional(),
    cost: z.number().int().nonnegative().max(1_000_000_000).optional(),
  })
  .strict();

const updateProductPriceArgsSchema = z
  .object({
    productId: z.string().trim().min(1).max(200),
    newPrice: z.number().int().nonnegative().max(1_000_000_000),
  })
  .strict();

const createCustomerArgsSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    phone: algerianPhoneSchema,
    phone2: algerianPhoneSchema.optional(),
    wilaya: z.string().trim().max(120).optional(),
    commune: z.string().trim().max(120).optional(),
    address: z.string().trim().max(500).optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .strict();

const updateCustomerNotesArgsSchema = z
  .object({
    customerId: z.string().trim().min(1).max(200),
    notes: z.string().trim().min(1).max(1000),
    mode: z.enum(["append", "replace"]).default("append"),
  })
  .strict();

const SENSITIVE_POLICIES = {
  create_order: {
    executionClass: "sensitive",
    requiredPermissions: [
      "orders.create",
      "orders.read",
      "customers.contact.read",
      "orders.financials.read",
      "orders.financials.update",
    ],
    argsSchema: createOrderArgsSchema,
  },
  update_order_status: {
    executionClass: "sensitive",
    requiredPermissions: ["orders.read", "orders.update"],
    argsSchema: updateOrderStatusArgsSchema,
  },
  update_product_stock: {
    executionClass: "sensitive",
    requiredPermissions: ["products.read", "products.manage"],
    argsSchema: updateProductStockArgsSchema,
  },
  cancel_order: {
    executionClass: "sensitive",
    requiredPermissions: ["orders.read", "orders.update"],
    argsSchema: cancelOrderArgsSchema,
  },
  create_product: {
    executionClass: "sensitive",
    requiredPermissions: [
      "products.read",
      "products.manage",
      "products.cost.update",
    ],
    argsSchema: createProductArgsSchema,
  },
  update_product_price: {
    executionClass: "sensitive",
    requiredPermissions: ["products.read", "products.manage"],
    argsSchema: updateProductPriceArgsSchema,
  },
  create_customer: {
    executionClass: "sensitive",
    requiredPermissions: [
      "customers.read",
      "customers.manage",
      "customers.contact.update",
    ],
    argsSchema: createCustomerArgsSchema,
  },
  update_customer_notes: {
    executionClass: "sensitive",
    requiredPermissions: [
      "customers.read",
      "customers.manage",
      "customers.contact.update",
    ],
    argsSchema: updateCustomerNotesArgsSchema,
  },
} as const satisfies Record<string, AiToolPolicy>;

const READ_TOOL_NAMES = [
  "search_products",
  "search_customers",
  "get_stats",
  "get_order_details",
  "list_recent_orders",
  "get_customer_details",
  "get_low_stock_products",
  "get_revenue_report",
  "get_delivery_status",
  "search_conversations",
  "get_pending_deliveries",
  "get_top_products",
  "get_wilaya_risk",
  "get_product_details",
  "get_customer_orders",
  "get_returns_summary",
  "get_sales_by_wilaya",
  "get_conversation_messages",
  "search_orders",
] as const;

const EXTERNAL_READ_TOOL_NAMES = [
  "estimate_delivery_cost",
  "get_delivery_cost_comparison",
] as const;

const policies = new Map<string, AiToolPolicy>();
for (const name of READ_TOOL_NAMES) {
  policies.set(name, { executionClass: "read", requiredPermissions: [] });
}
for (const name of EXTERNAL_READ_TOOL_NAMES) {
  policies.set(name, {
    executionClass: "external_read",
    requiredPermissions: [],
  });
}
for (const [name, policy] of Object.entries(SENSITIVE_POLICIES)) {
  policies.set(name, policy);
}
policies.set("assign_order_to_delivery", {
  executionClass: "blocked",
  requiredPermissions: ["orders.read", "orders.update", "deliveries.manage"],
  blockedReasonCode: "AI_PROVIDER_ACTION_NOT_CONVERGED",
});

export const EXPECTED_AI_TOOL_NAMES = Object.freeze([
  ...READ_TOOL_NAMES,
  ...EXTERNAL_READ_TOOL_NAMES,
  ...Object.keys(SENSITIVE_POLICIES),
  "assign_order_to_delivery",
].sort());

export function getAiToolPolicy(toolName: string): AiToolPolicy {
  const policy = policies.get(toolName);
  if (!policy) {
    throw new SahelFlowError(
      `AI tool '${toolName}' has no execution policy`,
      "AI_TOOL_POLICY_MISSING",
      503,
    );
  }
  return policy;
}

export function parseSensitiveAiToolArgs(
  toolName: string,
  rawArgs: unknown,
): Record<string, unknown> {
  const policy = getAiToolPolicy(toolName);
  if (policy.executionClass !== "sensitive" || !policy.argsSchema) {
    throw new SahelFlowError(
      `AI tool '${toolName}' is not a supported sensitive action`,
      policy.blockedReasonCode ?? "AI_ACTION_NOT_SUPPORTED",
      409,
    );
  }
  return policy.argsSchema.parse(rawArgs);
}

function canonicalize(value: unknown): unknown {
  if (value === undefined) return null;
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new SahelFlowError(
        "AI action content contains a non-finite number",
        "AI_ACTION_CONTENT_INVALID",
        400,
      );
    }
    return value;
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) =>
          left < right ? -1 : left > right ? 1 : 0,
        )
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  throw new SahelFlowError(
    `Unsupported AI action value: ${typeof value}`,
    "AI_ACTION_CONTENT_INVALID",
    400,
  );
}

export function canonicalAiActionJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function aiActionHash(value: unknown): string {
  return createHash("sha256")
    .update(canonicalAiActionJson(value), "utf8")
    .digest("hex");
}

export interface AiActionProposalProjection {
  id: string;
  toolName: string;
  status: string;
  proposalDigestPrefix: string;
  summary: Record<string, unknown>;
  expiresAt: string;
  createdAt: string;
  executionState: string | null;
  lastErrorCode: string | null;
}
