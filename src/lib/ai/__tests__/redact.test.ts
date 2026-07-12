/**
 * Tests for src/lib/ai/redact.ts — PII redaction for AI tool results.
 *
 * Coverage:
 *   - redactPhone: Algerian local + international formats, edge cases
 *   - redactPhonesInText: multiple phones, mixed with prose
 *   - redactToolResult: recursive object/array walking, address truncation,
 *     phone-field-specific redaction
 *   - Documented gaps (NOT redacted): 00213XXXXXXXXX prefix, Arabic-Indic
 *     digits, emails, names — these are limitations of the current impl,
 *     surfaced as explicit tests so a future fix updates both the impl
 *     AND the test (no silent regressions).
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
    // 10 digits → "0" + 7 bullets + last 2 digits
    const out = redactPhone("0555123456");
    expect(out).toBe("0•••••••56");
    expect(out).toHaveLength(10);
    // Last 2 digits preserved
    expect(out.endsWith("56")).toBe(true);
  });

  it("redacts a 10-digit Algerian local number (06XX...)", () => {
    const out = redactPhone("0661789012");
    expect(out).toBe("0•••••••12");
  });

  it("redacts a 10-digit Algerian local number (07XX...)", () => {
    const out = redactPhone("0770123456");
    expect(out).toBe("0•••••••56");
  });

  it("redacts a +213 international number (preserves last 2 digits)", () => {
    // "+213555123456" → digits = "213555123456" (12 chars)
    // → "0" + 9 bullets + "56"
    const out = redactPhone("+213555123456");
    expect(out).toBe("0•••••••••56");
    expect(out).toHaveLength(12);
  });

  it("strips spaces + dashes before redacting", () => {
    // "0555 12 34 56" → digits = "0555123456" (10 chars) → same as 0555123456
    expect(redactPhone("0555 12 34 56")).toBe("0•••••••56");
    // "+213 555 12 34 56" → digits = "213555123456" (12 chars)
    expect(redactPhone("+213 555 12 34 56")).toBe("0•••••••••56");
  });

  it("returns •••• for inputs with fewer than 4 digits", () => {
    expect(redactPhone("12")).toBe("••••");
    expect(redactPhone("abc")).toBe("••••");
    expect(redactPhone("")).toBe("••••");
  });

  it("handles very short phone-like strings (exactly 4 digits)", () => {
    // 4 digits → "0" + 1 bullet + last 2 digits = "0•34"
    expect(redactPhone("1234")).toBe("0•34");
  });

  // ── Documented limitations ──────────────────────────────────────────────
  // These tests pin the current behavior — if a future change adds support
  // for these formats, the test should be updated to assert redaction.

  it("does NOT recognize 00213 prefix as international (limitation)", () => {
    // "00213555123456" → digits = "00213555123456" (14 chars)
    // → "0" + 11 bullets + "56" — note: this is treated as a generic digit
    // string, not specifically an Algerian international number. The
    // function still redacts it (because it strips non-digits and applies
    // the same formula), but the result is "0" + 11 bullets + "56".
    const out = redactPhone("00213555123456");
    expect(out).toBe("0•••••••••••56");
    // Verify it still preserves last-2 + has bullets (not raw).
    expect(out).not.toBe("00213555123456");
  });

  it("does NOT recognize Arabic-Indic digits (limitation: \\D strips them)", () => {
    // "٠٥٥٥١٢٣٤٥٦" — Arabic-Indic digits for 0555123456.
    // redactPhone strips \D (non-ASCII-digit), so Arabic-Indic digits are
    // stripped to "" → length 0 → returns "••••".
    const out = redactPhone("٠٥٥٥١٢٣٤٥٦");
    expect(out).toBe("••••");
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
    expect(out).toContain("0•••••••56");
    expect(out).not.toContain("0555123456");
    expect(out).not.toContain("0770123456");
  });

  it("redacts an international +213 phone in prose", () => {
    const out = redactPhonesInText("WhatsApp: +213555123456");
    expect(out).toContain("0•••••••••56");
    expect(out).not.toContain("+213555123456");
  });

  it("redacts +213 with a space after the prefix", () => {
    const out = redactPhonesInText("Tel: +213 555123456 please");
    // INTL_PHONE regex: /\+213\s?[5-7]\d{8}\b/ — matches "+213 555123456"
    expect(out).not.toContain("+213 555123456");
    expect(out).not.toContain("+213555123456");
  });

  it("preserves non-phone numbers (too short to match the regex)", () => {
    // 05XX + 7 digits = 9 chars total → won't match /\b0[5-7]\d{8}\b/ (needs 10)
    const out = redactPhonesInText("Order 055512345 (9 digits) stays");
    expect(out).toContain("055512345");
  });

  it("preserves order IDs that look like phone numbers but aren't (order CMD-0555123456)", () => {
    // The regex uses \b word boundary. "CMD-0555123456" — the "-" before
    // "0555..." is a non-word char, so \b matches between - and 0. The
    // regex WILL match here. This is intentional (the redactor is
    // conservative — better to over-redact a CMD-1234-looking string than
    // to leak a real phone number).
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

  it("does NOT redact 00213XXXXXXXXX international prefix (limitation)", () => {
    // The INTL_PHONE regex only matches "+213", not "00213".
    // "00213555123456" — the substring "0213555123456" is 13 chars; the
    // ALGERIAN_PHONE regex /\b0[5-7]\d{8}\b/ requires the digit after the
    // leading 0 to be 5/6/7. Here the second digit is 2, so no match.
    // The full "00213555123456" itself starts with "00" so the ALGERIAN
    // regex's \b0[5-7] won't match (it'd need 05/06/07 immediately).
    const out = redactPhonesInText("Call 00213555123456");
    // The raw phone is still present (limitation).
    expect(out).toContain("00213555123456");
  });

  it("does NOT redact Arabic-Indic digits in phone numbers (limitation)", () => {
    // "٠٥٥٥١٢٣٤٥٦" — the regexes use \d which is ASCII-only by default.
    const out = redactPhonesInText("Tel: ٠٥٥٥١٢٣٤٥٦");
    expect(out).toContain("٠٥٥٥١٢٣٤٥٦");
  });

  it("does NOT redact emails (limitation: redact.ts has no email regex)", () => {
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
    expect(out.customer.name).toBe("Karim"); // names are NOT redacted
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
    // The else branch of the object loop calls redactToolResult(value),
    // which for a string calls redactPhonesInText. So a "notes" field
    // containing a phone number WILL be redacted.
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
    expect(out.name).toBe("Karim"); // names NOT redacted (limitation)
    expect(out.wilaya).toBe("Alger");
    expect(out.orderCount).toBe(5);
    expect(out.totalSpent).toBe(12000);
  });

  // ── Documented limitations ──────────────────────────────────────────────

  it("does NOT redact customer names (limitation: no name redaction logic)", () => {
    const out = redactToolResult({
      customerName: "Karim Benali",
      name: "Amine Ould Ali",
    }) as { customerName: string; name: string };
    expect(out.customerName).toBe("Karim Benali");
    expect(out.name).toBe("Amine Ould Ali");
  });

  it("does NOT redact email fields (limitation: no email regex)", () => {
    const out = redactToolResult({
      email: "karim@example.com",
      contactEmail: "amine@example.com",
    }) as { email: string; contactEmail: string };
    expect(out.email).toBe("karim@example.com");
    expect(out.contactEmail).toBe("amine@example.com");
  });

  it("does NOT redact phones inside 'phone' field if value is not a string", () => {
    // Edge case: the phone field check requires typeof value === "string".
    // A number-typed phone (rare but possible) falls through to the else
    // branch and is returned unchanged (numbers aren't strings, so
    // redactToolResult returns them as-is).
    const out = redactToolResult({ phone: 555123456 }) as { phone: number };
    expect(out.phone).toBe(555123456);
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
    const out = redactPhonesInText("0555123456");
    expect(out).toBe("0•••••••56");
  });

  it("does NOT redact two adjacent 10-digit phones with no separator (limitation)", () => {
    // \b is between a word char and a non-word char. Two 10-digit phones
    // back-to-back form a 20-digit "word" with no internal word boundary.
    // The ALGERIAN_PHONE regex /\b0[5-7]\d{8}\b/ starts matching at
    // position 0 (leading \b at start-of-string), but the trailing \b
    // fails because position 10 is mid-word (between "5" and "0", both
    // word chars). So NO match — the entire 20-digit run is returned
    // unchanged. This is a documented limitation.
    const out = redactPhonesInText("05551234560770123456");
    expect(out).toBe("05551234560770123456");
  });
});
