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

  it("rejects actions whose required payload or state is absent from the trigger", () => {
    const definition = canonical({
      name: "Impossible message rule",
      trigger: "message.received",
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

  it("rejects condition fields that do not exist on the selected event", () => {
    const definition = canonical({
      name: "Impossible message condition",
      trigger: "message.received",
      action: "send_whatsapp",
      steps: [
        {
          action: "send_whatsapp",
          onFailure: "stop",
          config: { messageTemplate: "Hi" },
        },
      ],
      conditions: {
        all: [
          { field: "totalPrice", operator: "greater_than", value: 7000 },
        ],
      },
      isActive: true,
      dryRun: false,
      maxRetries: 2,
      retryDelayMs: 500,
    });

    expect(() => assertSellerAutomationWritePolicy(definition)).toThrowError(
      /not available/i,
    );
  });

  it("rejects customer-name conditions on order status events that do not carry the name", () => {
    const definition = canonical({
      name: "Shipped customer-name condition",
      trigger: "order.shipped",
      action: "send_whatsapp",
      steps: [
        {
          action: "send_whatsapp",
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

    expect(() => assertSellerAutomationWritePolicy(definition)).toThrowError(
      /not available/i,
    );
  });

  it("rejects template variables that the selected event cannot provide", () => {
    const definition = canonical({
      name: "Shipped invalid template",
      trigger: "order.shipped",
      action: "send_whatsapp",
      steps: [
        {
          action: "send_whatsapp",
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

    expect(() => assertSellerAutomationWritePolicy(definition)).toThrowError(
      /template variable/i,
    );
  });

  it("rejects placeholder syntax the runtime renderer would otherwise leave literal", () => {
    const definition = canonical({
      name: "Spaced placeholder",
      trigger: "order.created",
      action: "send_whatsapp",
      steps: [
        {
          action: "send_whatsapp",
          onFailure: "stop",
          config: { messageTemplate: "Hi {{ customerName }}" },
        },
      ],
      conditions: null,
      isActive: true,
      dryRun: true,
      maxRetries: 2,
      retryDelayMs: 500,
    });

    expect(() => assertSellerAutomationWritePolicy(definition)).toThrowError(
      /template variable/i,
    );
  });

  it("blocks legacy invisible notification definitions from new seller writes", () => {
    const definition = canonical({
      name: "Legacy notification",
      trigger: "order.created",
      action: "send_notification",
      steps: [
        {
          action: "send_notification",
          onFailure: "stop",
          config: { messageTemplate: "Legacy" },
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
});
