/**
 * Tests for src/lib/ai/redact.ts — PII redaction for AI tool results.
 *
 * Coverage:
 *   - redactPhone: Algerian local + international formats, edge cases
 *   - redactPhonesInText: contiguous/spaced phone formats in prose
 *   - redactToolResult: recursive object/array walking, address truncation,
 *     phone-field-specific redaction
 *   - Documented gaps (NOT redacted): Arabic-Indic digits, emails, names in
 *     the generic sanitizer — customer names are handled by the tool-aware layer.
 *
 * The redact module imports "server-only" (a Next.js package that throws
 * on the client). vitest.config.ts aliases "server-only" to a no-op mock,
 * so tests can import the module directly.
 */
import { describe, it, expect } from "vitest";
import {
  redactPhone,
  redactPhonesInText,
  redactToolResult,
} from "../redact";

// ── redactPhone ──────────────────────────────────────────────────────────────

describe("redactPhone", () => {
  it("redacts a 10-digit Algerian local number (05XX...)", () => {
    const out = redactPhone("0555123456");
    expect(out).toBe("0•••••••56");
    expect(out).toHaveLength(10);
    expect(out.endsWith("56")).toBe(true);
  });

  it("redacts a 10-digit Algerian local number (06XX...)", () => {
    expect(redactPhone("0661789012")).toBe("0•••••••12");
  });

  it("redacts a 10-digit Algerian local number (07XX...)", () => {
    expect(redactPhone("0770123456")).toBe("0•••••••56");
  });

  it("redacts a +213 international number (preserves last 2 digits)", () => {
    const out = redactPhone("+213555123456");
    expect(out).toBe("0•••••••••56");
    expect(out).toHaveLength(12);
  });

  it("strips spaces + dashes before redacting", () => {
    expect(redactPhone("0555 12 34 56")).toBe("0•••••••56");
    expect(redactPhone("+213 555 12 34 56")).toBe("0•••••••••56");
  });

  it("returns •••• for inputs with fewer than 4 digits", () => {
    expect(redactPhone("12")).toBe("••••");
    expect(redactPhone("abc")).toBe("••••");
    expect(redactPhone("")).toBe("••••");
  });

  it("handles very short phone-like strings (exactly 4 digits)", () => {
    expect(redactPhone("1234")).toBe("0•34");
  });

  it("redacts a 00213-prefixed value when called directly", () => {
    const out = redactPhone("00213555123456");
    expect(out).toBe("0•••••••••••56");
    expect(out).not.toBe("00213555123456");
  });

  it("fails closed for Arabic-Indic digits when called directly", () => {
    expect(redactPhone("٠٥٥٥١٢٣٤٥٦")).toBe("••••");
  });
});

// ── redactPhonesInText ───────────────────────────────────────────────────────

describe("redactPhonesInText", () => {
  it("redacts a single Algerian local phone embedded in prose", () => {
    const out = redactPhonesInText("Call me at 0555123456 thanks");
    expect(out).toContain("0•••••••56");
    expect(out).not.toContain("0555123456");
    expect(out).toMatch(/^Call me at .* thanks$/);
  });

  it("redacts multiple phones in the same string", () => {
    const out = redactPhonesInText("First 0555123456, second 0770123456");
    expect(out).toContain("0•••••••56");
    expect(out).not.toContain("0555123456");
    expect(out).not.toContain("0770123456");
  });

  it("redacts contiguous and spaced local phone formats", () => {
    const out = redactPhonesInText("Phones: 0555123456 and 0661 78 90 12");
    expect(out).not.toContain("0555123456");
    expect(out).not.toContain("0661 78 90 12");
    expect(out).toContain("0•••••••56");
    expect(out).toContain("0•••••••12");
  });

  it("redacts +213 international formats in prose", () => {
    const contiguous = redactPhonesInText("WhatsApp: +213555123456");
    const spaced = redactPhonesInText("Tel: +213 555 12 34 56 please");
    expect(contiguous).not.toContain("+213555123456");
    expect(spaced).not.toContain("+213 555 12 34 56");
  });

  it("redacts 00213 international formats in prose", () => {
    const out = redactPhonesInText("Call 00213 555 12 34 56");
    expect(out).not.toContain("00213 555 12 34 56");
    expect(out).toContain("•");
  });

  it("preserves non-phone numbers that are too short", () => {
    const out = redactPhonesInText("Order 055512345 (9 digits) stays");
    expect(out).toContain("055512345");
  });

  it("conservatively redacts a phone-like suffix inside an order-looking token", () => {
    const out = redactPhonesInText("CMD-0555123456");
    expect(out).not.toContain("0555123456");
    expect(out).toContain("•");
  });

  it("returns the input unchanged when there are no phone numbers", () => {
    const text = "Hello, I want to buy 2 t-shirts.";
    expect(redactPhonesInText(text)).toBe(text);
  });

  it("returns empty string for empty input", () => {
    expect(redactPhonesInText("")).toBe("");
  });

  // ── Documented limitations ──────────────────────────────────────────────

  it("does NOT redact Arabic-Indic digits in free text", () => {
    const out = redactPhonesInText("Tel: ٠٥٥٥١٢٣٤٥٦");
    expect(out).toContain("٠٥٥٥١٢٣٤٥٦");
  });

  it("does NOT redact emails (generic sanitizer limitation)", () => {
    const out = redactPhonesInText("Contact: karim@example.com");
    expect(out).toContain("karim@example.com");
  });
});

// ── redactToolResult ────────────────────────────────────────────────────────

