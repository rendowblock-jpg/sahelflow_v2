import { describe, expect, it } from "vitest";

import {
  actionAllowedForTrigger,
  getSellerStatusTargets,
  getSellerTriggerSpec,
  normalizeConditionValueForSubmit,
  sellerReadyTriggers,
  unsupportedTemplateVariablesForTrigger,
} from "../catalog";

describe("seller automation catalog", () => {
  it("exposes only actions whose required payload and state are safe on the selected event", () => {
    expect(actionAllowedForTrigger("order.created", "send_whatsapp")).toBe(true);
    expect(actionAllowedForTrigger("order.created", "update_status")).toBe(false);
    expect(actionAllowedForTrigger("order.created", "tag_customer")).toBe(true);

    expect(actionAllowedForTrigger("order.confirmed", "update_status")).toBe(true);
    expect(actionAllowedForTrigger("order.shipped", "update_status")).toBe(true);
    expect(actionAllowedForTrigger("order.delivered", "update_status")).toBe(true);
    expect(actionAllowedForTrigger("order.returned", "update_status")).toBe(false);
    expect(actionAllowedForTrigger("order.refused", "update_status")).toBe(false);
    expect(actionAllowedForTrigger("order.cancelled", "update_status")).toBe(false);

    expect(actionAllowedForTrigger("message.received", "send_whatsapp")).toBe(true);
    expect(actionAllowedForTrigger("message.received", "update_status")).toBe(false);
    expect(actionAllowedForTrigger("message.received", "tag_customer")).toBe(false);

    expect(actionAllowedForTrigger("stock.low", "send_whatsapp")).toBe(false);
    expect(actionAllowedForTrigger("stock.low", "update_status")).toBe(false);
  });

  it("derives seller status targets from the canonical order transition state machine", () => {
    expect(getSellerStatusTargets("order.created")).toEqual([]);
    expect(getSellerStatusTargets("order.confirmed")).toEqual([
      "shipped",
      "returned",
      "refused",
      "cancelled",
    ]);
    expect(getSellerStatusTargets("order.shipped")).toEqual([
      "delivered",
      "returned",
      "refused",
    ]);
    expect(getSellerStatusTargets("order.delivered")).toEqual(["returned"]);
    expect(getSellerStatusTargets("order.returned")).toEqual([]);
    expect(getSellerStatusTargets("order.refused")).toEqual([]);
    expect(getSellerStatusTargets("order.cancelled")).toEqual([]);
  });

  it("keeps stock-low readable without offering the legacy invisible notification as a new seller flow", () => {
    const stockLow = getSellerTriggerSpec("stock.low");
    expect(stockLow).toBeDefined();
    expect(stockLow?.sellerReady).toBe(false);
    expect(stockLow?.actions).toEqual([]);
    expect(sellerReadyTriggers().some((trigger) => trigger.value === "stock.low")).toBe(
      false,
    );
  });

  it("limits condition fields and variables to data actually carried by each event", () => {
    const orderCreated = getSellerTriggerSpec("order.created");
    const orderShipped = getSellerTriggerSpec("order.shipped");
    const orderFields = orderCreated?.fields.map((field) => field.value);
    const shippedFields = orderShipped?.fields.map((field) => field.value);
    const messageFields = getSellerTriggerSpec("message.received")?.fields.map(
      (field) => field.value,
    );
    const stockFields = getSellerTriggerSpec("stock.low")?.fields.map(
      (field) => field.value,
    );

    expect(orderFields).toContain("totalPrice");
    expect(orderFields).toContain("customerName");
    expect(orderCreated?.variables).toContain("customerName");
    expect(orderFields).not.toContain("messageText");

    expect(shippedFields).toContain("customerPhone");
    expect(shippedFields).not.toContain("customerName");
    expect(orderShipped?.variables).not.toContain("customerName");

    expect(messageFields).toContain("messageText");
    expect(messageFields).not.toContain("totalPrice");
    expect(stockFields).toEqual([
      "productName",
      "stockLevel",
      "lowStockThreshold",
    ]);
  });

  it("identifies unsupported variables and all malformed placeholder delimiters", () => {
    expect(
      unsupportedTemplateVariablesForTrigger(
        "order.shipped",
        "Hi {{customerName}}, order {{orderNumber}} shipped",
      ),
    ).toEqual(["customerName"]);
    expect(
      unsupportedTemplateVariablesForTrigger(
        "message.received",
        "Hi {{customerName}}, thanks for your message",
      ),
    ).toEqual([]);
    expect(
      unsupportedTemplateVariablesForTrigger(
        "message.received",
        "Hi {{ customerName }}, thanks for your message",
      ),
    ).toEqual(["…"]);
    expect(
      unsupportedTemplateVariablesForTrigger(
        "message.received",
        "Hi {{{customerName}}}",
      ),
    ).toEqual(["…"]);
    expect(
      unsupportedTemplateVariablesForTrigger(
        "message.received",
        "Hi {{customerName",
      ),
    ).toEqual(["…"]);
  });

  it("normalizes in/not_in editor text into the arrays the condition engine expects", () => {
    expect(normalizeConditionValueForSubmit("Alger, Oran", "in", "text")).toEqual([
      "Alger",
      "Oran",
    ]);
    expect(
      normalizeConditionValueForSubmit("5000, 7500", "not_in", "number"),
    ).toEqual([5000, 7500]);
    expect(normalizeConditionValueForSubmit("7000", "greater_than", "number")).toBe(
      7000,
    );
    expect(normalizeConditionValueForSubmit("ignored", "is_empty", "text")).toBeNull();
  });
});
