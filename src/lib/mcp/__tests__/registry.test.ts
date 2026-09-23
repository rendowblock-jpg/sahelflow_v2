/**
 * MCP registry tests — verify scope hiding, two-layer validation,
 * annotation consistency, and output contracts.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { z } from "zod";

import {
  clearMcpRegistry,
  registerMcpTool,
  getVisibleTools,
  executeMcpTool,
  zodToJsonSchema,
} from "../registry";
import { deriveAnnotations, assertAnnotationConsistency } from "../annotations";
import {
  safeParseToolResult,
  errorToolResult,
  successToolResult,
  toolOutput,
} from "../tool-output";

// ─── Test fixtures ───────────────────────────────────────────────────────────

const testOutputSchema = toolOutput(
  z.object({
    success: z.literal(true),
    data: z.string(),
  }),
);

const mockCtx = {
  db: {},
  shop: { shopId: "test-shop" },
  actor: {
    memberId: "test-member",
    role: "owner",
    permissions: ["orders.read", "orders.create", "products.read", "products.manage", "customers.read", "customers.manage"] as const,
  },
};

beforeEach(() => {
  clearMcpRegistry();
});

// ─── zodToJsonSchema ─────────────────────────────────────────────────────────

describe("zodToJsonSchema", () => {
  it("converts a simple object schema", () => {
    const schema = z.object({
      name: z.string(),
      age: z.number().optional(),
    }).strict();

    const result = zodToJsonSchema(schema);
    expect(result.type).toBe("object");
    expect(result.properties).toHaveProperty("name");
    expect(result.properties).toHaveProperty("age");
    expect(result.required).toContain("name");
    expect(result.required).not.toContain("age");
  });

  it("handles nested objects", () => {
    const schema = z.object({
      user: z.object({ id: z.string() }).strict(),
    }).strict();

    const result = zodToJsonSchema(schema);
    expect(result.properties).toHaveProperty("user");
  });

  it("handles arrays", () => {
    const schema = z.object({
      items: z.array(z.string()),
    }).strict();

    const result = zodToJsonSchema(schema);
    const itemsSchema = result.properties.items as Record<string, unknown>;
    expect(itemsSchema.type).toBe("array");
  });
});

// ─── Annotations ─────────────────────────────────────────────────────────────

describe("deriveAnnotations", () => {
  it("derives readOnlyHint for read execution class", () => {
    const annotations = deriveAnnotations("searchOrders", "read");
    expect(annotations.readOnlyHint).toBe(true);
    expect(annotations.destructiveHint).toBe(false);
  });

  it("derives destructiveHint for tools in DESTRUCTIVE_TOOLS", () => {
    const annotations = deriveAnnotations("createOrder", "sensitive");
    expect(annotations.destructiveHint).toBe(true);
    expect(annotations.readOnlyHint).toBe(false);
  });

  it("derives openWorldHint for external tools", () => {
    const annotations = deriveAnnotations("estimateDeliveryCost", "external_read");
    expect(annotations.openWorldHint).toBe(true);
  });
});

describe("assertAnnotationConsistency", () => {
  it("passes for consistent annotations", () => {
    const tool = {
      name: "searchOrders",
      description: "test",
      inputSchema: { type: "object" as const, properties: {} },
      inputZod: z.object({}).strict(),
      annotations: deriveAnnotations("searchOrders", "read"),
      requiredPermissions: [],
      group: "orders" as const,
    };
    expect(() => assertAnnotationConsistency(tool)).not.toThrow();
  });

  it("throws when destructive tool has readOnlyHint", () => {
    const tool = {
      name: "createOrder",
      description: "test",
      inputSchema: { type: "object" as const, properties: {} },
      inputZod: z.object({}).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      requiredPermissions: [],
      group: "orders" as const,
    };
    expect(() => assertAnnotationConsistency(tool)).toThrow();
  });
});

// ─── Tool output contracts ───────────────────────────────────────────────────

describe("safeParseToolResult", () => {
  it("returns structuredContent when result matches schema", () => {
    const result = safeParseToolResult(
      { success: true, data: "hello" },
      testOutputSchema,
    );
    expect(result.structuredContent).toEqual({ success: true, data: "hello" });
    expect(result.isError).toBe(false);
  });

  it("returns text-only on schema drift", () => {
    const result = safeParseToolResult(
      { unexpected: "shape" },
      testOutputSchema,
    );
    expect(result.structuredContent).toBeUndefined();
    expect(result.text).toBeTruthy();
    expect(result.isError).toBe(false);
  });

  it("returns isError for failure shape", () => {
    const result = safeParseToolResult(
      { success: false, error: "something broke" },
      testOutputSchema,
    );
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeTruthy();
  });

  it("handles undefined outputSchema", () => {
    const result = safeParseToolResult("plain text", undefined);
    expect(result.text).toBe("plain text");
    expect(result.structuredContent).toBeUndefined();
  });
});

describe("errorToolResult", () => {
  it("wraps Error into failure envelope", () => {
    const result = errorToolResult(new Error("test error"));
    expect(result.isError).toBe(true);
    expect(result.text).toContain("test error");
  });

  it("extracts code from SahelFlowError-like objects", () => {
    const error = Object.assign(new Error("coded error"), { code: "TEST_CODE" });
    const result = errorToolResult(error);
    expect(result.structuredContent).toHaveProperty("code", "TEST_CODE");
  });
});

// ─── Registry ────────────────────────────────────────────────────────────────

describe("registerMcpTool + getVisibleTools", () => {
  it("registers and lists tools", () => {
    registerMcpTool({
      name: "searchOrders",
      description: "Search orders",
      inputZod: z.object({ query: z.string().optional() }).strict(),
      outputSchema: testOutputSchema,
      group: "orders",
      executionClass: "read",
      requiredPermissions: ["orders.read"],
      execute: async () => ({ data: "test" }),
    });

    const visibility = getVisibleTools(["orders.read"]);
    expect(visibility.visibleTools).toHaveLength(1);
    expect(visibility.visibleTools[0].name).toBe("searchOrders");
  });

  it("hides tools when caller lacks permissions", () => {
    registerMcpTool({
      name: "createOrder",
      description: "Create order",
      inputZod: z.object({}).strict(),
      outputSchema: testOutputSchema,
      group: "orders",
      executionClass: "sensitive",
      requiredPermissions: ["orders.read", "orders.create"],
      execute: async () => ({ data: "test" }),
    });

    // Caller has orders.read but not orders.create
    const visibility = getVisibleTools(["orders.read"]);
    expect(visibility.visibleTools).toHaveLength(0);
  });

  it("shows tools when caller has all permissions", () => {
    registerMcpTool({
      name: "createOrder",
      description: "Create order",
      inputZod: z.object({}).strict(),
      outputSchema: testOutputSchema,
      group: "orders",
      executionClass: "sensitive",
      requiredPermissions: ["orders.read", "orders.create"],
      execute: async () => ({ data: "test" }),
    });

    const visibility = getVisibleTools(["orders.read", "orders.create"]);
    expect(visibility.visibleTools).toHaveLength(1);
  });
});

describe("executeMcpTool", () => {
  it("executes read tools directly", async () => {
    registerMcpTool({
      name: "searchOrders",
      description: "Search orders",
      inputZod: z.object({ query: z.string() }).strict(),
      outputSchema: testOutputSchema,
      group: "orders",
      executionClass: "read",
      requiredPermissions: ["orders.read"],
      execute: async (params) => ({ data: `found: ${params.query}` }),
    });

    const result = await executeMcpTool("searchOrders", { query: "test" }, mockCtx);
    expect(result.isError).toBe(false);
    expect(result.structuredContent).toHaveProperty("data", "found: test");
  });

  it("creates proposal for sensitive tools", async () => {
    registerMcpTool({
      name: "createOrder",
      description: "Create order",
      inputZod: z.object({ customerId: z.string() }).strict(),
      outputSchema: toolOutput(z.object({
        success: z.literal(true),
        pending_action_proposal: z.literal(true),
        tool: z.string(),
        proposalId: z.string(),
        proposalDigest: z.string(),
      })),
      group: "orders",
      executionClass: "sensitive",
      requiredPermissions: ["orders.read", "orders.create"],
      execute: async () => ({ data: "never runs" }),
    });

    const ctxWithProposal = {
      ...mockCtx,
      proposalRuntime: {
        createProposal: async (tool: string, args: Record<string, unknown>) => ({
          proposalId: "prop-123",
          proposalDigest: "digest-abc",
        }),
      },
    };

    const result = await executeMcpTool("createOrder", { customerId: "c1" }, ctxWithProposal);
    expect(result.structuredContent).toHaveProperty("pending_action_proposal", true);
    expect(result.structuredContent).toHaveProperty("proposalId", "prop-123");
  });

  it("rejects sensitive tools without proposal runtime", async () => {
    registerMcpTool({
      name: "createOrder",
      description: "Create order",
      inputZod: z.object({}).strict(),
      group: "orders",
      executionClass: "sensitive",
      requiredPermissions: ["orders.read", "orders.create"],
      execute: async () => ({}),
    });

    const result = await executeMcpTool("createOrder", {}, mockCtx);
    expect(result.isError).toBe(true);
  });

  it("returns error for invalid arguments", async () => {
    registerMcpTool({
      name: "searchOrders",
      description: "Search orders",
      inputZod: z.object({ query: z.string().min(1) }).strict(),
      group: "orders",
      executionClass: "read",
      requiredPermissions: ["orders.read"],
      execute: async () => ({ data: "test" }),
    });

    const result = await executeMcpTool("searchOrders", { query: "" }, mockCtx);
    expect(result.isError).toBe(true);
  });

  it("returns error for unknown tool", async () => {
    const result = await executeMcpTool("nonexistent", {}, mockCtx);
    expect(result.isError).toBe(true);
  });

  it("handles tool execution errors gracefully", async () => {
    registerMcpTool({
      name: "searchOrders",
      description: "Search orders",
      inputZod: z.object({}).strict(),
      group: "orders",
      executionClass: "read",
      requiredPermissions: ["orders.read"],
      execute: async () => {
        throw new Error("DB connection failed");
      },
    });

    const result = await executeMcpTool("searchOrders", {}, mockCtx);
    expect(result.isError).toBe(true);
    expect(result.text).toContain("DB connection failed");
  });
});
