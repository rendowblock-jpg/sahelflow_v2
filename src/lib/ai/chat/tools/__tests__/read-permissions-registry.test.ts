/**
 * AIX-01 / S06a-01 + S06a-03: the in-app chat must give an actor only the data
 * the same actor may open in the normal UI, and a refused or failed tool call
 * must come back to the model as a tool result instead of ending the turn.
 *
 * These tests go through the real registry wrapper (`registerTool`) with the
 * real permission presets and the real `trustedActionAllowed`. Only the
 * server-minted-actor brand check is stubbed, the same way the identity
 * projection tests do it. `SF_AI_ACTION_POLICY_TEST` switches the Vitest-only
 * legacy bypass off so the production wrapper runs.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/identity/trusted-actor", () => ({
  isTrustedActorContext: vi.fn(() => true),
  requireTrustedActor: vi.fn(),
}));

import { runWithAiActionProposalRuntime } from "@/lib/ai/actions/proposal-runtime";
import {
  EXPECTED_AI_TOOL_NAMES,
  getAiToolPolicy,
} from "@/lib/ai/actions/contracts";
import {
  getTool,
  registerTool,
  type ToolContext,
  type ToolResult,
} from "@/lib/ai/chat/tools/registry";
import type { Phase2Action, Phase2Role } from "@/lib/identity/permissions";
import {
  isTrustedActorContext,
  type TrustedActorContext,
} from "@/lib/identity/trusted-actor";
import type { ShopContext } from "@/lib/shops/context";
import { SahelFlowError } from "@/types/errors";

/** Every gated number in the fixtures carries this value so a leak is greppable. */
const SECRET = 424242;
const SECRET_TEXT = "424242";
const CONTACT_SECRET = "CONTACT-SECRET";

const SHOP = { shopId: "shop-a" } as unknown as ShopContext;

function actor(
  role: Phase2Role,
  permissions?: readonly Phase2Action[],
): TrustedActorContext {
  return {
    version: 1,
    actor: {
      kind: "person",
      personId: "1".repeat(32),
      workspaceMemberId: "2".repeat(32),
      deviceId: "3".repeat(32),
      sessionId: "session-1",
      role,
      ...(permissions ? { permissions } : {}),
      policyVersion: 1,
      revocationEpoch: 0,
    },
    shop: SHOP,
  } as unknown as TrustedActorContext;
}

function context(
  who: TrustedActorContext | undefined,
): ToolContext {
  return {
    db: {},
    shop: SHOP,
    ...(who ? { actor: who } : {}),
  };
}

const NOW = new Date("2026-10-17T10:00:00.000Z");

