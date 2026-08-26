import { describe, expect, it } from "vitest";

import type { InboxMessage } from "@/components/inbox/inbox-workspace-types";
import {
  mergeInboxMessageProjection,
  reconcileInboxProviderMessage,
} from "@/lib/inbox/message-projection";

function message(
  id: string,
  timestamp: number,
  overrides: Partial<InboxMessage> = {},
): InboxMessage {
  return {
    id,
    body: id,
    direction: "inbound",
    timestamp,
    ...overrides,
  };
}

describe("Inbox live message projection reconciliation", () => {
  it("restores persisted history and retains a later live arrival in order", () => {
    const result = mergeInboxMessageProjection(
      [message("history-1", 1), message("history-2", 2)],
      [message("live-3", 3)],
    );

    expect(result.map((entry) => entry.id)).toEqual([
      "history-1",
      "history-2",
      "live-3",
    ]);
  });

  it("keeps the newer live state when the canonical message id already exists", () => {
    const result = mergeInboxMessageProjection(
      [message("outbound-1", 2, { direction: "outbound" })],
      [
        message("outbound-1", 2, {
          direction: "outbound",
          deliveryStatus: "delivered",
        }),
      ],
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.deliveryStatus).toBe("delivered");
  });

  it("reconciles a client id with its provider id through the stable effect key", () => {
    const result = mergeInboxMessageProjection(
      [
        message("client-id", 2, {
          direction: "outbound",
          outboxEffectKey: "effect-1",
          outboxState: "processing",
        }),
      ],
      [
        message("provider-id", 2, {
          direction: "outbound",
          deliveryStatus: "sent",
          outboxEffectKey: "effect-1",
          outboxState: "succeeded",
        }),
      ],
    );

    expect(result).toEqual([
      expect.objectContaining({
        id: "provider-id",
        deliveryStatus: "sent",
        outboxEffectKey: "effect-1",
        outboxState: "succeeded",
      }),
    ]);
  });

  it("does not collapse unrelated optimistic outbound messages", () => {
    const result = mergeInboxMessageProjection(
      [message("history-1", 1)],
      [
        message("temp-2", 2, {
          direction: "outbound",
          deliveryStatus: "sending",
        }),
      ],
    );

    expect(result.map((entry) => entry.id)).toEqual(["history-1", "temp-2"]);
  });

  it("collapses a socket-push copy when the send receipt assigns its provider id", () => {
    const result = reconcileInboxProviderMessage(
      [
        message("temp-2", 2, {
          direction: "outbound",
          deliveryStatus: "sending",
        }),
        message("provider-2", 2, {
          direction: "outbound",
          deliveryStatus: "sent",
        }),
      ],
      "temp-2",
      "provider-2",
      { deliveryStatus: "sent", outboxState: "succeeded" },
    );

    expect(result).toEqual([
      expect.objectContaining({
        id: "provider-2",
        deliveryStatus: "sent",
        outboxState: "succeeded",
      }),
    ]);
  });

  it("updates the provider row when it is already the only visible copy", () => {
    const result = reconcileInboxProviderMessage(
      [message("provider-2", 2, { direction: "outbound" })],
      "temp-2",
      "provider-2",
      { deliveryStatus: "delivered" },
    );

    expect(result).toEqual([
      expect.objectContaining({
        id: "provider-2",
        deliveryStatus: "delivered",
      }),
    ]);
  });
});
