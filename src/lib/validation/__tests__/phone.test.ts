import { describe, expect, it } from "vitest";

import { dzPhone } from "../index";
import {
  DZ_PHONE_PLACEHOLDER,
  dzPhoneSchema,
  formatDZPhone,
  isValidDZMobilePhone,
  normalizeDZPhone,
} from "../phone";

describe("canonical DZ phone module (audit d6 #1/#7/#10)", () => {
  it("exposes the single canonical mask placeholder", () => {
    expect(DZ_PHONE_PLACEHOLDER).toBe("05 55 12 34 56");
    // The placeholder is the formatted form of a valid number.
    expect(formatDZPhone("0555123456")).toBe(DZ_PHONE_PLACEHOLDER);
  });

  describe("normalizeDZPhone", () => {
    it("strips separators from the masked display value", () => {
      expect(normalizeDZPhone("05 55 12 34 56")).toBe("0555123456");
      expect(normalizeDZPhone("05-55-12-34-56")).toBe("0555123456");
    });

    it("canonicalizes +213 / 00213 / 213 international prefixes", () => {
      expect(normalizeDZPhone("+213555123456")).toBe("0555123456");
      expect(normalizeDZPhone("00213555123456")).toBe("0555123456");
      expect(normalizeDZPhone("213555123456")).toBe("0555123456");
    });

    it("keeps already-normalized values and returns '' for empty input", () => {
      expect(normalizeDZPhone("0555123456")).toBe("0555123456");
      expect(normalizeDZPhone("")).toBe("");
    });
  });

  describe("formatDZPhone", () => {
    it("groups digits as 0X XX XX XX XX", () => {
      expect(formatDZPhone("0555123456")).toBe("05 55 12 34 56");
      expect(formatDZPhone("+213 555 12 34 56")).toBe("05 55 12 34 56");
    });

    it("masks progressively while typing and never exceeds 10 digits", () => {
      // A lone leading "0" stays empty until the first national digit lands
      // (matches the shipped use-phone-mask typing behavior).
      expect(formatDZPhone("0")).toBe("");
      expect(formatDZPhone("05")).toBe("05");
      expect(formatDZPhone("055")).toBe("05 5");
      expect(formatDZPhone("05551234567")).toBe("05 55 12 34 56");
      expect(formatDZPhone("")).toBe("");
    });
  });

  describe("isValidDZMobilePhone (the one validator)", () => {
    it("accepts 05/06/07 numbers in masked or normalized form", () => {
      for (const value of ["0555123456", "0660123456", "0770123456"]) {
        expect(isValidDZMobilePhone(value)).toBe(true);
        expect(isValidDZMobilePhone(formatDZPhone(value))).toBe(true);
      }
    });

    it("rejects invalid prefixes, short/long numbers and garbage", () => {
      expect(isValidDZMobilePhone("0412345678")).toBe(false); // not a mobile prefix
      expect(isValidDZMobilePhone("0812345678")).toBe(false);
      expect(isValidDZMobilePhone("055512345")).toBe(false); // 9 digits
      expect(isValidDZMobilePhone("05551234567")).toBe(false); // 11 digits
      expect(isValidDZMobilePhone("")).toBe(false);
      expect(isValidDZMobilePhone("not-a-phone")).toBe(false);
    });

    it("agrees with the server-owned dzPhone regex on normalized values", () => {
      for (const value of [
        "0555123456",
        "0660123456",
        "0770123456",
        "0412345678",
        "055512345",
        "05551234567",
        "",
      ]) {
        expect(isValidDZMobilePhone(value)).toBe(dzPhone.safeParse(value).success);
      }
    });
  });

  describe("dzPhoneSchema", () => {
    it("accepts the masked display value", () => {
      const result = dzPhoneSchema.safeParse("05 55 12 34 56");
      expect(result.success).toBe(true);
    });

    it("reports a missing phone separately from an invalid one", () => {
      const missing = dzPhoneSchema.safeParse("   ");
      expect(missing.success).toBe(false);
      if (!missing.success) {
        expect(missing.error.issues[0]?.message).toBe("Phone is required");
      }

      const invalid = dzPhoneSchema.safeParse("055512345");
      expect(invalid.success).toBe(false);
      if (!invalid.success) {
        expect(invalid.error.issues[0]?.message).toContain("0[5-7]");
      }
    });
  });
});

