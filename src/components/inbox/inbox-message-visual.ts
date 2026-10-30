import type { ChipShape } from "@/components/inbox/inbox-queue-model";

/**
 * Which side each party sits on. "wa" is what the thread does today: customer on the
 * physical left, seller on the physical right, in every locale (the thread pins dir="ltr").
 * "ledger" flips both. Changing the Founder's choice is this one constant.
 */
export type BubbleFlow = "wa" | "ledger";
export const BUBBLE_FLOW: BubbleFlow = "wa";

export function bubbleSide(flow: BubbleFlow, inbound: boolean): "left" | "right" {
  const customerOnLeft = flow === "wa";
  return inbound === customerOnLeft ? "left" : "right";
}

export type MessageDeliveryState = "sending" | "sent" | "delivered" | "read" | "failed";

export interface MessageVisual {
  state: MessageDeliveryState;
  edge: "default" | "destructive";
  shape: ChipShape | null;
  showNotSent: boolean;
  showRetry: boolean;
}

/** Delivery status (after bubbleDeliveryStatus) -> what the slip shows. A failed send always says so. */
export function messageVisual(input: {
  status: MessageDeliveryState | undefined;
  canResend: boolean;
}): MessageVisual {
  const state = input.status ?? "sent";
  const failed = state === "failed";
  return {
    state,
    edge: failed ? "destructive" : "default",
    shape: failed ? "triangle" : null,
    showNotSent: failed,
    showRetry: failed && input.canResend,
  };
}
