import { describe, expect, it, vi } from "vitest";

import {
  abortedSendShouldFailBubble,
  lookupQueuedSend,
  quoteRejectionMayRetry,
  withoutRejectedQuote,
} from "./use-inbox-outbox";

describe("aborted WhatsApp sends", () => {
  it("does not mark a queued effect as failed", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          ok: true,
          effect: {
            state: "queued",
            effectKey: "wa:effect",
            providerMessageId: null,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const effect = await lookupQueuedSend(
      "22222222-2222-4222-8222-222222222222",
      fetchImpl as unknown as typeof fetch,
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/whatsapp/outbox?messageId=22222222-2222-4222-8222-222222222222",
      { cache: "no-store" },
    );
    expect(abortedSendShouldFailBubble(effect)).toBe(false);
    expect(abortedSendShouldFailBubble({ state: "succeeded" })).toBe(false);
    expect(abortedSendShouldFailBubble(null)).toBe(true);
    expect(abortedSendShouldFailBubble({ state: "dead_letter" })).toBe(true);
  });
});

describe("quote rejection retry", () => {
  it("drops the quote preview and does not resend media that already committed", () => {
    expect(
      quoteRejectionMayRetry(400, { accepted: false }, true),
    ).toBe(true);
    expect(
      quoteRejectionMayRetry(409, { accepted: false }, true),
    ).toBe(true);
    expect(
      quoteRejectionMayRetry(202, { accepted: true, effectKey: "wa:effect" }, true),
    ).toBe(false);
    expect(
      quoteRejectionMayRetry(409, { effectKey: "wa:effect" }, true),
    ).toBe(false);
    expect(quoteRejectionMayRetry(400, {}, false)).toBe(false);
    expect(
      withoutRejectedQuote({
        id: "temp",
        quotedMessageId: "target",
        quoted: { fromMe: false, preview: "hi", messageType: "text" },
      }),
    ).toEqual({ id: "temp", quotedMessageId: null, quoted: null });
  });
});