describe("redactToolResult", () => {
  it("redacts phones in a top-level string", () => {
    const out = redactToolResult("Customer phone: 0555123456") as string;
    expect(out).toContain("0•••••••56");
    expect(out).not.toContain("0555123456");
  });

  it("redacts spaced phones in arbitrary generic strings", () => {
    const out = redactToolResult("Customer phone: 0555 12 34 56") as string;
    expect(out).not.toContain("0555 12 34 56");
    expect(out).toContain("0•••••••56");
  });

  it("redacts the 'phone' field of an object with redactPhone", () => {
    const out = redactToolResult({ phone: "0555123456" }) as { phone: string };
    expect(out.phone).toBe("0•••••••56");
  });

  it("redacts the 'customerPhone' field of an object", () => {
    const out = redactToolResult({ customerPhone: "0661789012" }) as { customerPhone: string };
    expect(out.customerPhone).toBe("0•••••••12");
  });

  it("redacts the 'contactPhone' field of an object", () => {
    const out = redactToolResult({ contactPhone: "0770123456" }) as { contactPhone: string };
    expect(out.contactPhone).toBe("0•••••••56");
  });

  it("truncates 'address' fields longer than 20 chars (keep first 10 + bullets)", () => {
    const longAddress = "123 Main Street, Apt 4B, Algiers, Algeria";
    const out = redactToolResult({ address: longAddress }) as { address: string };
    expect(out.address).toBe(longAddress.slice(0, 10) + "••••");
    expect(out.address).not.toContain("Algiers");
    expect(out.address).not.toContain("Apt 4B");
  });

  it("replaces short 'address' fields with — (less than 20 chars)", () => {
    const out = redactToolResult({ address: "short addr" }) as { address: string };
    expect(out.address).toBe("—");
  });

  it("recursively redacts nested objects (phone field deep inside)", () => {
    const out = redactToolResult({
      customer: {
        name: "Karim",
        phone: "0555123456",
        address: "123 Long Street Name, Algiers, Algeria",
      },
    }) as { customer: { name: string; phone: string; address: string } };
    expect(out.customer.name).toBe("Karim");
    expect(out.customer.phone).toBe("0•••••••56");
    expect(out.customer.address).not.toContain("Algiers");
  });

  it("recursively redacts arrays of objects", () => {
    const out = redactToolResult([
      { phone: "0555123456" },
      { phone: "0770123456" },
    ]) as Array<{ phone: string }>;
    expect(out[0]!.phone).toBe("0•••••••56");
    expect(out[1]!.phone).toBe("0•••••••56");
  });

  it("redacts phones inside arbitrary string values (not just phone fields)", () => {
    const out = redactToolResult({
      notes: "Customer called from 0555123456",
    }) as { notes: string };
    expect(out.notes).toContain("0•••••••56");
    expect(out.notes).not.toContain("0555123456");
  });

  it("passes through numbers, booleans, and null unchanged", () => {
    expect(redactToolResult(42)).toBe(42);
    expect(redactToolResult(true)).toBe(true);
    expect(redactToolResult(null)).toBe(null);
  });

  it("passes through undefined unchanged", () => {
    expect(redactToolResult(undefined)).toBe(undefined);
  });

  it("handles deeply nested arrays inside objects", () => {
    const out = redactToolResult({
      orders: [
        { id: "o1", phone: "0555123456" },
        { id: "o2", phone: "0770123456" },
      ],
    }) as { orders: Array<{ id: string; phone: string }> };
    expect(out.orders[0]!.phone).toBe("0•••••••56");
    expect(out.orders[1]!.phone).toBe("0•••••••56");
    expect(out.orders[0]!.id).toBe("o1");
  });

  it("preserves non-PII fields untouched", () => {
    const out = redactToolResult({
      id: "cust-123",
      name: "Karim",
      wilaya: "Alger",
      orderCount: 5,
      totalSpent: 12000,
    }) as Record<string, unknown>;
    expect(out.id).toBe("cust-123");
    expect(out.name).toBe("Karim");
    expect(out.wilaya).toBe("Alger");
    expect(out.orderCount).toBe(5);
    expect(out.totalSpent).toBe(12000);
  });

  it("does NOT redact customer names in the generic fallback", () => {
    const out = redactToolResult({
      customerName: "Karim Benali",
      name: "Amine Ould Ali",
    }) as { customerName: string; name: string };
    expect(out.customerName).toBe("Karim Benali");
    expect(out.name).toBe("Amine Ould Ali");
  });

  it("does NOT redact email fields in the generic fallback", () => {
    const out = redactToolResult({
      email: "karim@example.com",
      contactEmail: "amine@example.com",
    }) as { email: string; contactEmail: string };
    expect(out.email).toBe("karim@example.com");
    expect(out.contactEmail).toBe("amine@example.com");
  });

  it("fails closed for non-string phone field values", () => {
    const out = redactToolResult({ phone: 555123456 }) as { phone: null };
    expect(out.phone).toBeNull();
  });
});

// ── Edge cases at string boundaries ──────────────────────────────────────────

describe("redactPhonesInText — boundary cases", () => {
  it("redacts a phone at the start of the string", () => {
    const out = redactPhonesInText("0555123456 is my number");
    expect(out.startsWith("0•••••••56")).toBe(true);
    expect(out).not.toContain("0555123456");
  });

  it("redacts a phone at the end of the string", () => {
    const out = redactPhonesInText("my number is 0555123456");
    expect(out.endsWith("0•••••••56")).toBe(true);
    expect(out).not.toContain("0555123456");
  });

  it("redacts a phone that IS the entire string", () => {
    expect(redactPhonesInText("0555123456")).toBe("0•••••••56");
  });

  it("does NOT redact two adjacent 10-digit phones with no separator", () => {
    const out = redactPhonesInText("05551234560770123456");
    expect(out).toBe("05551234560770123456");
  });
});
