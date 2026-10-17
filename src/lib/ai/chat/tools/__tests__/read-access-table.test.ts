/**
 * The chat read-access table is the single place that says which permission
 * guards which data when the assistant reads on behalf of a member. These
 * tests pin it against the central tool policy, the permission vocabulary, the
 * MCP scope table and the Owner preset, so a new tool or a typo cannot silently
 * widen or break access.
 */
import { describe, expect, it } from "vitest";

import {
  EXPECTED_AI_TOOL_NAMES,
  getAiToolPolicy,
} from "@/lib/ai/actions/contracts";
import {
  PHASE2_ACTIONS,
  getPhase2PresetPermissions,
  type Phase2Action,
} from "@/lib/identity/permissions";
import { MCP_READ_SCOPES } from "@/lib/mcp/contracts";

import {
  CHAT_READ_ACCESS,
  resolveChatReadAccess,
  withholdPaths,
} from "../read-access";

const VOCABULARY = new Set<string>(PHASE2_ACTIONS);

function isReadClass(name: string): boolean {
  const executionClass = getAiToolPolicy(name).executionClass;
  return executionClass === "read" || executionClass === "external_read";
}

const READ_TOOLS = EXPECTED_AI_TOOL_NAMES.filter(isReadClass);

function holds(
  permissions: readonly Phase2Action[],
): (action: Phase2Action) => boolean {
  const held = new Set<Phase2Action>(permissions);
  return (action) => held.has(action);
}

describe("chat read-access table", () => {
  it("covers exactly the read and external_read tools of the central policy", () => {
    expect(Object.keys(CHAT_READ_ACCESS).sort()).toEqual([...READ_TOOLS].sort());
    expect(READ_TOOLS).toHaveLength(21);
  });

  it("only uses names from the real permission vocabulary", () => {
    for (const [name, rule] of Object.entries(CHAT_READ_ACCESS)) {
      for (const action of rule.requires) {
        expect(VOCABULARY.has(action), `${name}: ${action}`).toBe(true);
      }
      for (const gate of rule.fieldGates ?? []) {
        expect(gate.whenHeld.length, `${name} gate needs a permission`).toBeGreaterThan(0);
        expect(gate.paths.length, `${name} gate needs a path`).toBeGreaterThan(0);
        for (const action of gate.whenHeld) {
          expect(VOCABULARY.has(action), `${name}: ${action}`).toBe(true);
        }
      }
    }
  });

  it("every tool demands at least one grant (no tool is open to any ai.use member)", () => {
    for (const [name, rule] of Object.entries(CHAT_READ_ACCESS)) {
      expect(rule.requires.length, name).toBeGreaterThan(0);
    }
  });

  it("is never weaker than the MCP scope table that already guards the same tools", () => {
    for (const name of READ_TOOLS) {
      const required = new Set<Phase2Action>(CHAT_READ_ACCESS[name]?.requires);
      for (const action of MCP_READ_SCOPES[name] ?? []) {
        expect(required.has(action), `${name} must also require ${action}`).toBe(true);
      }
    }
  });

  it("guards the three figures from the audit with the analytics, order and cost grants", () => {
    expect(CHAT_READ_ACCESS.get_stats?.requires).toEqual([
      "analytics.read",
      "analytics.financials.read",
    ]);
    expect(CHAT_READ_ACCESS.get_revenue_report?.requires).toEqual([
      "analytics.read",
      "analytics.financials.read",
    ]);
    const productGate = CHAT_READ_ACCESS.get_product_details?.fieldGates ?? [];
    expect(productGate).toContainEqual({
      whenHeld: ["products.cost.read"],
      paths: ["cost"],
    });
    const orderGates = CHAT_READ_ACCESS.get_order_details?.fieldGates ?? [];
    expect(orderGates).toContainEqual(
      expect.objectContaining({
        whenHeld: ["orders.financials.read"],
        paths: expect.arrayContaining(["totalPrice", "deliveryCost"]),
      }),
    );
  });
});

describe("the Owner loses nothing", () => {
  const owner = getPhase2PresetPermissions("owner");

  it("holds every permission declared for every tool in the catalogue", () => {
    expect(EXPECTED_AI_TOOL_NAMES.length).toBeGreaterThanOrEqual(30);
    for (const name of EXPECTED_AI_TOOL_NAMES) {
      const policy = getAiToolPolicy(name);
      const declared = new Set<Phase2Action>(policy.requiredPermissions);
      if (isReadClass(name)) {
        for (const action of CHAT_READ_ACCESS[name]?.requires ?? []) {
          declared.add(action);
        }
      }
      if (policy.executionClass === "sensitive") {
        declared.add("approvals.request");
        declared.add("ai.use");
      }
      for (const action of declared) {
        expect(owner.includes(action), `${name}: owner must hold ${action}`).toBe(true);
      }
    }
  });

  it("is allowed every read tool with no field withheld", () => {
    for (const name of READ_TOOLS) {
      expect(resolveChatReadAccess(name, holds(owner)), name).toEqual({
        allowed: true,
        withheldPaths: [],
      });
    }
  });

  it("the Manager preset is allowed every read tool with no field withheld either", () => {
    const manager = getPhase2PresetPermissions("manager");
    for (const name of READ_TOOLS) {
      expect(resolveChatReadAccess(name, holds(manager)), name).toEqual({
        allowed: true,
        withheldPaths: [],
      });
    }
  });
});

