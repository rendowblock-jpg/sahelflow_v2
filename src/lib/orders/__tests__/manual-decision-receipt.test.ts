import { describe, expect, it, vi } from "vitest";

import { resolveManualDecisionReceipt } from "../manual-decision-receipt";

describe("manual decision receipt", () => {
  it("reuses the original key and version without a second preflight", async () => {
    const cache = new Map();
    const preflight = vi
      .fn()
      .mockResolvedValueOnce({
        idempotencyKey: "decision-key-1",
        expectedVersion: 1,
      })
      .mockResolvedValueOnce({
        idempotencyKey: "decision-key-2",
        expectedVersion: 2,
      });

    const first = await resolveManualDecisionReceipt(
      cache,
      "confirmed",
      preflight,
    );
    const retryAfterLostResponse = await resolveManualDecisionReceipt(
      cache,
      "confirmed",
      preflight,
    );

    expect(retryAfterLostResponse).toEqual(first);
    expect(retryAfterLostResponse).toEqual({
      idempotencyKey: "decision-key-1",
      expectedVersion: 1,
    });
    expect(preflight).toHaveBeenCalledTimes(1);
  });

  it("keeps confirm and reject receipts isolated", async () => {
    const cache = new Map();
    const confirm = await resolveManualDecisionReceipt(
      cache,
      "confirmed",
      async () => ({
        idempotencyKey: "confirm-key",
        expectedVersion: 1,
      }),
    );
    const reject = await resolveManualDecisionReceipt(
      cache,
      "cancelled",
      async () => ({
        idempotencyKey: "reject-key",
        expectedVersion: 1,
      }),
    );

    expect(confirm.idempotencyKey).not.toBe(reject.idempotencyKey);
    expect(cache.size).toBe(2);
  });
});
