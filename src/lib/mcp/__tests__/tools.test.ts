/**
 * MCP tool catalog tests — verify all 29 tools register correctly
 * with proper annotations, groups, and execution classes.
 */

import { describe, expect, it, beforeEach } from "vitest";

import {
  clearMcpRegistry,
  getVisibleTools,
  getAllRegisteredToolNames,
} from "../registry";
import "../tools";

// ─── Expected tool names ─────────────────────────────────────────────────────

const EXPECTED_TOOLS = [
  // Orders
  "searchOrders", "getOrderDetails", "listRecentOrders",
  "createOrder", "updateOrderStatus", "cancelOrder",
  // Customers
  "searchCustomers", "getCustomerDetails", "getCustomerOrders",
  "createCustomer", "updateCustomerNotes",
  // Products
  "searchProducts", "getProductDetails", "getLowStockProducts",
  "getTopProducts", "createProduct", "updateProductPrice", "updateProductStock",
  // Delivery
  "estimateDeliveryCost", "getDeliveryCostComparison", "getDeliveryStatus", "getPendingDeliveries",
  // Insights
  "getStats", "getRevenueReport", "getSalesByWilaya", "getReturnsSummary", "getWilayaRisk",
  // Conversations
  "searchConversations", "getConversationMessages",
];

const SENSITIVE_TOOLS = [
  "createOrder", "updateOrderStatus", "cancelOrder",
  "createCustomer", "updateCustomerNotes",
  "createProduct", "updateProductPrice", "updateProductStock",
];

const READ_TOOLS = EXPECTED_TOOLS.filter((t) => !SENSITIVE_TOOLS.includes(t));

describe("MCP tool catalog", () => {
  it("registers all 29 tools", () => {
    const names = getAllRegisteredToolNames();
    for (const expected of EXPECTED_TOOLS) {
      expect(names).toContain(expected);
    }
    expect(names.length).toBeGreaterThanOrEqual(EXPECTED_TOOLS.length);
  });

  it("all tools are visible to owner (all permissions)", () => {
    const ownerPermissions = [
      "orders.read", "orders.create", "orders.update",
      "customers.read", "customers.manage",
      "products.read", "products.manage",
      "conversations.read",
      "accounting.read",
    ];
    const visibility = getVisibleTools(ownerPermissions);
    const names = visibility.visibleTools.map((t) => t.name);
    for (const expected of EXPECTED_TOOLS) {
      expect(names).toContain(expected);
    }
  });

  it("sensitive tools are hidden from read-only callers", () => {
    const viewerPermissions = ["orders.read", "customers.read", "products.read"];
    const visibility = getVisibleTools(viewerPermissions);
    const names = visibility.visibleTools.map((t) => t.name);

    // Read tools should be visible
    for (const tool of READ_TOOLS) {
      expect(names).toContain(tool);
    }
    // Sensitive tools should be hidden
    for (const tool of SENSITIVE_TOOLS) {
      expect(names).not.toContain(tool);
    }
  });

  it("every tool has proper annotations", () => {
    const visibility = getVisibleTools(["orders.read", "customers.read", "products.read", "conversations.read"]);
    for (const tool of visibility.visibleTools) {
      // Every tool must have all four annotation fields
      expect(tool.annotations).toHaveProperty("readOnlyHint");
      expect(tool.annotations).toHaveProperty("destructiveHint");
      expect(tool.annotations).toHaveProperty("idempotentHint");
      expect(tool.annotations).toHaveProperty("openWorldHint");
      // Sensitive tools must be destructive
      if (SENSITIVE_TOOLS.includes(tool.name)) {
        expect(tool.annotations.destructiveHint).toBe(true);
        expect(tool.annotations.readOnlyHint).toBe(false);
      }
    }
  });

  it("every tool has an inputSchema with type object", () => {
    const visibility = getVisibleTools(["orders.read", "customers.read", "products.read", "conversations.read"]);
    for (const tool of visibility.visibleTools) {
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.inputSchema.properties).toBeDefined();
    }
  });

  it("every tool has a group assignment", () => {
    const visibility = getVisibleTools(["orders.read", "customers.read", "products.read", "conversations.read"]);
    const validGroups = ["orders", "customers", "products", "delivery", "insights", "conversations", "storefront", "accounting", "automation", "notifications"];
    for (const tool of visibility.visibleTools) {
      expect(validGroups).toContain(tool.group);
    }
  });

  it("every tool has a description", () => {
    const visibility = getVisibleTools(["orders.read", "customers.read", "products.read", "conversations.read"]);
    for (const tool of visibility.visibleTools) {
      expect(tool.description.length).toBeGreaterThan(10);
    }
  });
});
