import { describe, it, expect } from "vitest";
import { redactPii, redactStoredAiToolCalls } from "@/lib/redact-pii";

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

  it("preserves digest content under machine-code audit keys (digestCode suffix)", () => {
    const out = redactPii({
      before: { beforeDigestCode: "a".repeat(64) },
      after: { afterDigestCode: "b".repeat(64) },
      count: 3,
    });
    expect(out).toEqual({
      before: { beforeDigestCode: "a".repeat(64) },
      after: { afterDigestCode: "b".repeat(64) },
      count: 3,
    });
  });

  it("keeps a stored tool name and thought signature while redacting argument PII", () => {
    const signature = "sig-0555123456-gemini3";
    const input = [
      {
        name: "get_order_details",
        args: { orderId: "ord-1", phone: "0555123456", name: "Karim Benali" },
        result: { phone: "0555123456" },
        thoughtSignature: signature,
      },
    ];
    const stored = redactStoredAiToolCalls(input);
    expect(stored[0]).toEqual({
      name: "get_order_details",
      args: { orderId: "ord-1", phone: "[REDACTED]", name: "[REDACTED]" },
      result: { phone: "[REDACTED]" },
      thoughtSignature: signature,
    });
    expect(input[0]!.thoughtSignature).toBe(signature);
    expect(input[0]!.args.phone).toBe("0555123456");
  });

  it("does not store the approval details of a waiting AI proposal", () => {
    // The exact values (full phone, address, free-text notes) are for the approver's screen. The chat
    // history column is plain text and redactPii only masks the phone inside a string that contains
    // one ("Appeler Amina au [PHONE] avant 18h" keeps the name), so the stored copy of a pending
    // proposal never carries them; the card reads them from the live event and the proposals API.
    const input = [
      {
        name: "create_order",
        args: { phone: "0661234567", notes: "Appeler Amina au 0770 11 22 33 avant 18h" },
        result: {
          pending_action_proposal: true,
          tool: "create_order",
          proposalDigest: "digest-1",
          proposal: {
            id: "p1",
            status: "pending",
            summary: { itemCount: 1 },
            details: [
              { key: "phone", kind: "phone", value: "0661234567" },
              { key: "notes", kind: "longText", value: "Appeler Amina au 0770 11 22 33 avant 18h" },
            ],
          },
        },
      },
    ];
    const stored = redactStoredAiToolCalls(input);
    const text = JSON.stringify(stored);
    expect(text).not.toContain("Amina");
    expect(text).not.toContain("0661234567");
    const proposal = (stored[0]?.result as { proposal?: Record<string, unknown> } | undefined)?.proposal;
    expect(proposal).toBeDefined();
    expect(proposal).not.toHaveProperty("details");
    expect(proposal).toMatchObject({ id: "p1", status: "pending" });
    // The live object the approver is looking at is not changed by storing a copy of it.
    expect(JSON.stringify(input)).toContain("Appeler Amina au 0770 11 22 33 avant 18h");
  });

  it("keeps a last4 tail but still redacts the full phone beside it", () => {
    expect(redactPii({ last4: "3456", phone: "0555123456" })).toEqual({
      last4: "3456",
      phone: "[REDACTED]",
    });
  });
});
