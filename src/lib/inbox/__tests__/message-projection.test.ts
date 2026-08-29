import { describe, expect, it } from "vitest";

import type { InboxMessage } from "@/components/inbox/inbox-workspace-types";
import {
  mergeInboxMessageProjection,
  reconcileInboxProviderMessage,
  toInboxMessageFromWhatsApp,
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
  const progressiveDeliveryStates = [
    "sending",
    "sent",
    "delivered",
    "read",
  ] as const;
  const progressiveDeliveryMatrix = progressiveDeliveryStates.flatMap(
    (persistedStatus, persistedRank) =>
      progressiveDeliveryStates.map((liveStatus, liveRank) => [
        persistedStatus,
        liveStatus,
        progressiveDeliveryStates[Math.max(persistedRank, liveRank)],
      ] as const),
  );

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

  it("keeps a more advanced persisted receipt over a stale live state", () => {
    const result = mergeInboxMessageProjection(
      [
        message("outbound-1", 2, {
          direction: "outbound",
          deliveryStatus: "read",
        }),
      ],
      [
        message("outbound-1", 2, {
          direction: "outbound",
          deliveryStatus: "sent",
          outboxState: "succeeded",
        }),
      ],
    );

    expect(result).toEqual([
      expect.objectContaining({
        id: "outbound-1",
        deliveryStatus: "read",
        outboxState: "succeeded",
      }),
    ]);
  });

  it.each(progressiveDeliveryMatrix)(
    "merges progressive receipt %s with live %s as %s",
    (persistedStatus, liveStatus, expectedStatus) => {
      const result = mergeInboxMessageProjection(
        [
          message("outbound-1", 2, {
            direction: "outbound",
            deliveryStatus: persistedStatus,
          }),
        ],
        [
          message("outbound-1", 2, {
            direction: "outbound",
            deliveryStatus: liveStatus,
          }),
        ],
      );

      expect(result[0]?.deliveryStatus).toBe(expectedStatus);
    },
  );

  it.each(["sending", "sent"] as const)(
    "preserves a live terminal failure over persisted %s",
    (persistedStatus) => {
      const result = mergeInboxMessageProjection(
        [
          message("outbound-1", 2, {
            direction: "outbound",
            deliveryStatus: persistedStatus,
            outboxState: "processing",
          }),
        ],
        [
          message("outbound-1", 2, {
            direction: "outbound",
            deliveryStatus: "failed",
            outboxState: "dead_letter",
          }),
        ],
      );

      expect(result).toEqual([
        expect.objectContaining({
          deliveryStatus: "failed",
          outboxState: "dead_letter",
        }),
      ]);
    },
  );

  it.each(["delivered", "read"] as const)(
    "keeps authoritative persisted %s over a transient live failure",
    (persistedStatus) => {
      const result = mergeInboxMessageProjection(
        [
          message("outbound-1", 2, {
            direction: "outbound",
            deliveryStatus: persistedStatus,
            outboxState: "succeeded",
          }),
        ],
        [
          message("outbound-1", 2, {
            direction: "outbound",
            deliveryStatus: "failed",
            outboxEffectKey: "effect-1",
            outboxState: "ambiguous",
          }),
        ],
      );

      expect(result).toEqual([
        expect.objectContaining({
          deliveryStatus: persistedStatus,
          outboxEffectKey: "effect-1",
          outboxState: "ambiguous",
        }),
      ]);
    },
  );

  it("preserves an ambiguous live failure and its retry authority", () => {
    const result = mergeInboxMessageProjection(
      [
        message("outbound-1", 2, {
          direction: "outbound",
          deliveryStatus: "sent",
          outboxState: "processing",
        }),
      ],
      [
        message("outbound-1", 2, {
          direction: "outbound",
          deliveryStatus: "failed",
          outboxEffectKey: "effect-1",
          outboxState: "ambiguous",
        }),
      ],
    );

    expect(result).toEqual([
      expect.objectContaining({
        deliveryStatus: "failed",
        outboxEffectKey: "effect-1",
        outboxState: "ambiguous",
      }),
    ]);
  });

  it.each([
    ["sending", "queued"],
    ["sending", "processing"],
    ["sending", "retrying"],
    ["sent", "succeeded"],
  ] as const)(
    "allows live %s/%s to supersede a persisted terminal failure",
    (liveStatus, liveOutboxState) => {
      const result = mergeInboxMessageProjection(
        [
          message("outbound-1", 2, {
            direction: "outbound",
            deliveryStatus: "failed",
            outboxEffectKey: "effect-1",
            outboxState: "dead_letter",
          }),
        ],
        [
          message("outbound-1", 2, {
            direction: "outbound",
            deliveryStatus: liveStatus,
            outboxEffectKey: "effect-1",
            outboxState: liveOutboxState,
          }),
        ],
      );

      expect(result).toEqual([
        expect.objectContaining({
          deliveryStatus: liveStatus,
          outboxState: liveOutboxState,
        }),
      ]);
    },
  );

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

  it("keeps a persisted provider receipt while reconciling through an effect key", () => {
    const result = mergeInboxMessageProjection(
      [
        message("provider-id", 2, {
          direction: "outbound",
          deliveryStatus: "delivered",
          outboxEffectKey: "effect-1",
        }),
      ],
      [
        message("client-id", 2, {
          direction: "outbound",
          deliveryStatus: "sent",
          outboxEffectKey: "effect-1",
          outboxState: "succeeded",
        }),
      ],
    );

    expect(result).toEqual([
      expect.objectContaining({
        id: "client-id",
        deliveryStatus: "delivered",
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
          deliveryStatus: "read",
        }),
      ],
      "temp-2",
      "provider-2",
      { deliveryStatus: "sent", outboxState: "succeeded" },
    );

    expect(result).toEqual([
      expect.objectContaining({
        id: "provider-2",
        deliveryStatus: "read",
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

  it("applies terminal failure after projection replaced the local id", () => {
    const result = reconcileInboxProviderMessage(
      [
        message("provider-2", 2, {
          direction: "outbound",
          deliveryStatus: "sent",
          outboxEffectKey: "effect-2",
          outboxState: "processing",
        }),
      ],
      "temp-2",
      "provider-2",
      {
        deliveryStatus: "failed",
        outboxEffectKey: "effect-2",
        outboxState: "dead_letter",
      },
    );

    expect(result).toEqual([
      expect.objectContaining({
        id: "provider-2",
        deliveryStatus: "failed",
        outboxEffectKey: "effect-2",
        outboxState: "dead_letter",
      }),
    ]);
  });

  it("finds a projected terminal row by effect key without a provider receipt id", () => {
    const result = reconcileInboxProviderMessage(
      [
        message("provider-2", 2, {
          direction: "outbound",
          deliveryStatus: "sending",
          outboxEffectKey: "effect-2",
          outboxState: "processing",
        }),
      ],
      "temp-2",
      null,
      {
        deliveryStatus: "failed",
        outboxEffectKey: "effect-2",
        outboxState: "ambiguous",
      },
    );

    expect(result).toEqual([
      expect.objectContaining({
        id: "provider-2",
        deliveryStatus: "failed",
        outboxEffectKey: "effect-2",
        outboxState: "ambiguous",
      }),
    ]);
  });

  it("applies an active monitor state by effect key after id replacement", () => {
    const result = reconcileInboxProviderMessage(
      [
        message("provider-2", 2, {
          direction: "outbound",
          deliveryStatus: "sending",
          outboxEffectKey: "effect-2",
          outboxState: "queued",
        }),
      ],
      "temp-2",
      null,
      {
        outboxEffectKey: "effect-2",
        outboxState: "retrying",
      },
    );

    expect(result).toEqual([
      expect.objectContaining({
        id: "provider-2",
        deliveryStatus: "sending",
        outboxEffectKey: "effect-2",
        outboxState: "retrying",
      }),
    ]);
  });

  it("keeps a durable read receipt when a terminal monitor result arrives", () => {
    const result = reconcileInboxProviderMessage(
      [
        message("provider-2", 2, {
          direction: "outbound",
          deliveryStatus: "read",
          outboxEffectKey: "effect-2",
          outboxState: "succeeded",
        }),
      ],
      "temp-2",
      "provider-2",
      {
        deliveryStatus: "failed",
        outboxEffectKey: "effect-2",
        outboxState: "ambiguous",
      },
    );

    expect(result).toEqual([
      expect.objectContaining({
        id: "provider-2",
        deliveryStatus: "read",
        outboxEffectKey: "effect-2",
        outboxState: "ambiguous",
      }),
    ]);
  });
});

describe("WhatsApp history projection fidelity (#317 B1/B2)", () => {
  it("preserves the quoted-reply context so quote chips survive reloads", () => {
    const projected = toInboxMessageFromWhatsApp({
      key: { remoteJid: "213555010203@s.whatsapp.net", fromMe: true, id: "wam-1" },
      message: { conversation: "order confirmed" },
      messageTimestamp: 1_700_000_000,
      deliveryStatus: "delivered",
      effectKey: "effect-1",
      effectState: "succeeded",
      messageType: "text",
      quotedMessageId: "msg-target-1",
      quoted: {
        fromMe: false,
        preview: "please confirm my order",
        messageType: "text",
      },
    });

    expect(projected).toMatchObject({
      id: "wam-1",
      body: "order confirmed",
      direction: "outbound",
      timestamp: 1_700_000_000_000,
      deliveryStatus: "delivered",
      outboxEffectKey: "effect-1",
      outboxState: "succeeded",
      quotedMessageId: "msg-target-1",
      quoted: {
        fromMe: false,
        preview: "please confirm my order",
        messageType: "text",
      },
    });
  });

  it("keeps an explicit null quoted context as null, and absent fields absent", () => {
    const explicitNull = toInboxMessageFromWhatsApp({
      key: { remoteJid: "213555010203@s.whatsapp.net", fromMe: false, id: "wam-2" },
      message: { conversation: "hello" },
      messageTimestamp: 1_700_000_001,
      quotedMessageId: null,
      quoted: null,
    });
    expect(explicitNull.quotedMessageId).toBeNull();
    expect(explicitNull.quoted).toBeNull();

    const absent = toInboxMessageFromWhatsApp({
      key: { remoteJid: "213555010203@s.whatsapp.net", fromMe: false, id: "wam-3" },
      message: { conversation: "hi" },
      messageTimestamp: 1_700_000_002,
    });
    expect(absent.quotedMessageId).toBeUndefined();
    expect(absent.quoted).toBeUndefined();
    expect(absent.direction).toBe("inbound");
  });

  it("projects bodies through messageText including media captions", () => {
    const captioned = toInboxMessageFromWhatsApp({
      key: { remoteJid: "213555010203@s.whatsapp.net", fromMe: false, id: "wam-4" },
      message: { imageMessage: { caption: "catalog photo" } },
      messageTimestamp: 1_700_000_003,
    });
    expect(captioned.body).toBe("catalog photo");
  });
});