describe("displayContactName", () => {
  it("shows raw chat numbers the way sellers write them and keeps names", async () => {
    const { displayContactName } = await import("@/lib/validation/phone");
    expect(displayContactName("213555345678")).toBe("05 55 34 56 78");
    expect(displayContactName("33612345678")).toBe("+33612345678");
    expect(displayContactName("Nadia Belkacem")).toBe("Nadia Belkacem");
  });
});

// A seller or buyer on an Arabic keyboard types Arabic-Indic (U+0660-0669) or
// Eastern/Persian (U+06F0-06F9) digits. JavaScript's /\D/ (no unicode flag)
// treats those as non-digits, so the number used to vanish into "".
const toArabicIndic = (ascii: string) =>
  ascii.replace(/\d/g, (d) => String.fromCharCode(0x0660 + Number(d)));
const toEasternArabicIndic = (ascii: string) =>
  ascii.replace(/\d/g, (d) => String.fromCharCode(0x06f0 + Number(d)));

describe("Arabic-Indic and Eastern Arabic-Indic digits (PB-PHONE-ARABIC-DIGITS)", () => {
  const spellings: Array<[string, string, string]> = [
    ["Arabic-Indic literal", "٠٦٥٥١٢٣٤٥٦", "0655123456"],
    ["Eastern Arabic-Indic literal", "۰۶۵۵۱۲۳۴۵۶", "0655123456"],
    ["+213 with spaces", "+٢١٣ ٦٥٥ ١٢ ٣٤ ٥٦", "0655123456"],
    ["00213 prefix", "٠٠٢١٣٦٥٥١٢٣٤٥٦", "0655123456"],
    ["Eastern +213 with spaces", "+۲۱۳ ۶۵۵ ۱۲ ۳۴ ۵۶", "0655123456"],
    ["Arabic and ASCII digits mixed", "0655١٢٣٤٥٦", "0655123456"],
    ["Eastern and ASCII digits mixed", "0655۱۲۳۴۵۶", "0655123456"],
    ["Arabic comma between groups", "٠٦٥٥،١٢،٣٤،٥٦", "0655123456"],
    ["Arabic decimal and thousands marks", "٠٦٥٥٫١٢٬٣٤٫٥٦", "0655123456"],
  ];

  for (const [label, input, expected] of spellings) {
    it(`normalizes ${label} to ${expected}`, () => {
      expect(normalizeDZPhone(input)).toBe(expected);
      expect(isValidDZMobilePhone(input)).toBe(true);
      expect(formatDZPhone(input)).toBe("06 55 12 34 56");
    });
  }

  it("gives the same result as the ASCII number for every digit", () => {
    for (const ascii of ["0555123456", "0770987654", "+213 555 12 34 56", "00213 660 12 34 56"]) {
      const expected = normalizeDZPhone(ascii);
      expect(expected).not.toBe("");
      expect(normalizeDZPhone(toArabicIndic(ascii))).toBe(expected);
      expect(normalizeDZPhone(toEasternArabicIndic(ascii))).toBe(expected);
    }
  });

  it("ignores bidi marks and no-break spaces inside the number", () => {
    const separators = [
      "\u200e", "\u200f", "\u202a", "\u202b", "\u202c", "\u202d", "\u202e",
      "\u2066", "\u2067", "\u2068", "\u2069", "\u00a0", "\u202f", "\u060c",
    ];
    for (const sep of separators) {
      const ascii = `0655${sep}12${sep}34${sep}56`;
      const arabic = toArabicIndic(ascii);
      const label = `U+${sep.charCodeAt(0).toString(16).padStart(4, "0")}`;
      expect(normalizeDZPhone(ascii), `ascii ${label}`).toBe("0655123456");
      expect(normalizeDZPhone(arabic), `arabic ${label}`).toBe("0655123456");
    }
  });

  it("keeps ASCII behaviour unchanged, including the existing '(0)' result", () => {
    expect(normalizeDZPhone("0655 12 34 56")).toBe("0655123456");
    // Existing behaviour, not endorsed: the "(0)" trunk digit is kept as a
    // digit after the 213 prefix, so this does not become a valid mobile.
    expect(normalizeDZPhone("+213 (0) 655 12 34 56")).toBe("00655123456");
    expect(normalizeDZPhone("")).toBe("");
    expect(normalizeDZPhone("abc")).toBe("");
  });

  it("returns '' for text with no digits in any script", () => {
    expect(normalizeDZPhone("رقم الهاتف")).toBe("");
    expect(isValidDZMobilePhone("رقم الهاتف")).toBe(false);
  });
});
