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

  it("redacts provider-shaped snake, kebab, dotted and spaced aliases", () => {
    const redacted = redactPii({
      customer_name: "Fatima Benali",
      first_name: "Fatima",
      "last-name": "Benali",
      "delivery.notes": "Private entrance",
      "phone blind index": "blind-index-secret",
      nested: {
        api_token: "provider-token",
        address_line1: "12 Rue Provider",
        safe_field: "warehouse",
      },
    });

    expect(redacted).toEqual({
      customer_name: "[REDACTED]",
      first_name: "[REDACTED]",
      "last-name": "[REDACTED]",
      "delivery.notes": "[REDACTED]",
      "phone blind index": "[REDACTED]",
      nested: {
        api_token: "[REDACTED]",
        address_line1: "[REDACTED]",
        safe_field: "warehouse",
      },
    });
  });

  it("defines special provider keys as own properties without changing prototypes", () => {
    const source = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(source, "__proto__", {
      value: { customer_name: "Fatima Benali" },
      enumerable: true,
      configurable: true,
      writable: true,
    });

    const redacted = redactPii(source);

    expect(Object.getPrototypeOf(redacted)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(redacted, "__proto__")).toBe(true);
    expect(redacted.__proto__).toEqual({ customer_name: "[REDACTED]" });
  });
});