describe("the Operator preset", () => {
  const operator = holds(getPhase2PresetPermissions("operator"));

  it.each(["get_stats", "get_revenue_report"])(
    "is refused %s (profit and revenue)",
    (name) => {
      expect(resolveChatReadAccess(name, operator)).toEqual({
        allowed: false,
        missing: ["analytics.read", "analytics.financials.read"],
      });
    },
  );

  it("can use get_product_details but never receives cost", () => {
    expect(resolveChatReadAccess("get_product_details", operator)).toEqual({
      allowed: true,
      withheldPaths: ["cost"],
    });
  });
});

describe("fail-closed behaviour of the resolver", () => {
  it("refuses a tool that has no rule in the table", () => {
    expect(
      resolveChatReadAccess("get_stats", holds(PHASE2_ACTIONS), {}),
    ).toEqual({ allowed: false, missing: [] });
  });

  it("does not treat inherited object keys as rules", () => {
    expect(
      resolveChatReadAccess("constructor", holds(PHASE2_ACTIONS)),
    ).toEqual({ allowed: false, missing: [] });
    expect(
      resolveChatReadAccess("__proto__", holds(PHASE2_ACTIONS)),
    ).toEqual({ allowed: false, missing: [] });
  });

  it("lists every missing grant in declaration order", () => {
    expect(resolveChatReadAccess("get_top_products", holds([]))).toEqual({
      allowed: false,
      missing: ["products.read", "analytics.read", "analytics.financials.read"],
    });
  });

  it("withholds a gated path when ANY of its grants is missing", () => {
    const decision = resolveChatReadAccess(
      "get_customer_details",
      holds(["customers.read", "customers.contact.read", "risk.read", "orders.read"]),
    );

    expect(decision.allowed).toBe(true);
    if (decision.allowed) {
      expect(decision.withheldPaths).toEqual(
        expect.arrayContaining(["totalSpent", "riskScore", "orders.totalPrice"]),
      );
      expect(decision.withheldPaths).not.toContain("orders");
    }
  });
});

describe("withholdPaths", () => {
  it("removes a top-level key without mutating the input", () => {
    const input = { id: "p1", cost: 900, price: 1500 };

    const output = withholdPaths(input, ["cost"]);

    expect(output).toEqual({ id: "p1", price: 1500 });
    expect(input).toEqual({ id: "p1", cost: 900, price: 1500 });
  });

  it("walks arrays and nested objects", () => {
    const input = {
      totalPrice: 10,
      items: [
        { productName: "A", unitPrice: 4, total: 8 },
        { productName: "B", unitPrice: 1, total: 2 },
      ],
      customer: { id: "c", name: "N", phone: "0" },
    };

    const output = withholdPaths(input, [
      "totalPrice",
      "items.unitPrice",
      "items.total",
      "customer.name",
    ]);

    expect(output).toEqual({
      items: [{ productName: "A" }, { productName: "B" }],
      customer: { id: "c", phone: "0" },
    });
    expect(input.items[0]).toHaveProperty("unitPrice");
  });

  it("applies to every element of a top-level array result", () => {
    expect(
      withholdPaths([{ id: 1, revenue: 5 }, { id: 2, revenue: 6 }], ["revenue"]),
    ).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it("removes a whole subtree and leaves other values alone", () => {
    const when = new Date("2026-10-17T00:00:00.000Z");

    const output = withholdPaths(
      { orders: [{ totalPrice: 1 }], createdAt: when, note: null },
      ["orders"],
    ) as { createdAt: Date; note: null };

    expect(output).not.toHaveProperty("orders");
    expect(output.createdAt).toBe(when);
    expect(output.note).toBeNull();
  });

  it("is a no-op for absent paths, null parents and primitives", () => {
    expect(withholdPaths({ a: 1 }, ["b.c"])).toEqual({ a: 1 });
    expect(withholdPaths({ customer: null }, ["customer.name"])).toEqual({
      customer: null,
    });
    expect(withholdPaths("text", ["cost"])).toBe("text");
    expect(withholdPaths(null, ["cost"])).toBeNull();
    expect(withholdPaths({ a: 1 }, [])).toEqual({ a: 1 });
  });
});
