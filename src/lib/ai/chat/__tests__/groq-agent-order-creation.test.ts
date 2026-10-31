/**
 * PB-AI-GROQ-WRITE-LOOKUPS, mock provider. Every HTTP call is a mocked fetch (nothing leaves the machine);
 * the tools are the REAL registry entries with their bodies spied; the database is a Proxy that throws on
 * any touch. A scripted model that follows the new prompt ends in 2 steps with a recorded create_order
 * PROPOSAL; one that keeps looking the customer up still ends inside the step cap, on a smaller request.
 */
import { appendFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getAllToolDefinitions, getTool, type ToolContext } from "../tools/registry";
import { aiCapabilityGroups } from "../tools/capability-groups";
import { aiChatSystemPromptSlim } from "../neutral/slim-prompt";
import { estimateTokens } from "../neutral/budget";
import { definitionsToNeutral, toolsToOpenAi } from "../neutral/openai-compat";
import { BASE_TOOL_NAMES } from "../neutral/tool-router";
import { createQuotaLedger } from "@/lib/ai/providers/quota-ledger";
import { runGroqAgent, GROQ_MAX_STEPS } from "../groq-agent";

const KEY = "gsk_" + "A1b2C3d4E5f6G7h8I9j0K1l2M3n4";
const NOW = new Date("2026-10-26T10:00:00.000Z");
const QUESTION = "Crée une commande pour Karim Benali : 2 Écouteurs Bluetooth Pro, livraison à Alger Bab Ezzouar, téléphone 0555000101";
const THREE = ["create_order", "search_customers", "search_products"];

let dbTouches = 0;
const CONTEXT = {
  db: new Proxy({}, { get: (_t, prop) => { dbTouches += 1; throw new Error(`db touched: ${String(prop)}`); } }),
  shop: {
    workspaceId: "a".repeat(32), installationId: "b".repeat(32), shopId: "test", shopIncarnationId: "c".repeat(32),
    registryRevision: 1, databaseFileId: "test.db", migrationSetSha256: "0".repeat(64),
  },
} as unknown as ToolContext;

const fetchMock = vi.fn();
const completion = (message: Record<string, unknown>, finish = "stop"): Response =>
  new Response(JSON.stringify({ choices: [{ message, finish_reason: finish }] }), { status: 200, headers: { "content-type": "application/json" } });
const call = (id: string, name: string, args: unknown) => ({ id, type: "function", function: { name, arguments: JSON.stringify(args) } });
const toolStep = (...calls: Array<ReturnType<typeof call>>) => completion({ role: "assistant", content: null, tool_calls: calls }, "tool_calls");
const sent = (i: number) => JSON.parse(fetchMock.mock.calls[i]?.[1]?.body as string) as { messages: Array<{ role: string; content: string }>; tools?: Array<{ function: { name: string } }> };
const rawBody = (i: number) => fetchMock.mock.calls[i]?.[1]?.body as string;
const offered = (i: number) => (sent(i).tools ?? []).map((t) => t.function.name).sort();

const ARGS = { customerId: "cust-karim", items: [{ productId: "prod-ecouteurs", quantity: 2 }], wilaya: "Alger", commune: "Bab Ezzouar", address: "Bab Ezzouar, Alger", phone: "0555000101" };
const orderProposal = () => ({
  pending_action_proposal: true as const,
  tool: "create_order",
  proposal: {
    id: "aip_order", toolName: "create_order", status: "pending", proposalDigestPrefix: "123456789abc",
    summary: { kind: "order_create", customerId: "cust-karim" },
    expiresAt: "2026-10-27T18:00:00.000Z", createdAt: "2026-10-26T17:50:00.000Z", executionState: null, lastErrorCode: null,
  },
  proposalDigest: "1".repeat(64),
});

function run(userMessage: string) {
  return runGroqAgent({ apiKey: KEY, history: [], userMessage, locale: "fr", context: CONTEXT, deps: { ledger: createQuotaLedger(() => NOW), now: () => NOW, retryDelayMs: 0 } });
}

