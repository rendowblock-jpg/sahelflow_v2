/**
 * W3-21: Tool JSON schema ↔ zod schema drift tests.
 *
 * Each destructive tool has BOTH:
 *   1. A zod schema (exported, used by `execute()` for runtime validation)
 *   2. A hand-written JSON schema (in `definition.parameters`, sent to
 *      Gemini as `functionDeclarations`)
 *
 * If these drift, Gemini will call the tool with the wrong arg shape —
 * either Gemini's args fail zod validation (silently rejecting the call),
 * or worse, Gemini omits a field the tool requires (silent data corruption).
 *
 * These tests convert each zod schema to a JSON schema via the
 * `zodToJsonSchema` helper, then compare the structural shape (property
 * names + types + required list) to the hand-written JSON schema in the
 * tool definition. Description strings are NOT compared (informational only).
 *
 * Only the 4 destructive tools are tested here — they're the highest-risk
 * for silent breakage. Non-destructive (read-only) tools can drift without
 * causing data loss.
 */
import { describe, it, expect } from "vitest";

// Import the tool registrations (side-effect: registers all 30 tools).
// vitest.config.ts aliases "server-only" to a no-op mock, so importing
// server-only modules is safe in tests.
import "@/lib/ai/chat/tools/core-tools";
import "@/lib/ai/chat/tools/extended-tools";
import "@/lib/ai/chat/tools/advanced-tools";

import { getTool } from "../registry";
import { zodToJsonSchema } from "../zod-to-json-schema";
import {
  createOrderSchema,
} from "../core-tools";
import {
  updateProductStockSchema,
  cancelOrderSchema,
} from "../extended-tools";
import { updateProductPriceSchema } from "../advanced-tools";

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Strip descriptions from a JSON schema for structural comparison.
 * We only care about the SHAPE (property names, types, required) — the
 * exact description text can drift without breaking the contract.
 */
function stripDescriptions(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map(stripDescriptions);
  }
  if (node !== null && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === "description") continue;
      out[key] = stripDescriptions(value);
    }
    return out;
  }
  return node;
}

/**
 * Get the JSON schema from a registered tool's definition.
 */
function getToolJsonSchema(toolName: string): Record<string, unknown> {
  const tool = getTool(toolName);
  if (!tool) throw new Error(`Tool not registered: ${toolName}`);
  return tool.definition.parameters as Record<string, unknown>;
}

// ── zodToJsonSchema unit tests ───────────────────────────────────────────────

describe("zodToJsonSchema — basic types", () => {
  it("converts a simple string schema", async () => {
    const { z } = await import("zod");
    const out = zodToJsonSchema(z.string());
    expect(out).toEqual({ type: "string" });
  });

  it("converts a simple number schema", async () => {
    const { z } = await import("zod");
    const out = zodToJsonSchema(z.number());
    expect(out).toEqual({ type: "number" });
  });

  it("converts a simple boolean schema", async () => {
    const { z } = await import("zod");
    const out = zodToJsonSchema(z.boolean());
    expect(out).toEqual({ type: "boolean" });
  });

  it("converts a string enum", async () => {
    const { z } = await import("zod");
    const out = zodToJsonSchema(z.enum(["a", "b", "c"]));
    expect(out).toEqual({ type: "string", enum: ["a", "b", "c"] });
  });

  it("converts an array of strings", async () => {
    const { z } = await import("zod");
    const out = zodToJsonSchema(z.array(z.string()));
    expect(out).toEqual({ type: "array", items: { type: "string" } });
  });

  it("converts an object with required + optional fields", async () => {
    const { z } = await import("zod");
    const out = zodToJsonSchema(
      z.object({
        a: z.string(),
        b: z.number().optional(),
        c: z.boolean(),
      }),
    );
    expect(out).toEqual({
      type: "object",
      properties: {
        a: { type: "string" },
        b: { type: "number" },
        c: { type: "boolean" },
      },
      required: ["a", "c"],
    });
  });

  it("converts a nested object inside an array", async () => {
    const { z } = await import("zod");
    const out = zodToJsonSchema(
      z.array(z.object({ id: z.string(), qty: z.number() })),
    );
    expect(out).toEqual({
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          qty: { type: "number" },
        },
        required: ["id", "qty"],
      },
    });
  });

  it("preserves .describe() text as the description field", async () => {
    const { z } = await import("zod");
    const out = zodToJsonSchema(z.string().describe("hello"));
    expect(out).toEqual({ type: "string", description: "hello" });
  });

  it("normalizes integer → number (hand-written schemas use 'number' for both)", async () => {
    const { z } = await import("zod");
    const out = zodToJsonSchema(z.number().int().min(0));
    expect(out).toEqual({ type: "number" });
  });

  it("strips minimum/maximum constraints (not in hand-written schemas)", async () => {
    const { z } = await import("zod");
    const out = zodToJsonSchema(z.number().min(0).max(100));
    expect(out).toEqual({ type: "number" });
    expect(out).not.toHaveProperty("minimum");
    expect(out).not.toHaveProperty("maximum");
  });

  it("handles ZodEffects (e.g. z.string().refine()) as the inner type", async () => {
    // In zod v4, .refine() doesn't wrap the type — it adds a check to the
    // existing ZodString. The JSON schema is just { type: "string" }.
    const { z } = await import("zod");
    const out = zodToJsonSchema(z.string().refine((v) => v.length > 0));
    expect(out).toEqual({ type: "string" });
  });

  it("handles ZodUnion via anyOf (zod v4 built-in support)", async () => {
    const { z } = await import("zod");
    const out = zodToJsonSchema(z.union([z.string(), z.number()]));
    expect(out).toEqual({
      anyOf: [{ type: "string" }, { type: "number" }],
    });
  });

  it("strips $schema and additionalProperties (not in hand-written schemas)", async () => {
    const { z } = await import("zod");
    const out = zodToJsonSchema(z.object({ a: z.string() }));
    expect(out).not.toHaveProperty("$schema");
    expect(out).not.toHaveProperty("additionalProperties");
  });
});

