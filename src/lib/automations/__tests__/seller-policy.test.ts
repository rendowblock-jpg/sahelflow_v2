import { describe, expect, it } from "vitest";

import { canonicalizeAutomationMutation } from "../contracts";
import { assertSellerAutomationWritePolicy } from "../seller-policy";

function canonical(input: Parameters<typeof canonicalizeAutomationMutation>[0]) {
  return canonicalizeAutomationMutation(input);
}

describe("seller automation write policy", () => {
  it("accepts a trigger-compatible seller definition", () => {
    const definition = canonical({
      name: "Confirm COD order",
      trigger: "order.created",
      action: "send_whatsapp",
      steps: [
        {
          action: "send_whatsapp",
          onFailure: "stop",
          config: { messageTemplate: "Hi {{customerName}}" },
        },
      ],
      conditions: {
        all: [
          { field: "totalPrice", operator: "greater_than", value: 7000 },
        ],
      },
      isActive: true,
      dryRun: true,
      maxRetries: 2,
      retryDelayMs: 500,
    });

    expect(() => assertSellerAutomationWritePolicy(definition)).not.toThrow();
  });

  it("accepts persisted Bell notifications for destination-free triggers", () => {
    for (const trigger of ["message.received", "stock.low"] as const) {
      const definition = canonical({
        name: `Visible notice for ${trigger}`,
        trigger,
        action: "send_notification",
        steps: [
          {
            action: "send_notification",
            onFailure: "stop",
            config: {
              messageTemplate:
                trigger === "message.received"
                  ? "New message: {{messageText}}"
                  : "Low stock: {{productName}} ({{stockLevel}})",
            },
          },
        ],
        conditions: null,
        isActive: true,
        dryRun: false,
        maxRetries: 2,
        retryDelayMs: 500,
      });

      expect(() => assertSellerAutomationWritePolicy(definition)).not.toThrow();
    }
  });

  it("accepts a durable wait followed by a live order-status re-check and visible alert", () => {
    const definition = canonical({
      name: "Follow up pending order after two hours",
      trigger: "order.created",
      action: "wait",
      steps: [
        {
          action: "wait",
          onFailure: "stop",
          config: { delayMinutes: 120 },
        },
        {
          action: "recheck_order_status",
          onFailure: "stop",
          config: { expectedStatus: "pending" },
        },
        {
          action: "send_notification",
          onFailure: "stop",
          config: { messageTemplate: "Order {{orderNumber}} is still pending" },
        },
      ],
      conditions: null,
      isActive: true,
      dryRun: false,
      maxRetries: 2,
      retryDelayMs: 500,
    });

    expect(() => assertSellerAutomationWritePolicy(definition)).not.toThrow();
  });

  it("rejects live order re-checks from non-order triggers", () => {
    const definition = canonical({
      name: "Invalid stock order recheck",
      trigger: "stock.low",
      action: "recheck_order_status",
      steps: [
        {
          action: "recheck_order_status",
          onFailure: "stop",
          config: { expectedStatus: "pending" },
        },
      ],
      conditions: null,
      isActive: true,
      dryRun: false,
      maxRetries: 2,
      retryDelayMs: 500,
    });

    expect(() => assertSellerAutomationWritePolicy(definition)).toThrowError(
      /not compatible/i,
    );
  });

  it("bounds durable waits to one minute through seven days at the trusted contract", () => {
    for (const delayMinutes of [0, 10_081]) {
      expect(() =>
        canonical({
          name: "Invalid wait",
          trigger: "order.created",
          action: "wait",
          steps: [
            {
              action: "wait",
              onFailure: "stop",
              config: { delayMinutes },
            },
          ],
          conditions: null,
          isActive: true,
          dryRun: false,
          maxRetries: 2,
          retryDelayMs: 500,
        }),
      ).toThrow();
    }
  });

  it("accepts a reachable governed status transition", () => {
    const definition = canonical({
      name: "Ship confirmed orders",
      trigger: "order.confirmed",
      action: "update_status",
      steps: [
        {
          action: "update_status",
          onFailure: "stop",
          config: { targetStatus: "shipped" },
        },
      ],
      conditions: null,
      isActive: true,
      dryRun: true,
      maxRetries: 2,
      retryDelayMs: 500,
    });

    expect(() => assertSellerAutomationWritePolicy(definition)).not.toThrow();
  });

  it("rejects multiple status mutations before they can create a sequence-dependent dead letter", () => {
    const definition = canonical({
      name: "Impossible multi-status flow",
      trigger: "order.confirmed",
      action: "update_status",
      steps: [
        {
          action: "update_status",
          onFailure: "stop",
          config: { targetStatus: "returned" },
        },
        {
          action: "update_status",
          onFailure: "stop",
          config: { targetStatus: "shipped" },
        },
      ],
      conditions: null,
      isActive: true,
      dryRun: false,
      maxRetries: 2,
      retryDelayMs: 500,
    });

    expect(() => assertSellerAutomationWritePolicy(definition)).toThrowError(
      /only one order status mutation/i,
    );
  });

  it("rejects actions whose required payload or state is absent from a seller-ready trigger", () => {
    const definition = canonical({
      name: "Impossible created-order status rule",
      trigger: "order.created",
      action: "update_status",
      steps: [
        {
          action: "update_status",
          onFailure: "stop",
          config: { targetStatus: "shipped" },
        },
      ],
      conditions: null,
      isActive: true,
      dryRun: false,
      maxRetries: 2,
      retryDelayMs: 500,
    });

    expect(() => assertSellerAutomationWritePolicy(definition)).toThrowError(
      /not compatible/i,
    );
  });

  it("rejects order status targets that the canonical state machine cannot reach", () => {
    const definition = canonical({
      name: "Impossible shipped cancellation",
      trigger: "order.shipped",
      action: "update_status",
      steps: [
        {
          action: "update_status",
          onFailure: "stop",
          config: { targetStatus: "cancelled" },
        },
      ],
      conditions: null,
      isActive: true,
      dryRun: false,
      maxRetries: 2,
      retryDelayMs: 500,
    });

    expect(() => assertSellerAutomationWritePolicy(definition)).toThrowError(
      /not reachable/i,
    );
  });

  it("rejects condition fields and values that cannot be evaluated truthfully", () => {
    const invalidField = canonical({
      name: "Impossible order condition",
      trigger: "order.created",
      action: "send_notification",
      steps: [
        {
          action: "send_notification",
          onFailure: "stop",
          config: { messageTemplate: "Order {{orderNumber}}" },
        },
      ],
      conditions: {
        all: [
          { field: "messageText", operator: "contains", value: "hello" },
        ],
      },
      isActive: true,
      dryRun: true,
      maxRetries: 2,
      retryDelayMs: 500,
    });
    const invalidNumber = canonical({
      name: "Invalid numeric condition",
      trigger: "order.created",
      action: "send_notification",
      steps: [
        {
          action: "send_notification",
          onFailure: "stop",
          config: { messageTemplate: "Order {{orderNumber}}" },
        },
      ],
      conditions: {
        all: [
          { field: "totalPrice", operator: "greater_than", value: "invalid" },
        ],
      },
      isActive: true,
      dryRun: true,
      maxRetries: 2,
      retryDelayMs: 500,
    });
    const invalidList = canonical({
      name: "Invalid list condition",
      trigger: "order.created",
      action: "send_notification",
      steps: [
        {
          action: "send_notification",
          onFailure: "stop",
          config: { messageTemplate: "Order {{orderNumber}}" },
        },
      ],
      conditions: {
        all: [{ field: "wilaya", operator: "not_in", value: "Alger" }],
      },
      isActive: true,
      dryRun: true,
      maxRetries: 2,
      retryDelayMs: 500,
    });

    expect(() => assertSellerAutomationWritePolicy(invalidField)).toThrowError(
      /not available/i,
    );
    expect(() => assertSellerAutomationWritePolicy(invalidNumber)).toThrowError(
      /condition value/i,
    );
    expect(() => assertSellerAutomationWritePolicy(invalidList)).toThrowError(
      /condition value/i,
    );
  });

  it("rejects customer-name conditions and templates on order status events that do not carry the name", () => {
    const invalidCondition = canonical({
      name: "Shipped customer-name condition",
      trigger: "order.shipped",
      action: "send_notification",
      steps: [
        {
          action: "send_notification",
          onFailure: "stop",
          config: { messageTemplate: "Order {{orderNumber}} shipped" },
        },
      ],
      conditions: {
        all: [
          { field: "customerName", operator: "contains", value: "Ahmed" },
        ],
      },
      isActive: true,
      dryRun: true,
      maxRetries: 2,
      retryDelayMs: 500,
    });
    const invalidTemplate = canonical({
      name: "Shipped invalid template",
      trigger: "order.shipped",
      action: "send_notification",
      steps: [
        {
          action: "send_notification",
          onFailure: "stop",
          config: { messageTemplate: "Hi {{customerName}}, {{orderNumber}} shipped" },
        },
      ],
      conditions: null,
      isActive: true,
      dryRun: true,
      maxRetries: 2,
      retryDelayMs: 500,
    });

    expect(() => assertSellerAutomationWritePolicy(invalidCondition)).toThrowError(
      /not available/i,
    );
    expect(() => assertSellerAutomationWritePolicy(invalidTemplate)).toThrowError(
      /template variable/i,
    );
  });

  it("rejects every malformed placeholder form the runtime renderer would leave literal", () => {
    for (const messageTemplate of [
      "Hi {{ customerName }}",
      "Hi {{{customerName}}}",
      "Hi {{customerName",
    ]) {
      const definition = canonical({
        name: "Malformed placeholder",
        trigger: "order.created",
        action: "send_notification",
        steps: [
          {
            action: "send_notification",
            onFailure: "stop",
            config: { messageTemplate },
          },
        ],
        conditions: null,
        isActive: true,
        dryRun: true,
        maxRetries: 2,
        retryDelayMs: 500,
      });

      expect(() => assertSellerAutomationWritePolicy(definition)).toThrowError(
        /placeholder syntax/i,
      );
    }
  });
});
