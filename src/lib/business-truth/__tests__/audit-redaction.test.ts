import { describe, expect, it } from "vitest";

import { redactPii } from "@/lib/redact-pii";

describe("audit PII redaction", () => {
  it("redacts mixed-case sensitive keys while preserving non-sensitive dates", () => {
    const createdAt = new Date("2026-07-28T05:00:00.000Z");
    const updatedAt = new Date("2026-07-28T05:05:00.000Z");
    const redacted = redactPii({
      customerName: "Fatima Benali",
      deliveryNotes: "Leave beside the private entrance",
      phoneBlindIndex: "blind-index-secret",
      createdAt,
      nested: {
        FULLNAME: "Ahmed Benali",
        ApiToken: "provider-token",
        updatedAt,
      },
      amount: 2500,
    });

    expect(redacted).toEqual({
      customerName: "[REDACTED]",
      deliveryNotes: "[REDACTED]",
      phoneBlindIndex: "[REDACTED]",
      createdAt,
      nested: {
        FULLNAME: "[REDACTED]",
        ApiToken: "[REDACTED]",
        updatedAt,
      },
      amount: 2500,
    });
    expect(redacted.createdAt).toBeInstanceOf(Date);
    expect(redacted.createdAt).not.toBe(createdAt);
    expect(redacted.createdAt.toISOString()).toBe(createdAt.toISOString());
    expect(redacted.nested.updatedAt).toBeInstanceOf(Date);
    expect(redacted.nested.updatedAt).not.toBe(updatedAt);
    expect(redacted.nested.updatedAt.toISOString()).toBe(updatedAt.toISOString());
  });
});