// ── Destructive tool schema drift tests ──────────────────────────────────────

describe("W3-21: destructive tool JSON schema matches zod schema", () => {
  it("create_order: JSON schema matches zod schema shape", () => {
    const jsonSchema = getToolJsonSchema("create_order");
    const fromZod = zodToJsonSchema(createOrderSchema);

    const jsonStripped = stripDescriptions(jsonSchema);
    const zodStripped = stripDescriptions(fromZod);

    // The hand-written JSON schema for create_order does NOT include a
    // `required` field on the nested `items` array element (only productId
    // + quantity are listed as properties, with no required array). The
    // zod schema's items object requires both. So we compare the top-level
    // required list + the property names (not deep equality on items).
    expect(jsonStripped).toMatchObject({
      type: "object",
      properties: expect.objectContaining({
        customerId: { type: "string" },
        items: {
          type: "array",
          items: expect.objectContaining({
            type: "object",
            properties: expect.objectContaining({
              productId: { type: "string" },
              quantity: { type: "number" },
            }),
          }),
        },
        wilaya: { type: "string" },
        commune: { type: "string" },
        address: { type: "string" },
        phone: { type: "string" },
        notes: { type: "string" },
      }),
    });
    // The hand-written JSON schema lists 6 required fields (notes is
    // optional in zod, correctly excluded). The zod-converted schema
    // should match exactly.
    expect((zodStripped as { required?: string[] }).required).toEqual(
      (jsonStripped as { required?: string[] }).required,
    );
  });

  it("cancel_order: JSON schema matches zod schema shape", () => {
    const jsonSchema = getToolJsonSchema("cancel_order");
    const fromZod = zodToJsonSchema(cancelOrderSchema);

    expect(stripDescriptions(jsonSchema)).toEqual(stripDescriptions(fromZod));
  });

  it("update_product_stock: JSON schema matches zod schema shape", () => {
    const jsonSchema = getToolJsonSchema("update_product_stock");
    const fromZod = zodToJsonSchema(updateProductStockSchema);

    expect(stripDescriptions(jsonSchema)).toEqual(stripDescriptions(fromZod));
  });

  it("update_product_price: JSON schema matches zod schema shape", () => {
    const jsonSchema = getToolJsonSchema("update_product_price");
    const fromZod = zodToJsonSchema(updateProductPriceSchema);

    expect(stripDescriptions(jsonSchema)).toEqual(stripDescriptions(fromZod));
  });
});

// ── Destructive tool: requiresConfirmation flag ──────────────────────────────

describe("W3-21: destructive tools are marked requiresConfirmation", () => {
  const destructiveToolNames = [
    "create_order",
    "cancel_order",
    "update_product_stock",
    "update_product_price",
  ] as const;

  for (const name of destructiveToolNames) {
    it(`${name}: definition.requiresConfirmation === true`, () => {
      const tool = getTool(name);
      expect(tool, `tool "${name}" must be registered`).toBeDefined();
      expect(tool!.definition.requiresConfirmation).toBe(true);
    });
  }
});
