/**
 * Golden contract tests for the MCP agentic surface (FD-063).
 *
 * These pin the properties that must never drift silently. CodFlow proved the
 * value of this: its 96-tool count and per-scope tool lists are CI-pinned, which
 * makes an accidental scope widening impossible to merge.
 */
import { describe, expect, it } from "vitest";

import {
  EXPECTED_AI_TOOL_NAMES,
  getAiToolPolicy,
} from "@/lib/ai/actions/contracts";
import { redactForAudit } from "@/lib/mcp/audit";
import {
  MCP_AUDIT_MAX_DEPTH,
  MCP_AUDIT_STRING_LIMIT,
  MCP_CANDIDATE_TOOL_NAMES,
  MCP_FORBIDDEN_PERMISSIONS,
  MCP_IDEMPOTENT_TOOLS,
  MCP_OPEN_WORLD_TOOLS,
  MCP_RATE_LIMIT_MAX_CALLS,
  MCP_RATE_LIMIT_WINDOW_MS,
  MCP_READ_SCOPES,
  deriveMcpAnnotations,
  mcpToolOutputSchema,
  resolveMcpToolRequirements,
  toolOutputJsonSchema,
} from "@/lib/mcp/contracts";
import {
  consumeMcpRateLimit,
  resetMcpRateLimit,
} from "@/lib/mcp/rate-limit";

const SENSITIVE = [
  "cancel_order",
  "create_customer",
  "create_order",
  "create_product",
  "update_customer_notes",
  "update_order_status",
  "update_product_price",
  "update_product_stock",
];
const EXTERNAL_READ = [
  "estimate_delivery_cost",
  "get_delivery_cost_comparison",
];
const BLOCKED = ["assign_order_to_delivery"];

function classOf(name: string): string {
  return getAiToolPolicy(name).executionClass;
}

describe("MCP tool vocabulary", () => {
  it("considers exactly the app's AI tool vocabulary", () => {
    expect([...MCP_CANDIDATE_TOOL_NAMES]).toEqual([...EXPECTED_AI_TOOL_NAMES]);
  });

  it("keeps the 19 / 2 / 8 / 1 class split", () => {
    const counts = { read: 0, external_read: 0, sensitive: 0, blocked: 0 };
    for (const name of MCP_CANDIDATE_TOOL_NAMES) {
      counts[classOf(name) as keyof typeof counts] += 1;
    }
    expect(counts).toEqual({
      read: 19,
      external_read: 2,
      sensitive: 8,
      blocked: 1,
    });
  });

  it("pins the sensitive, external-read and blocked membership", () => {
    const sensitive = MCP_CANDIDATE_TOOL_NAMES.filter(
      (name) => classOf(name) === "sensitive",
    ).sort();
    const externalRead = MCP_CANDIDATE_TOOL_NAMES.filter(
      (name) => classOf(name) === "external_read",
    ).sort();
    const blocked = MCP_CANDIDATE_TOOL_NAMES.filter(
      (name) => classOf(name) === "blocked",
    ).sort();
    expect(sensitive).toEqual(SENSITIVE);
    expect(externalRead).toEqual(EXTERNAL_READ);
    expect(blocked).toEqual(BLOCKED);
  });
});

describe("MCP permission requirements", () => {
  it("never requires approval authority for any tool", () => {
    for (const name of MCP_CANDIDATE_TOOL_NAMES) {
      const requires = resolveMcpToolRequirements(name);
      for (const forbidden of MCP_FORBIDDEN_PERMISSIONS) {
        expect(requires).not.toContain(forbidden);
      }
    }
  });

  it("requires ai.use everywhere and approvals.request for sensitive verbs", () => {
    for (const name of MCP_CANDIDATE_TOOL_NAMES) {
      const requires = resolveMcpToolRequirements(name);
      expect(requires).toContain("ai.use");
      if (classOf(name) === "sensitive") {
        expect(requires).toContain("approvals.request");
      } else {
        expect(requires).not.toContain("approvals.request");
      }
    }
  });

  it("declares a real read scope for every read and external_read tool", () => {
    for (const name of MCP_CANDIDATE_TOOL_NAMES) {
      const executionClass = classOf(name);
      if (executionClass !== "read" && executionClass !== "external_read") {
        continue;
      }
      const scopes = MCP_READ_SCOPES[name];
      expect(scopes, `${name} has no MCP read scope`).toBeDefined();
      expect(scopes!.length).toBeGreaterThan(0);
    }
  });

  it("returns sorted, de-duplicated requirements", () => {
    for (const name of MCP_CANDIDATE_TOOL_NAMES) {
      const requires = [...resolveMcpToolRequirements(name)];
      expect(requires).toEqual([...new Set(requires)].sort());
    }
  });

  it("inherits the sensitive verbs' domain permissions verbatim", () => {
    for (const name of SENSITIVE) {
      const requires = resolveMcpToolRequirements(name);
      for (const action of getAiToolPolicy(name).requiredPermissions) {
        expect(requires).toContain(action);
      }
    }
  });
});