/** Shapes copied from the real tool bodies, with the gated fields set to SECRET. */
const READ_FIXTURES: Record<string, unknown> = {
  search_products: [
    { id: "p1", name: "Widget", sku: "W-1", price: 1500, stock: 3, category: "Cat" },
  ],
  search_customers: [
    {
      id: "c1",
      name: CONTACT_SECRET,
      phone: "0555000000",
      wilaya: "Alger",
      orderCount: 2,
      totalSpent: SECRET,
    },
  ],
  get_stats: {
    totalOrders: 5,
    grossRevenue: SECRET,
    grossOrderValue: SECRET,
    realizedRevenue: SECRET,
    netRevenue: SECRET,
    netProfit: SECRET,
    profitabilityComplete: true,
    totalCustomers: 3,
    lowStockCount: 1,
  },
  get_order_details: {
    id: "o1",
    orderNumber: "ORD-1",
    status: "pending",
    totalPrice: SECRET,
    deliveryCost: SECRET,
    wilaya: "Alger",
    commune: "Bab El Oued",
    phone: "0555000000",
    notes: CONTACT_SECRET,
    source: "manual",
    createdAt: NOW,
    customer: { id: "c1", name: CONTACT_SECRET, phone: "0555000000" },
    items: [
      { productName: "Widget", quantity: 2, unitPrice: SECRET, total: SECRET },
    ],
    delivery: { status: "pending", provider: "yalidine", trackingNumber: "T1" },
  },
  list_recent_orders: [
    {
      orderNumber: "ORD-1",
      customerName: CONTACT_SECRET,
      status: "pending",
      totalPrice: SECRET,
      wilaya: "Alger",
      createdAt: NOW,
    },
  ],
  get_customer_details: {
    id: "c1",
    name: CONTACT_SECRET,
    phone: "0555000000",
    phone2: null,
    wilaya: "Alger",
    commune: "Bab El Oued",
    address: "1 rue X",
    notes: null,
    orderCount: 2,
    totalSpent: SECRET,
    riskScore: SECRET,
    createdAt: NOW,
    orders: [
      { orderNumber: "ORD-1", status: "pending", totalPrice: SECRET, createdAt: NOW },
    ],
  },
  get_low_stock_products: [
    { id: "p1", name: "Widget", sku: "W-1", stock: 1, price: 1500 },
  ],
  get_revenue_report: {
    period: "week",
    revenue: SECRET,
    realizedRevenue: SECRET,
    netRevenue: SECRET,
    netProfit: SECRET,
    profitabilityComplete: false,
    missingCostItemCount: 2,
    estimatedCostItemCount: 1,
    averageOrderValue: SECRET,
  },
  get_delivery_status: {
    hasDelivery: true,
    orderId: "o1",
    orderNumber: "ORD-1",
    provider: "yalidine",
    status: "pending",
    trackingNumber: "T1",
    shippingCost: SECRET,
    createdAt: NOW,
  },
  search_conversations: [
    {
      id: "k1",
      channel: "whatsapp",
      contactName: CONTACT_SECRET,
      contactPhone: "0555000000",
      lastMessageAt: NOW,
      unreadCount: 1,
    },
  ],
  get_pending_deliveries: [
    {
      id: "d1",
      provider: "yalidine",
      status: "pending",
      trackingNumber: "T1",
      shippingCost: SECRET,
      createdAt: NOW,
      orderNumber: "ORD-1",
      customerName: CONTACT_SECRET,
      wilaya: "Alger",
    },
  ],
  get_top_products: [{ name: "Widget", quantity: 4, revenue: SECRET }],
  get_wilaya_risk: {
    wilaya: "Alger",
    riskLevel: 2,
    confirmationRate: 0.8,
    returnRate: 0.1,
  },
  get_product_details: {
    id: "p1",
    name: "Widget",
    sku: "W-1",
    price: 1500,
    cost: SECRET,
    stock: 3,
    lowStockThreshold: 2,
    isActive: true,
    category: "Cat",
    createdAt: NOW,
  },
  get_customer_orders: [
    { orderNumber: "ORD-1", status: "pending", totalPrice: SECRET, wilaya: "Alger", createdAt: NOW },
  ],
  get_returns_summary: {
    period: "month",
    returnedCount: 1,
    refusedCount: 0,
    totalReturns: 1,
    totalOrders: 10,
    returnRate: "10%",
    returnedValue: SECRET,
  },
  get_sales_by_wilaya: [{ wilaya: "Alger", orderCount: 3, revenue: SECRET }],
  get_conversation_messages: [
    { id: "m1", direction: "in", body: "salam", timestamp: NOW, extracted: false },
  ],
  search_orders: [
    {
      orderNumber: "ORD-1",
      status: "pending",
      totalPrice: SECRET,
      wilaya: "Alger",
      createdAt: NOW,
      customerName: CONTACT_SECRET,
      customerPhone: "0555000000",
    },
  ],
  estimate_delivery_cost: { provider: "yalidine", cost: 700, available: true },
  get_delivery_cost_comparison: [
    { provider: "yalidine", cost: 700, available: true },
  ],
};

const READ_TOOLS = EXPECTED_AI_TOOL_NAMES.filter((name) => {
  const executionClass = getAiToolPolicy(name).executionClass;
  return executionClass === "read" || executionClass === "external_read";
});

/** Tools that are mostly financial: an actor without the grant is refused. */
const OPERATOR_REFUSED = [
  "get_revenue_report",
  "get_sales_by_wilaya",
  "get_stats",
  "get_top_products",
];

const bodies = new Map<string, ReturnType<typeof vi.fn>>();

function registerReadFixtures(): void {
  bodies.clear();
  for (const name of READ_TOOLS) {
    const body = vi.fn(
      async (): Promise<ToolResult> => ({
        success: true,
        data: structuredClone(READ_FIXTURES[name]),
      }),
    );
    bodies.set(name, body);
    registerTool({
      definition: {
        name,
        description: `${name} fixture`,
        parameters: { type: "object", properties: {} },
      },
      execute: body,
    });
  }
}

