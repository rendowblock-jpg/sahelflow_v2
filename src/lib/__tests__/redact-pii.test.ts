import { describe, it, expect } from "vitest";
import { redactPii } from "@/lib/redact-pii";

describe("redactPii", () => {
  it("redacts sensitive top-level keys", () => {
    const out = redactPii({ name: "Ahmed", phone: "0555123456", notes: "delivery" });
    expect(out).toEqual({ name: "[REDACTED]", phone: "[REDACTED]", notes: "[REDACTED]" });
  });

  it("redacts nested sensitive keys", () => {
    const out = redactPii({ customer: { name: "Ahmed", phone: "0555123456" }, total: 5000 });
    expect(out).toEqual({ customer: { name: "[REDACTED]", phone: "[REDACTED]" }, total: 5000 });
  });

  it("preserves non-sensitive fields", () => {
    const out = redactPii({ id: "abc", status: "pending", amount: 1500, items: [{ qty: 2 }] });
    expect(out).toEqual({ id: "abc", status: "pending", amount: 1500, items: [{ qty: 2 }] });
  });

  it("redacts phone numbers embedded in strings", () => {
    const out = redactPii({ message: "Call me at 0555 12 34 56 tomorrow" });
    expect(out).toEqual({ message: "Call me at [PHONE] tomorrow" });
  });

  it("redacts international +213 format", () => {
    const out = redactPii({ msg: "Phone: +213 555 12 34 56" });
    expect(out).toEqual({ msg: "Phone: [PHONE]" });
  });

  it("handles arrays of objects", () => {
    const out = redactPii([{ name: "A", phone: "1" }, { name: "B", phone: "2" }]);
    expect(out).toEqual([
      { name: "[REDACTED]", phone: "[REDACTED]" },
      { name: "[REDACTED]", phone: "[REDACTED]" },
    ]);
  });

  it("does not mutate the input", () => {
    const input = { name: "Ahmed", phone: "0555" };
    redactPii(input);
    expect(input).toEqual({ name: "Ahmed", phone: "0555" });
  });

  it("handles null/undefined/scalars", () => {
    expect(redactPii(null)).toBeNull();
    expect(redactPii(undefined)).toBeUndefined();
    expect(redactPii("hello")).toBe("hello");
    expect(redactPii(42)).toBe(42);
  });
});
