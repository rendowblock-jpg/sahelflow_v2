import { describe, expect, it } from "vitest";

import { redactPii } from "@/lib/redact-pii";

describe("audit PII redaction", () => {
  it("redacts camel-case and mixed-case sensitive keys", () => {
    const redacted = redactPii({
      customerName: "Fatima Benali",
      deliveryNotes: "Leave beside the private entrance",
      phoneBlindIndex: "blind-index-secret",
      nested: {
        FULLNAME: "Ahmed Benali",
        ApiToken: "provider-token",
      },
      amount: 2500,
    });

    expect(redacted).toEqual({
      customerName: "[REDACTED]",
      deliveryNotes: "[REDACTED]",
      phoneBlindIndex: "[REDACTED]",
      nested: {
        FULLNAME: "[REDACTED]",
        ApiToken: "[REDACTED]",
      },
      amount: 2500,
    });
  });
});