beforeEach(() => {
  process.env.SF_AI_ACTION_POLICY_TEST = "true";
  vi.mocked(isTrustedActorContext).mockReturnValue(true);
  registerReadFixtures();
});

afterEach(() => {
  delete process.env.SF_AI_ACTION_POLICY_TEST;
});

async function run(
  name: string,
  who: TrustedActorContext | undefined,
  params: Record<string, unknown> = {},
): Promise<ToolResult> {
  const tool = getTool(name);
  if (!tool) throw new Error(`fixture tool ${name} is not registered`);
  return tool.execute(params, context(who));
}

describe("fixtures cover the whole read catalogue", () => {
  it("has one fixture per read or external_read tool", () => {
    expect(READ_TOOLS.length).toBe(21);
    expect(Object.keys(READ_FIXTURES).sort()).toEqual([...READ_TOOLS].sort());
  });
});

describe("Owner loses nothing", () => {
  it.each(READ_TOOLS)("%s returns the unmodified body result", async (name) => {
    const result = await run(name, actor("owner"));

    expect(result.success).toBe(true);
    expect(result.data).toEqual(READ_FIXTURES[name]);
    expect(bodies.get(name)).toHaveBeenCalledTimes(1);
  });

  it("Manager keeps every financial field too", async () => {
    for (const name of READ_TOOLS) {
      const result = await run(name, actor("manager"));
      expect(result.success, name).toBe(true);
      expect(result.data, name).toEqual(READ_FIXTURES[name]);
    }
  });
});

describe("Operator preset cannot read profit, revenue, cost or order money", () => {
  const operator = actor("operator");

  it.each(OPERATOR_REFUSED)(
    "%s is refused before the body runs, with a structured result",
    async (name) => {
      const result = await run(name, operator);

      expect(result.success).toBe(false);
      expect(result.refusal).toMatchObject({ code: "AI_TOOL_NOT_PERMITTED" });
      expect(result.refusal?.missingPermissions).toEqual(
        expect.arrayContaining(["analytics.read"]),
      );
      expect(result.data).toBeUndefined();
      expect(bodies.get(name)).not.toHaveBeenCalled();
    },
  );

  it("get_stats names both analytics grants it needs", async () => {
    const result = await run("get_stats", operator);

    expect(result.refusal?.missingPermissions).toEqual([
      "analytics.read",
      "analytics.financials.read",
    ]);
  });

  it("get_product_details still answers but drops cost", async () => {
    const result = await run("get_product_details", operator);

    expect(result.success).toBe(true);
    expect(bodies.get("get_product_details")).toHaveBeenCalledTimes(1);
    expect(result.data).toMatchObject({
      id: "p1",
      name: "Widget",
      sku: "W-1",
      price: 1500,
      stock: 3,
    });
    expect(result.data).not.toHaveProperty("cost");
    expect(JSON.stringify(result)).not.toContain(SECRET_TEXT);
  });

  it("get_order_details keeps the order but drops totals and unit prices", async () => {
    const result = await run("get_order_details", operator);
    const data = result.data as {
      orderNumber: string;
      phone: string;
      items: Array<Record<string, unknown>>;
    };

    expect(result.success).toBe(true);
    expect(data.orderNumber).toBe("ORD-1");
    expect(data.phone).toBe("0555000000");
    expect(data).not.toHaveProperty("totalPrice");
    expect(data).not.toHaveProperty("deliveryCost");
    expect(data.items[0]).toMatchObject({ productName: "Widget", quantity: 2 });
    expect(data.items[0]).not.toHaveProperty("unitPrice");
    expect(data.items[0]).not.toHaveProperty("total");
  });

  it("get_customer_details drops lifetime spend, order totals and risk score", async () => {
    const result = await run("get_customer_details", operator);
    const data = result.data as {
      name: string;
      orderCount: number;
      orders: Array<Record<string, unknown>>;
    };

    expect(data.name).toBe(CONTACT_SECRET);
    expect(data.orderCount).toBe(2);
    expect(data).not.toHaveProperty("totalSpent");
    expect(data).not.toHaveProperty("riskScore");
    expect(data.orders[0]).toMatchObject({ orderNumber: "ORD-1" });
    expect(data.orders[0]).not.toHaveProperty("totalPrice");
  });

  it("no tool the Operator can run leaks any gated figure", async () => {
    for (const name of READ_TOOLS) {
      const result = await run(name, operator);
      if (OPERATOR_REFUSED.includes(name)) continue;
      expect(result.success, name).toBe(true);
      expect(JSON.stringify(result), name).not.toContain(SECRET_TEXT);
    }
  });

  it("the Operator keeps every tool that is not mostly financial", async () => {
    const allowed: string[] = [];
    for (const name of READ_TOOLS) {
      const result = await run(name, operator);
      if (result.success) allowed.push(name);
    }

    expect(allowed.sort()).toEqual(
      READ_TOOLS.filter((name) => !OPERATOR_REFUSED.includes(name)).sort(),
    );
  });
});

