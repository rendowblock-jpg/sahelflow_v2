import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runWithAiActionProposalRuntime } from "@/lib/ai/actions/proposal-runtime";
import "@/lib/ai/chat/tools/advanced-tools";
import "@/lib/ai/chat/tools/core-tools";
import "@/lib/ai/chat/tools/extended-tools";
import { getTool } from "@/lib/ai/chat/tools/registry";
import { TEST_SHOP_CONTEXT } from "@/lib/data/__tests__/helpers";

// The production registry must behave the same under Vitest as in the
// packaged app: a mutating tool call only ever creates a proposal. These
// tests run with NODE_ENV=test and VITEST=true on purpose.

const root = process.cwd();

const MUTATING_CALLS: Array<[string, Record<string, unknown>]> = [
  [
    "create_order",
    {
      customerId: "c1",
      items: [{ productId: "p1", quantity: 1 }],
      wilaya: "Alger",
      commune: "Bab El Oued",
      address: "1 rue test",
      phone: "0550123456",
    },
  ],
  ["update_order_status", { orderId: "o1", status: "shipped" }],
  ["update_product_stock", { productId: "p1", newStock: 5 }],
  ["cancel_order", { orderNumber: "ORD-1" }],
  ["create_product", { name: "Thé", price: 100 }],
  ["update_product_price", { productId: "p1", newPrice: 100 }],
  ["create_customer", { name: "Amine", phone: "0550123456" }],
  ["update_customer_notes", { customerId: "c1", notes: "note" }],
];

function untouchableDb() {
  const touched: string[] = [];
  const db = new Proxy(
    {},
    {
      get(_target, property) {
        touched.push(String(property));
        throw new Error(`database touched: ${String(property)}`);
      },
    },
  );
  return { db, touched };
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "__tests__") continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("VITEST", "true");
  delete process.env.SF_AI_ACTION_POLICY_TEST;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("AI tool registry under NODE_ENV=test and VITEST=true", () => {
  it.each(MUTATING_CALLS)(
    "%s without a proposal runtime is refused and never runs its body",
    async (name, args) => {
      const { db, touched } = untouchableDb();
      await expect(
        getTool(name)!.execute(args, { db, shop: TEST_SHOP_CONTEXT }),
      ).rejects.toMatchObject({ code: "AI_ACTION_PROPOSAL_RUNTIME_REQUIRED" });
      expect(touched).toEqual([]);
    },
  );

  it.each(MUTATING_CALLS)(
    "%s only creates a proposal when a runtime exists",
    async (name, args) => {
      const { db, touched } = untouchableDb();
      const createProposal = vi.fn(async () => ({
        proposal: { id: "proposal-1" },
        proposalDigest: "digest-1",
      }));
      const result = await runWithAiActionProposalRuntime(
        { createProposal } as never,
        () => getTool(name)!.execute(args, { db, shop: TEST_SHOP_CONTEXT }),
      );
      expect(createProposal).toHaveBeenCalledTimes(1);
      expect(createProposal.mock.calls[0]?.[0]).toBe(name);
      expect(result).toMatchObject({
        success: true,
        data: { pending_action_proposal: true, tool: name },
      });
      expect(touched).toEqual([]);
    },
  );

  it("a blocked provider action does not run its body", async () => {
    const { db, touched } = untouchableDb();
    await expect(
      getTool("assign_order_to_delivery")!.execute(
        { orderId: "o1", provider: "yalidine" },
        { db, shop: TEST_SHOP_CONTEXT },
      ),
    ).rejects.toMatchObject({ code: "AI_PROVIDER_ACTION_NOT_CONVERGED" });
    expect(touched).toEqual([]);
  });
});

describe("production sources carry no test-mode switch", () => {
  it.each([
    "src/lib/ai/chat/tools/registry.ts",
    "src/lib/ai/actions/execution-authority.ts",
  ])("%s does not read the environment", (file) => {
    const source = readFileSync(path.join(root, file), "utf8");
    expect(source).not.toMatch(/process\.env|VITEST|NODE_ENV/);
  });

  it("execution-authority exports no wildcard test authority", async () => {
    const mod = (await import(
      "@/lib/ai/actions/execution-authority"
    )) as Record<string, unknown>;
    expect(mod.testAiActionExecutionAuthority).toBeUndefined();
  });

  it("no production file imports the test-only tool bodies", () => {
    const offenders = walk(path.join(root, "src")).filter((file) =>
      /from\s+["'][^"']*legacy-tool-bodies/.test(readFileSync(file, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
