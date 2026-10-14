import { describe, expect, it } from "vitest";

import {
  bubbleDeliveryStatus,
  outboxAllowsResend,
} from "@/components/inbox/inbox-thread-message";

describe("retry follows the outbox, not a late error receipt", () => {
  it("does not offer a resend after the provider already accepted the message", () => {
    const accepted = {
      direction: "outbound" as const,
      outboxEffectKey: "wa:effect",
      outboxState: "succeeded" as const,
      deliveryStatus: "failed" as const,
    };
    expect(outboxAllowsResend(accepted)).toBe(false);
    expect(bubbleDeliveryStatus(accepted)).toBe("sent");
    expect(
      outboxAllowsResend({
        direction: "outbound",
        outboxEffectKey: "wa:effect",
        outboxState: "dead_letter",
      }),
    ).toBe(true);
    expect(
      outboxAllowsResend({
        direction: "outbound",
        outboxEffectKey: "wa:effect",
        outboxState: "ambiguous",
      }),
    ).toBe(true);
  });
});