describe("a custom member who keeps ai.use but loses grants", () => {
  it("without customers.contact.read, name searches are refused and contact fields are dropped", async () => {
    const limited = actor("operator", [
      "ai.use",
      "orders.read",
      "customers.read",
      "deliveries.read",
    ]);

    const search = await run("search_orders", limited);
    expect(search.refusal?.missingPermissions).toEqual([
      "customers.contact.read",
    ]);
    expect(bodies.get("search_orders")).not.toHaveBeenCalled();

    const recent = await run("list_recent_orders", limited);
    expect(recent.success).toBe(true);
    expect(JSON.stringify(recent)).not.toContain(CONTACT_SECRET);
    expect(JSON.stringify(recent)).not.toContain(SECRET_TEXT);

    const delivery = await run("get_pending_deliveries", limited);
    expect(delivery.success).toBe(true);
    expect(JSON.stringify(delivery)).not.toContain(CONTACT_SECRET);
    expect(JSON.stringify(delivery)).not.toContain(SECRET_TEXT);
  });

  it("holding products.cost.read brings cost back for that actor", async () => {
    const withCost = actor("manager", [
      "ai.use",
      "products.read",
      "products.cost.read",
    ]);

    const result = await run("get_product_details", withCost);

    expect(result.data).toMatchObject({ cost: SECRET });
  });

  it("an actor that is not server-minted is refused (fail closed), not thrown", async () => {
    vi.mocked(isTrustedActorContext).mockReturnValue(false);
    let result: ToolResult;
    try {
      result = await run("search_products", actor("owner"));
    } finally {
      vi.mocked(isTrustedActorContext).mockReturnValue(true);
    }

    expect(result.success).toBe(false);
    expect(result.refusal).toMatchObject({ code: "AI_TOOL_NOT_PERMITTED" });
    expect(bodies.get("search_products")).not.toHaveBeenCalled();
  });
});

describe("context without an actor", () => {
  it("is left to the caller's own gate (MCP resolves scopes before it executes)", async () => {
    const result = await run("get_stats", undefined);

    expect(result.success).toBe(true);
    expect(result.data).toEqual(READ_FIXTURES.get_stats);
  });
});

