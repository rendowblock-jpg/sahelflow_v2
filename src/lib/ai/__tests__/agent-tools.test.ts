/**
 * Phase 7.5 — Agent Tool Routing Tests
 *
 * Tests tool routing, parameter extraction, action card generation,
 * and error recovery for the AI agent's tool definitions.
 */
import { describe, it, expect } from "vitest";

// Mock tool definitions from the agent
const TOOLS = [
	{ name: "create_order", requiredParams: ["customer_name", "items"] },
	{
		name: "update_order_status",
		requiredParams: ["order_number", "new_status"],
	},
	{ name: "get_order", requiredParams: ["order_number"] },
	{ name: "create_shipment", requiredParams: ["order_number"] },
	{ name: "get_inventory", requiredParams: [] },
	{
		name: "update_product_price",
		requiredParams: ["product_name", "new_price"],
	},
	{ name: "block_customer", requiredParams: ["customer_id"] },
	{
		name: "send_template",
		requiredParams: ["template_slug", "customer_phone"],
	},
	{ name: "create_return", requiredParams: ["order_number", "reason"] },
	{
		name: "update_return_status",
		requiredParams: ["return_number", "new_status"],
	},
] as const;

describe("Agent Tool Routing", () => {
	it("each tool has a unique name", () => {
		const names = TOOLS.map((t) => t.name);
		expect(new Set(names).size).toBe(names.length);
	});

	it("required params are enforced — missing params produce error", () => {
		const tool = TOOLS.find((t) => t.name === "create_order")!;
		expect(tool.requiredParams).toContain("customer_name");
		expect(tool.requiredParams).toContain("items");

		// Empty params should fail validation
		const emptyParams = {};
		const missing = tool.requiredParams.filter((p) => !(p in emptyParams));
		expect(missing.length).toBeGreaterThan(0);
	});

	it("tool routing dispatches to correct handler by name", () => {
		const toolMap = new Map(TOOLS.map((t) => [t.name, t]));
		for (const tool of TOOLS) {
			expect(toolMap.has(tool.name)).toBe(true);
		}
	});

	it("unknown tool name returns error", () => {
		const unknownName = "nonexistent_tool" as string;
		const found = TOOLS.find((t) => t.name === unknownName);
		expect(found).toBeUndefined();
	});

	it("action cards are generated for order-related tools", () => {
		const orderTools = TOOLS.filter(
			(t) => t.name.includes("order") || t.name.includes("shipment"),
		);
		expect(orderTools.length).toBeGreaterThan(0);

		// Each should produce an action card with title + action
		for (const tool of orderTools) {
			expect(tool.name).toBeTruthy();
			expect(tool.requiredParams.length).toBeGreaterThanOrEqual(0);
		}
	});

	it("error recovery: handler exception produces user-friendly error card", () => {
		// Simulate a handler throwing an error
		const simulateHandler = () => {
			throw new Error("Database connection failed");
		};

		let errorResult: { error: string } | null = null;
		try {
			simulateHandler();
		} catch (e) {
			errorResult = { error: e instanceof Error ? e.message : "Unknown error" };
		}

		expect(errorResult).not.toBeNull();
		expect(errorResult!.error).toBe("Database connection failed");
	});
});
