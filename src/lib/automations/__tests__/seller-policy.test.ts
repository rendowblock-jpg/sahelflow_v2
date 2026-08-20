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

  it("rejects actions whose required payload is absent from the trigger", () => {
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