describe("proposal creation (S06a-03)", () => {
  const validProduct = { name: "Widget", price: 1000, stock: 1 };

  function registerCreateProduct(): ReturnType<typeof vi.fn> {
    const legacy = vi.fn();
    registerTool({
      definition: {
        name: "create_product",
        description: "create_product fixture",
        parameters: { type: "object", properties: {} },
      },
      execute: legacy,
    });
    return legacy;
  }

  it("an Operator asking for a sensitive tool gets a refusal result, not a thrown error", async () => {
    const legacy = registerCreateProduct();
    const createProposal = vi.fn();

    const result = await runWithAiActionProposalRuntime(
      { createProposal },
      () => run("create_product", actor("operator"), validProduct),
    );

    expect(result.success).toBe(false);
    expect(result.refusal).toMatchObject({ code: "AI_PROPOSAL_NOT_PERMITTED" });
    expect(result.refusal?.missingPermissions).toEqual(
      expect.arrayContaining(["products.manage", "products.cost.update"]),
    );
    expect(createProposal).not.toHaveBeenCalled();
    expect(legacy).not.toHaveBeenCalled();
  });

  it("the Owner still gets a proposal for the same call", async () => {
    registerCreateProduct();
    const createProposal = vi.fn(async (toolName: string) => ({
      proposal: {
        id: "aip_owner",
        toolName,
        status: "pending",
        proposalDigestPrefix: "123456789abc",
        summary: { kind: "product_create" },
        expiresAt: "2026-08-03T18:00:00.000Z",
        createdAt: "2026-08-03T17:50:00.000Z",
        executionState: null,
        lastErrorCode: null,
      },
      proposalDigest: "1".repeat(64),
    }));

    const result = await runWithAiActionProposalRuntime(
      { createProposal },
      () => run("create_product", actor("owner"), validProduct),
    );

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      pending_action_proposal: true,
      tool: "create_product",
    });
    expect(createProposal).toHaveBeenCalledTimes(1);
  });

  it("a coded proposal-service error comes back as a refusal result", async () => {
    registerCreateProduct();
    const createProposal = vi.fn(async () => {
      throw new SahelFlowError(
        "Product 'secret-name' was not found",
        "AI_ACTION_TARGET_NOT_FOUND",
        404,
      );
    });

    const result = await runWithAiActionProposalRuntime(
      { createProposal },
      () => run("create_product", actor("owner"), validProduct),
    );

    expect(result.success).toBe(false);
    expect(result.refusal).toEqual({
      code: "AI_PROPOSAL_REJECTED",
      reasonCode: "AI_ACTION_TARGET_NOT_FOUND",
    });
    // The free-text message of the error never becomes model-visible.
    expect(JSON.stringify(result)).not.toContain("secret-name");
  });

  it("an ACTION_FORBIDDEN raised inside the service is reported as not permitted", async () => {
    registerCreateProduct();
    const createProposal = vi.fn(async () => {
      throw new SahelFlowError("forbidden", "ACTION_FORBIDDEN", 403);
    });

    const result = await runWithAiActionProposalRuntime(
      { createProposal },
      () => run("create_product", actor("owner"), validProduct),
    );

    expect(result.refusal).toMatchObject({ code: "AI_PROPOSAL_NOT_PERMITTED" });
  });

  it("malformed arguments keep their coded validation error, whoever asks", async () => {
    registerCreateProduct();
    const createProposal = vi.fn();

    // Parsing runs before the permission pre-check, so the routes still map a
    // bad argument to their 400 and an Operator is not told "not permitted"
    // about a call that was never well formed.
    await expect(
      runWithAiActionProposalRuntime({ createProposal }, () =>
        run("create_product", actor("operator"), { name: 42 }),
      ),
    ).rejects.toMatchObject({ name: "ZodError" });
    expect(createProposal).not.toHaveBeenCalled();
  });

  it("server faults and unexpected errors still propagate as internal errors", async () => {
    registerCreateProduct();

    await expect(
      runWithAiActionProposalRuntime(
        {
          createProposal: async () => {
            throw new SahelFlowError("down", "AI_ACTION_UNAVAILABLE", 503);
          },
        },
        () => run("create_product", actor("owner"), validProduct),
      ),
    ).rejects.toMatchObject({ code: "AI_ACTION_UNAVAILABLE" });

    await expect(
      runWithAiActionProposalRuntime(
        {
          createProposal: async () => {
            throw new TypeError("boom");
          },
        },
        () => run("create_product", actor("owner"), validProduct),
      ),
    ).rejects.toBeInstanceOf(TypeError);
  });

  it("the governed order-confirmation refusal is unchanged for every actor", async () => {
    registerTool({
      definition: {
        name: "update_order_status",
        description: "update_order_status fixture",
        parameters: { type: "object", properties: {} },
      },
      execute: vi.fn(),
    });

    const result = await run("update_order_status", actor("operator"), {
      orderId: "o1",
      status: "confirmed",
    });

    expect(result.success).toBe(false);
    expect(result.refusal).toBeUndefined();
    expect(result.error).toMatch(/gouvernée/);
  });
});

describe("tools without a declared policy stay refused", () => {
  it("registering an unclassified tool still fails with AI_TOOL_POLICY_MISSING", () => {
    let failure: unknown;
    try {
      registerTool({
        definition: {
          name: "undeclared_reporting_tool",
          description: "no policy",
          parameters: { type: "object", properties: {} },
        },
        execute: vi.fn(),
      });
    } catch (error) {
      failure = error;
    }

    expect(failure).toMatchObject({ code: "AI_TOOL_POLICY_MISSING" });
    expect(getTool("undeclared_reporting_tool")).toBeUndefined();
  });
});
