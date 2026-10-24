import { describe, it, expect } from "vitest";
import { redactForAudit } from "@/lib/mcp/audit";

// The MCP audit row and the chat transcript both store these arguments. Short
// free text (an address, a note, a name) is PII even without a phone in it.
describe("redactForAudit masks free-text values", () => {
  it.each([
    "name",
    "fullName",
    "firstName",
    "lastName",
    "customerName",
    "contactName",
    "recipient",
    "address",
    "addressLine1",
    "address_line_2",
    "note",
    "notes",
    "deliveryNotes",
    "comment",
    "message",
    "messageBody",
    "body",
    "reason",
    "query",
    "email",
  ])("masks the string under %s", (key) => {
    expect(redactForAudit({ [key]: "Ahmed Benali, cité 1200 logts, bât 5" })).toEqual({
      [key]: "[REDACTED]",
    });
  });

  it("masks free text that is short, long, or spelled with another case", () => {
    expect(redactForAudit({ NOTES: "x" })).toEqual({ NOTES: "[REDACTED]" });
    expect(redactForAudit({ notes: "n".repeat(5000) })).toEqual({ notes: "[REDACTED]" });
  });

  it("masks nested objects and arrays under a free-text key", () => {
    expect(
      redactForAudit({
        customer: { name: "Ahmed", wilaya: "Alger" },
        notes: ["leave at the door", { text: "x" }],
      }),
    ).toEqual({
      customer: { name: "[REDACTED]", wilaya: "Alger" },
      notes: ["[REDACTED]", { text: "[REDACTED]" }],
    });
  });

  it("keeps an empty string empty and numbers readable under a free-text key", () => {
    expect(redactForAudit({ notes: "", name: 5 })).toEqual({ notes: "", name: 5 });
  });

  it("keeps ids, counts, enums and places readable", () => {
    const args = {
      orderId: "cm9x1",
      customerId: "cm9x2",
      orderNumber: "CMD-0042",
      status: "confirmed",
      period: "month",
      mode: "append",
      provider: "yalidine",
      wilaya: "Alger",
      commune: "Bab Ezzouar",
      items: [{ productId: "p1", quantity: 3 }],
      limit: 20,
      total: 12500,
      dryRun: true,
    };
    expect(redactForAudit(args)).toEqual(args);
  });

  it("still masks phones, including inside other text", () => {
    const out = redactForAudit({ phone: "0555123456", label: "call 0555 12 34 56" }) as {
      phone: string;
      label: string;
    };
    expect(out.phone).toMatch(/56$/);
    expect(out.phone).not.toContain("5551234");
    expect(out.label).not.toContain("555 12 34");
  });
});