describe("MCP annotations", () => {
  it("derives read-only and destructive hints from the execution class", () => {
    for (const name of MCP_CANDIDATE_TOOL_NAMES) {
      const executionClass = classOf(name);
      const annotations = deriveMcpAnnotations(
        name,
        executionClass as "read" | "external_read" | "sensitive" | "blocked",
      );
      const readOnly =
        executionClass === "read" || executionClass === "external_read";
      expect(annotations.readOnlyHint).toBe(readOnly);
      expect(annotations.destructiveHint).toBe(executionClass === "sensitive");
      expect(annotations.readOnlyHint && annotations.destructiveHint).toBe(false);
    }
  });

  it("keeps the idempotent and open-world membership sets exact", () => {
    expect([...MCP_IDEMPOTENT_TOOLS].sort()).toEqual([
      "update_order_status",
      "update_product_price",
      "update_product_stock",
    ]);
    expect([...MCP_OPEN_WORLD_TOOLS].sort()).toEqual(EXTERNAL_READ);
    // append-mode notes accumulate, so the verb is deliberately not idempotent
    expect(MCP_IDEMPOTENT_TOOLS).not.toContain("update_customer_notes");
    for (const name of MCP_IDEMPOTENT_TOOLS) {
      expect(classOf(name)).toBe("sensitive");
    }
    for (const name of MCP_OPEN_WORLD_TOOLS) {
      expect(classOf(name)).toBe("external_read");
    }
  });
});

describe("MCP declared output", () => {
  it("advertises exactly the union it validates", () => {
    expect(mcpToolOutputSchema.safeParse({ success: true, data: { a: 1 } }).success).toBe(true);
    expect(mcpToolOutputSchema.safeParse({ success: false, error: "nope" }).success).toBe(true);
    expect(mcpToolOutputSchema.safeParse({ success: false }).success).toBe(false);
    expect(mcpToolOutputSchema.safeParse({ ok: true }).success).toBe(false);

    const schema = toolOutputJsonSchema() as { oneOf: Array<Record<string, unknown>> };
    expect(schema.oneOf).toHaveLength(2);
    expect(schema.oneOf[0]).toMatchObject({ required: ["success"] });
    expect(schema.oneOf[1]).toMatchObject({ required: ["success", "error"] });
  });
});

describe("MCP audit redaction", () => {
  it("elides over-long strings rather than truncating them", () => {
    const long = "a".repeat(MCP_AUDIT_STRING_LIMIT + 1);
    expect(redactForAudit(long)).toBe("[elided]");
    expect(redactForAudit("a".repeat(MCP_AUDIT_STRING_LIMIT))).toHaveLength(
      MCP_AUDIT_STRING_LIMIT,
    );
  });

  it("redacts Algerian phone numbers inside audit arguments", () => {
    const redacted = redactForAudit({ phone: "0555123456" }) as {
      phone: string;
    };
    expect(redacted.phone).not.toContain("5551234");
    expect(redacted.phone).toMatch(/56$/);
  });

  it("collapses nesting deeper than the depth bound", () => {
    let value: unknown = "leaf";
    for (let index = 0; index <= MCP_AUDIT_MAX_DEPTH + 2; index += 1) {
      value = { nested: value };
    }
    expect(JSON.stringify(redactForAudit(value))).toContain("[depth]");
  });

  it("never emits undefined or non-finite numbers", () => {
    expect(redactForAudit(undefined)).toBeNull();
    expect(redactForAudit(Number.NaN)).toBeNull();
    expect(redactForAudit(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("MCP rate limiting", () => {
  it("allows the CodFlow-parity budget then denies within the window", () => {
    resetMcpRateLimit();
    const subject = `test:${Math.random()}`;
    for (let index = 0; index < MCP_RATE_LIMIT_MAX_CALLS; index += 1) {
      expect(consumeMcpRateLimit(subject).allowed).toBe(true);
    }
    const denied = consumeMcpRateLimit(subject);
    expect(denied.allowed).toBe(false);
    expect(denied.remaining).toBe(0);
    expect(denied.resetAt).toBeGreaterThan(Date.now() - MCP_RATE_LIMIT_WINDOW_MS);
  });

  it("keeps subjects independent", () => {
    resetMcpRateLimit();
    const first = consumeMcpRateLimit("subject-a");
    const second = consumeMcpRateLimit("subject-b");
    expect(first.remaining).toBe(MCP_RATE_LIMIT_MAX_CALLS - 1);
    expect(second.remaining).toBe(MCP_RATE_LIMIT_MAX_CALLS - 1);
  });
});
