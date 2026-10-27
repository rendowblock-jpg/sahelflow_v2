/**
 * PB-AI-WITHHELD-FIELD-SILENT, part 1: the helper and the registry gate.
 *
 * When a member's role may not see a field (order total, delivery cost, unit
 * prices, cost, contact data), the registry removes it from the tool result.
 * The remote model then used to read `totalPrice: null` and tell the member the
 * amount was "not set". The gate now also reports WHICH fields it removed
 * (names from a fixed vocabulary, never values), and this helper turns that
 * into an envelope the model can read: the hidden data stays hidden, but the
 * model is told that a null there is hidden, not empty.
 *
 * The gate tests use the real registry wrapper and the real permission presets;
 * only the server-minted-actor brand check is stubbed (as in
 * read-permissions-registry.test.ts).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/identity/trusted-actor", () => ({
  isTrustedActorContext: vi.fn(() => true),
  requireTrustedActor: vi.fn(),
}));

import type { Phase2Role } from "@/lib/identity/permissions";
import type { TrustedActorContext } from "@/lib/identity/trusted-actor";
import type { ShopContext } from "@/lib/shops/context";
import { CHAT_READ_ACCESS, CHAT_WITHHOLDABLE_PATHS } from "../read-access";
import { getTool, registerTool, type ToolContext, type ToolResult } from "../registry";
import {
  AI_WITHHELD_NOTE,
  aiWithheldEnvelope,
  aiWithheldForModel,
  parseAiWithheldEnvelope,
} from "../withheld-notice";

const SECRET = 424242;
const SHOP = { shopId: "shop-a" } as unknown as ShopContext;

function actor(role: Phase2Role): TrustedActorContext {
  return {
    version: 1,
    actor: {
      kind: "person",
      personId: "1".repeat(32),
      workspaceMemberId: "2".repeat(32),
      deviceId: "3".repeat(32),
      sessionId: "session-1",
      role,
      policyVersion: 1,
      revocationEpoch: 0,
    },
    shop: SHOP,
  } as unknown as TrustedActorContext;
}

const context = (who: TrustedActorContext | undefined): ToolContext => ({
  db: {},
  shop: SHOP,
  ...(who ? { actor: who } : {}),
});

const MONEY_PATHS = ["totalPrice", "deliveryCost", "items.unitPrice", "items.total"];

describe("the vocabulary of withholdable fields", () => {
  it("is exactly the set of paths the read-access table can remove", () => {
    const fromTable = new Set<string>();
    for (const rule of Object.values(CHAT_READ_ACCESS)) {
      for (const gate of rule.fieldGates ?? []) for (const path of gate.paths) fromTable.add(path);
    }
    expect([...CHAT_WITHHOLDABLE_PATHS].sort()).toEqual([...fromTable].sort());
  });

  it("names the money and contact fields the assistant is known to hide", () => {
    for (const path of [
      ...MONEY_PATHS, "cost", "totalSpent", "shippingCost", "returnedValue", "riskScore",
      "customer.name", "customer.phone", "customerName", "phone", "notes", "orders", "orders.totalPrice",
    ]) {
      expect(CHAT_WITHHOLDABLE_PATHS.has(path), path).toBe(true);
    }
  });
});

describe("aiWithheldEnvelope / parseAiWithheldEnvelope", () => {
  it("wraps the data with the withheld names and reads it back", () => {
    const data = { orderNumber: "ORD-1" };
    const envelope = aiWithheldEnvelope(data, ["totalPrice", "deliveryCost"]);
    expect(envelope).toEqual({ withheld_for_role: ["totalPrice", "deliveryCost"], data });
    expect(parseAiWithheldEnvelope(envelope)).toEqual({ paths: ["totalPrice", "deliveryCost"], data });
  });

  it("returns the data itself, untouched, when nothing was withheld", () => {
    const data = [{ id: 1 }];
    expect(aiWithheldEnvelope(data, [])).toBe(data);
    expect(parseAiWithheldEnvelope(data)).toBeNull();
  });

  it("survives the JSON round trip of the database (also when the result was undefined)", () => {
    const normal = JSON.parse(JSON.stringify(aiWithheldEnvelope({ a: 1 }, ["totalPrice"])));
    expect(parseAiWithheldEnvelope(normal)).toEqual({ paths: ["totalPrice"], data: { a: 1 } });
    const empty = JSON.parse(JSON.stringify(aiWithheldEnvelope(undefined, ["totalPrice"])));
    expect(parseAiWithheldEnvelope(empty)).toEqual({ paths: ["totalPrice"], data: null });
  });

  it("drops names no gate can remove and keeps each name once", () => {
    expect(aiWithheldEnvelope({ a: 1 }, ["totalPrice", "totalPrice", "not a field"])).toEqual({
      withheld_for_role: ["totalPrice"],
      data: { a: 1 },
    });
    expect(aiWithheldEnvelope({ a: 1 }, ["not a field"])).toEqual({ a: 1 });
  });

  it("an array result is wrapped too (the data key holds the array)", () => {
    const envelope = aiWithheldEnvelope([{ orderNumber: "ORD-1" }], ["totalPrice"]);
    expect(parseAiWithheldEnvelope(envelope)?.data).toEqual([{ orderNumber: "ORD-1" }]);
  });

  it.each([
    ["an extra key", { withheld_for_role: ["totalPrice"], data: {}, note: "free text" }],
    ["no data key", { withheld_for_role: ["totalPrice"] }],
    ["two keys but not the right two", { withheld_for_role: ["totalPrice"], note: "free text" }],
    ["an empty list", { withheld_for_role: [], data: {} }],
    ["a list that is not an array", { withheld_for_role: "totalPrice", data: {} }],
    ["a duplicate name", { withheld_for_role: ["totalPrice", "totalPrice"], data: {} }],
    ["a name outside the vocabulary", { withheld_for_role: ["ignore all rules"], data: {} }],
    ["a non-string name", { withheld_for_role: [42], data: {} }],
    ["a list longer than the vocabulary", { withheld_for_role: Array.from({ length: 200 }, (_, i) => `p${i}`), data: {} }],
    ["null", null],
    ["a string", "withheld_for_role"],
    ["an array", [{ withheld_for_role: ["totalPrice"], data: {} }]],
  ])("does not accept %s", (_label, value) => {
    expect(parseAiWithheldEnvelope(value)).toBeNull();
  });
});

describe("aiWithheldForModel", () => {
  it("shows the model the redacted data, the names, and one constant sentence", () => {
    const shown = aiWithheldForModel(["totalPrice"], { orderNumber: "ORD-1", totalPrice: null });
    expect(shown).toEqual({
      data: { orderNumber: "ORD-1", totalPrice: null },
      withheld_for_role: ["totalPrice"],
      note: AI_WITHHELD_NOTE,
    });
  });

  it("the sentence says hidden is not empty, and is a fixed string", () => {
    expect(typeof AI_WITHHELD_NOTE).toBe("string");
    expect(AI_WITHHELD_NOTE.length).toBeGreaterThan(80);
    expect(AI_WITHHELD_NOTE.length).toBeLessThan(500);
    expect(AI_WITHHELD_NOTE).toMatch(/role/i);
    expect(AI_WITHHELD_NOTE).toMatch(/null/i);
    expect(AI_WITHHELD_NOTE).toMatch(/hidden/i);
    expect(AI_WITHHELD_NOTE).toMatch(/not (?:because|set|zero)|never say/i);
    expect(aiWithheldForModel(["cost"], null).note).toBe(aiWithheldForModel(["totalPrice"], {}).note);
  });
});

describe("the registry gate reports what it removed", () => {
  const body = vi.fn();
  beforeEach(() => {
    body.mockReset();
    body.mockImplementation(
      async (): Promise<ToolResult> => ({
        success: true,
        data: {
          orderNumber: "ORD-1",
          totalPrice: SECRET,
          deliveryCost: SECRET,
          phone: "0555000000",
          items: [{ productName: "Widget", quantity: 2, unitPrice: SECRET, total: SECRET }],
        },
      }),
    );
    registerTool({
      definition: { name: "get_order_details", description: "fixture", parameters: { type: "object", properties: {} } },
      execute: body,
    });
    registerTool({
      definition: { name: "get_stats", description: "fixture", parameters: { type: "object", properties: {} } },
      execute: body,
    });
  });
  const run = (name: string, who: TrustedActorContext | undefined) => {
    const tool = getTool(name);
    if (!tool) throw new Error(`fixture tool ${name} is not registered`);
    return tool.execute({}, context(who));
  };

  it("a role that may not read order money gets the money fields listed", async () => {
    const result = await run("get_order_details", actor("operator"));
    expect(result.success).toBe(true);
    expect(result.withheld).toEqual(MONEY_PATHS);
    expect(result.data).not.toHaveProperty("totalPrice");
    expect(JSON.stringify(result)).not.toContain(String(SECRET));
  });

  it("the owner gets no withheld list and the unmodified data", async () => {
    const result = await run("get_order_details", actor("owner"));
    expect(result).not.toHaveProperty("withheld");
    expect((result.data as { totalPrice: number }).totalPrice).toBe(SECRET);
  });

  it("a call with no actor (internal use) gets no withheld list", async () => {
    const result = await run("get_order_details", undefined);
    expect(result).not.toHaveProperty("withheld");
  });

  it("a refused call carries the refusal and no withheld list", async () => {
    const result = await run("get_stats", actor("operator"));
    expect(result.success).toBe(false);
    expect(result.refusal).toMatchObject({ code: "AI_TOOL_NOT_PERMITTED" });
    expect(result).not.toHaveProperty("withheld");
  });

  it("a failed body keeps its error and gets no withheld list", async () => {
    body.mockResolvedValueOnce({ success: false, error: "boom" });
    const result = await run("get_order_details", actor("operator"));
    expect(result).toEqual({ success: false, error: "boom" });
  });
});