/** What the old router sent for this question (17 schemas, measured on the old code): the base reads + every tool of orders ("commande"), customers ("téléphone") and delivery ("livraison"). */
function oldWireTools() {
  const wanted = new Set<string>(BASE_TOOL_NAMES);
  for (const g of aiCapabilityGroups()) if (["orders", "customers", "delivery"].includes(g.id)) g.tools.forEach((t) => wanted.add(t.name));
  return toolsToOpenAi(definitionsToNeutral(getAllToolDefinitions().filter((d) => wanted.has(d.name))));
}

beforeEach(() => {
  dbTouches = 0;
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.restoreAllMocks());

describe("order creation on the free plan (mock provider)", () => {
  it("a model that follows the new prompt: 2 steps, a recorded create_order proposal, nothing written", async () => {
    const customers = vi.spyOn(getTool("search_customers")!, "execute").mockResolvedValue({ success: true, data: [{ id: "cust-karim", name: "Karim Benali" }] });
    const products = vi.spyOn(getTool("search_products")!, "execute").mockResolvedValue({ success: true, data: [{ id: "prod-ecouteurs", name: "Écouteurs Bluetooth Pro", price: 4500 }] });
    const create = vi.spyOn(getTool("create_order")!, "execute").mockResolvedValue({ success: true, data: orderProposal() });
    fetchMock
      .mockResolvedValueOnce(toolStep(call("c1", "search_customers", { query: "Karim Benali" }), call("c2", "search_products", { query: "Écouteurs Bluetooth Pro" })))
      .mockResolvedValueOnce(toolStep(call("c3", "create_order", ARGS)));

    const result = await run(QUESTION);

    expect(result.stopReason).toBe("proposal");
    expect(result.steps).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.actionProposal?.tool).toBe("create_order");
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]?.[0]).toMatchObject({ customerId: "cust-karim", phone: "0555000101" });
    expect(customers).toHaveBeenCalledTimes(1);
    expect(products).toHaveBeenCalledTimes(1);
    expect(dbTouches).toBe(0);
    for (const i of [0, 1]) expect(offered(i)).toEqual(THREE);
    expect(sent(0).messages[0]?.content).toContain(aiChatSystemPromptSlim("fr").split("\n\n").slice(-1)[0]);
  });

  it("a model that insists on the customer lookup ends inside the step cap, on smaller requests than before", async () => {
    const customers = vi.spyOn(getTool("search_customers")!, "execute").mockResolvedValue({ success: true, data: [{ id: "cust-karim", name: "Karim Benali" }] });
    const details = vi.spyOn(getTool("get_customer_details")!, "execute").mockResolvedValue({ success: true, data: {} });
    const search = vi.spyOn(getTool("search_orders")!, "execute").mockResolvedValue({ success: true, data: [] });
    const create = vi.spyOn(getTool("create_order")!, "execute");
    let n = 0;
    fetchMock.mockImplementation(async () => {
      n += 1;
      if (n === 3) return toolStep(call("d3", "get_customer_details", { customerId: "cust-karim" }));
      if (n === 4) return toolStep(call("d4", "search_orders", { query: "Karim" }));
      return toolStep(call(`d${n}`, "search_customers", { query: "Karim Benali" }));
    });

    const result = await run(QUESTION);

    expect(result.steps).toBeLessThanOrEqual(GROQ_MAX_STEPS);
    expect(["step_cap", "token_budget"]).toContain(result.stopReason);
    expect(customers).toHaveBeenCalled();
    expect(details).not.toHaveBeenCalled(); // not offered: refused by the loop, never executed
    expect(search).not.toHaveBeenCalled();
    expect(result.rejectedCalls.length).toBeGreaterThanOrEqual(2);
    expect(create).not.toHaveBeenCalled();
    expect(dbTouches).toBe(0);

    const old = oldWireTools();
    const lines: string[] = [];
    for (let i = 0; i < fetchMock.mock.calls.length; i += 1) {
      const after = estimateTokens(rawBody(i));
      const before = estimateTokens(JSON.stringify({ ...sent(i), tools: old }));
      lines.push(`LOOP step ${i + 1}: schemas before=${old.length} after=${offered(i).length}; request tokens before=${before} after=${after}`);
      expect(offered(i)).toEqual(THREE);
      expect(after, lines[i]).toBeLessThan(before);
    }
    appendFileSync("/tmp/l78u-w202-numbers.txt", `${lines.join("\n")}\nLOOP estimatedTokens(turn, after)=${result.estimatedTokens}\n`);
    expect(old.length).toBe(17);
  });
});
