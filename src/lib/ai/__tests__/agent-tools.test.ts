/**
 * Agent Tool Registry Tests (T3)
 *
 * The old test was tautological — it defined its own local TOOLS array with
 * only 10 entries and asserted against that, importing nothing from production.
 * It gave false confidence that 30 AI tools were tested.
 *
 * This rewrite imports the REAL tool registry from @/lib/ai/agent and asserts
 * against the actual production tool definitions.
 */
import { describe, it, expect } from "vitest";
import { tools, type AgentTool } from "@/lib/ai/agent";

describe("Agent Tool Registry (real production tools)", () => {
  it("exports exactly 30 tools (matches the advertised tool count)", () => {
    // README + ARCHITECTURE advertise "30 specialized tools". The old tautological
    // test only had 10 fake entries — this verifies the real count.
    expect(tools).toHaveLength(30);
  });

  it("every tool has a unique name", () => {
    const names = tools.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("every tool has a non-empty name", () => {
    for (const tool of tools) {
      expect(tool.name).toBeTruthy();
      expect(typeof tool.name).toBe("string");
    }
  });

  it("every tool has a non-empty description", () => {
    for (const tool of tools) {
      expect(tool.description).toBeTruthy();
      expect(tool.description.length).toBeGreaterThan(10);
    }
  });

  it("every tool has an execute function", () => {
    for (const tool of tools) {
      expect(typeof tool.execute).toBe("function");
    }
  });

  it("tools that accept parameters document them via parameters string or schema", () => {
    // Read-only tools (get_products, get_customers, etc.) take no params and may
    // omit both fields. Tools that DO take params must document them.
    const noParamTools = new Set([
      "get_products",
      "get_low_stock_products",
      "get_customers",
      "get_automations",
      "get_store_info",
    ]);
    for (const tool of tools) {
      if (noParamTools.has(tool.name)) continue;
      const hasParams = typeof tool.parameters === "string" && tool.parameters.length > 0;
      const hasSchema =
        tool.schema !== undefined &&
        typeof tool.schema === "object" &&
        tool.schema !== null;
      expect(hasParams || hasSchema, `Tool "${tool.name}" should document its params`).toBe(true);
    }
  });

  it("read-only no-param tools are a small known set (no accidental undocumented tools)", () => {
    // If a new tool is added without params/schema, add it here OR document its params.
    const noParamTools = tools.filter(
      (t) => !t.parameters && !t.schema,
    ).map((t) => t.name);
    expect(noParamTools.sort()).toEqual([
      "get_automations",
      "get_customers",
      "get_low_stock_products",
      "get_products",
      "get_store_info",
    ]);
  });

  it("includes all 30 expected tool names (canonical list)", () => {
    const expectedNames = [
      "get_dashboard_stats",
      "get_orders",
      "get_products",
      "get_low_stock_products",
      "get_customers",
      "get_revenue_summary",
      "update_order_status",
      "search_all",
      "get_automations",
      "get_order_by_number",
      "create_order",
      "create_product",
      "update_product",
      "update_customer",
      "create_customer",
      "delete_order",
      "get_shipping_rates",
      "update_shipping_rate",
      "toggle_automation",
      "get_customer_orders",
      "get_cod_cashflow",
      "get_store_info",
      "delete_product",
      "create_shipment",
      "list_returns",
      "create_return",
      "update_return_status",
      "get_pnl",
      "list_expenses",
      "add_expense",
    ];
    expect(expectedNames).toHaveLength(30);
    const actualNames = tools.map((t) => t.name);
    for (const name of expectedNames) {
      expect(actualNames).toContain(name);
    }
    // No extra tools beyond the expected list
    expect(actualNames.sort()).toEqual([...expectedNames].sort());
  });

  it("order-related tools include create_order, update_order_status, get_order_by_number, delete_order", () => {
    const names = tools.map((t) => t.name);
    expect(names).toContain("create_order");
    expect(names).toContain("update_order_status");
    expect(names).toContain("get_order_by_number");
    expect(names).toContain("delete_order");
  });

  it("product tools include create_product, update_product, delete_product, get_products", () => {
    const names = tools.map((t) => t.name);
    expect(names).toContain("create_product");
    expect(names).toContain("update_product");
    expect(names).toContain("delete_product");
    expect(names).toContain("get_products");
  });

  it("customer tools include get_customers, create_customer, update_customer, get_customer_orders", () => {
    const names = tools.map((t) => t.name);
    expect(names).toContain("get_customers");
    expect(names).toContain("create_customer");
    expect(names).toContain("update_customer");
    expect(names).toContain("get_customer_orders");
  });

  it("returns tools include list_returns, create_return, update_return_status", () => {
    const names = tools.map((t) => t.name);
    expect(names).toContain("list_returns");
    expect(names).toContain("create_return");
    expect(names).toContain("update_return_status");
  });

  it("delivery tools include create_shipment, get_shipping_rates, update_shipping_rate", () => {
    const names = tools.map((t) => t.name);
    expect(names).toContain("create_shipment");
    expect(names).toContain("get_shipping_rates");
    expect(names).toContain("update_shipping_rate");
  });

  it("finance tools include get_pnl, list_expenses, add_expense, get_cod_cashflow, get_revenue_summary", () => {
    const names = tools.map((t) => t.name);
    expect(names).toContain("get_pnl");
    expect(names).toContain("list_expenses");
    expect(names).toContain("add_expense");
    expect(names).toContain("get_cod_cashflow");
    expect(names).toContain("get_revenue_summary");
  });

  it("automation tools include get_automations, toggle_automation", () => {
    const names = tools.map((t) => t.name);
    expect(names).toContain("get_automations");
    expect(names).toContain("toggle_automation");
  });

  it("miscellaneous tools include get_dashboard_stats, search_all, get_low_stock_products, get_store_info", () => {
    const names = tools.map((t) => t.name);
    expect(names).toContain("get_dashboard_stats");
    expect(names).toContain("search_all");
    expect(names).toContain("get_low_stock_products");
    expect(names).toContain("get_store_info");
  });

  it("can build a name→tool lookup map from the real registry", () => {
    const toolMap = new Map(tools.map((t) => [t.name, t]));
    expect(toolMap.size).toBe(30);
    for (const tool of tools) {
      expect(toolMap.get(tool.name)).toBe(tool);
    }
  });

  it("unknown tool name is not found in the real registry", () => {
    const found = tools.find((t) => t.name === "nonexistent_tool");
    expect(found).toBeUndefined();
  });

  it("create_order tool has a schema or parameters describing customer_name + items", () => {
    const createOrder = tools.find((t) => t.name === "create_order");
    expect(createOrder).toBeDefined();
    // Verify the tool describes the required params somewhere in its definition
    const desc = JSON.stringify(createOrder).toLowerCase();
    expect(desc).toContain("customer_name");
    expect(desc).toContain("items");
  });

  it("update_order_status tool describes order_number + new_status", () => {
    const tool = tools.find((t) => t.name === "update_order_status");
    expect(tool).toBeDefined();
    const desc = JSON.stringify(tool).toLowerCase();
    expect(desc).toContain("order_number");
    expect(desc).toContain("new_status");
  });

  it("AgentTool interface is correctly typed (compile-time check)", () => {
    // If this compiles, the AgentTool type is exported and the tools array matches it
    const _typeCheck: AgentTool[] = tools;
    expect(_typeCheck).toBe(tools);
  });

  it("no tool has an empty schema when schema is provided", () => {
    for (const tool of tools) {
      if (tool.schema !== undefined) {
        expect(Object.keys(tool.schema).length).toBeGreaterThan(0);
      }
    }
  });

  it("all tools that take parameters document them in the parameters string or schema", () => {
    // Tools with no params (like get_dashboard_stats which has optional period) still
    // have a parameters string. Verify none is missing documentation.
    for (const tool of tools) {
      if (tool.parameters) {
        expect(tool.parameters.length).toBeGreaterThan(0);
      }
    }
  });
});
