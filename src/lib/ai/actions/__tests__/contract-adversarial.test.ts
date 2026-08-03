import { describe, expect, it } from "vitest";

import { parseSensitiveAiToolArgs } from "../contracts";
import { redactPii } from "@/lib/redact-pii";

describe("proposal-bound AI argument contracts", () => {
  it("rejects governed order confirmation before proposal persistence", () => {
    expect(() =>
      parseSensitiveAiToolArgs("update_order_status", {
        orderId: "order-1",
        status: "confirmed",
      }),
    ).toThrow();
  });

  it("normalizes valid Algerian phones and rejects malformed values", () => {
    expect(
      parseSensitiveAiToolArgs("create_customer", {
        name: "Client",
        phone: "+213555123456",
      }),
    ).toMatchObject({ phone: "0555123456" });

    expect(() =>
      parseSensitiveAiToolArgs("create_customer", {
        name: "Client",
        phone: "12345",
      }),
    ).toThrow();
  });

  it("redacts the exact proposal digest from persisted tool history", () => {
    const redacted = redactPii({
      result: {
        pending_action_proposal: true,
        proposalDigest: "1".repeat(64),
      },
    }) as { result: { proposalDigest: string } };

    expect(redacted.result.proposalDigest).toBe("[REDACTED]");
  });
});
