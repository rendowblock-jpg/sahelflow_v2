import { describe, expect, it } from "vitest";

import { BUBBLE_FLOW, bubbleSide, messageVisual } from "@/components/inbox/inbox-message-visual";
import { bubbleDeliveryStatus, outboxAllowsResend } from "@/components/inbox/inbox-thread-message";

describe("status -> visual state", () => {
  it.each([
    ["sending", false, "sending", "default", false, false],
    ["sent", false, "sent", "default", false, false],
    ["delivered", false, "delivered", "default", false, false],
    ["read", false, "read", "default", false, false],
    ["failed", true, "failed", "destructive", true, true],
    ["failed", false, "failed", "destructive", true, false],
    [undefined, false, "sent", "default", false, false],
  ] as const)("%s (resend %s)", (status, canResend, state, edge, notSent, retry) => {
    const v = messageVisual({ status, canResend });
    expect(v.state).toBe(state);
    expect(v.edge).toBe(edge);
    expect(v.showNotSent).toBe(notSent);
    expect(v.showRetry).toBe(retry);
    expect(v.shape).toBe(notSent ? "triangle" : null);
  });
  it("goes through the real outbox helpers: a succeeded outbox with a late failed receipt is NOT failed", () => {
    const late = { outboxState: "succeeded", deliveryStatus: "failed" } as const;
    expect(messageVisual({ status: bubbleDeliveryStatus(late), canResend: false }).state).toBe("sent");
    const dead = { direction: "outbound", outboxEffectKey: "k", outboxState: "dead_letter", deliveryStatus: "failed" } as const;
    expect(messageVisual({ status: bubbleDeliveryStatus(dead), canResend: outboxAllowsResend(dead) })).toMatchObject({
      state: "failed",
      showRetry: true,
    });
  });
});

describe("which side each party sits on", () => {
  it("default flow is today's: customer left, seller right, in every locale", () => {
    expect(BUBBLE_FLOW).toBe("wa");
    expect(bubbleSide("wa", true)).toBe("left");
    expect(bubbleSide("wa", false)).toBe("right");
  });
  it("ledger flow flips both", () => {
    expect(bubbleSide("ledger", true)).toBe("right");
    expect(bubbleSide("ledger", false)).toBe("left");
  });
});
