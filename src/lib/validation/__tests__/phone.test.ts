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
