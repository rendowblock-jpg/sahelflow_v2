import { describe, it, expect } from "vitest";
import { redactCustomerName, redactPhonesInText, redactToolResult } from "../redact";

// Same table as src/lib/__tests__/redact-pii-phone-formats.test.ts: the model
// path (this masker) must hide every shape the audit path hides. A masked
// number keeps at most a leading 0 and the last two digits.
const PHONE_FORMATS: ReadonlyArray<readonly [string, string]> = [
  ["plain", "0555123456"],
  ["spaces in pairs", "0555 12 34 56"],
  ["hyphens", "0555-12-34-56"],
  ["dots", "0555.12.34.56"],
  ["pairs only", "05 55 12 34 56"],
  ["groups of three", "0555 123 456"],
  ["hyphen groups of three", "0555-123-456"],
  ["parentheses", "(0555) 12 34 56"],
  ["+213 with spaces", "+213 555 12 34 56"],
  ["+213 plain", "+213555123456"],
  ["+213 hyphens", "+213-555-12-34-56"],
  ["+213 with (0)", "+213 (0)555 12 34 56"],
  ["00213 plain", "00213555123456"],
  ["00213 with spaces", "00213 555 12 34 56"],
  ["Arabic-Indic digits", "٠٥٥٥ ١٢ ٣٤ ٥٦"],
  ["Arabic-Indic digits plain", "٠٥٥٥١٢٣٤٥٦"],
  ["extended Arabic-Indic digits", "۰۵۵۵ ۱۲ ۳۴ ۵۶"],
  ["non-breaking space", "0555\u00a012\u00a034\u00a056"],
];

// A masked number: bullets only, no digit from the middle of the number.
const MASKED = /^0•+56$|^••••$/u;

describe("redactPhonesInText phone formats", () => {
  it.each(PHONE_FORMATS)("masks %s", (_label, phone) => {
    const out = redactPhonesInText(`Call me at ${phone} tomorrow`);
    expect(out.startsWith("Call me at ")).toBe(true);
    expect(out.endsWith(" tomorrow")).toBe(true);
    const middle = out.slice("Call me at ".length, out.length - " tomorrow".length);
    expect(middle).toMatch(MASKED);
  });

  it("masks several numbers in one string and keeps the rest", () => {
    const out = redactPhonesInText("0555-12-34-56 / +213 661 23 45 67 / 00213770123456 ok");
    expect(out).toMatch(/^0•+56 \/ 0•+67 \/ 0•+56 ok$/u);
  });

  it("masks a customer-name field that carries a phone, keeping the name", () => {
    for (const [, phone] of PHONE_FORMATS) {
      expect(redactCustomerName(`Karim ${phone}`)).toBe("Karim");
    }
  });

  it("masks every format inside a tool result string", () => {
    for (const [, phone] of PHONE_FORMATS) {
      const out = redactToolResult(`note: ${phone}`) as string;
      expect(out).toMatch(/^note: (?:0•+56|••••)$/u);
    }
  });
});

describe("redactPhonesInText keeps text that is not a phone", () => {
  it.each([
    ["order total with a space as thousands separator", "Total 12 500 DA"],
    ["big total", "Total 1 250 000 DA"],
    ["ISO date", "2026-10-24"],
    ["ISO timestamp", "2026-10-24T13:41:21.048Z"],
    ["date and time", "2026-10-24 13:41:21"],
    ["day-first date with a time", "05-10-2026 14:30"],
    ["slash date with a time", "05/10/2026 14:30"],
    ["13-digit id", "ref 1234567890123"],
    ["13-digit id that starts with 0", "ref 0123456789012"],
    ["13-digit id that starts with 00213", "ref 0021355512345"],
    ["price with decimals", "price 1250.50 DA"],
    ["small decimal", "price 0.50 DA"],
    ["quantity line", "3 x 4500 DA = 13 500 DA"],
    ["Arabic-Indic total", "المجموع ١٢ ٥٠٠ دج"],
  ])("leaves %s unchanged", (_label, text) => {
    expect(redactPhonesInText(text)).toBe(text);
  });

  it("masks the phone and leaves the totals and dates around it", () => {
    const out = redactPhonesInText(
      "Order 12 500 DA on 2026-10-24, call 0555-12-34-56, ref 1234567890123, price 1250.50",
    );
    expect(out).toBe(
      "Order 12 500 DA on 2026-10-24, call 0•••••••56, ref 1234567890123, price 1250.50",
    );
  });
});
