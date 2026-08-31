import { describe, expect, it } from "vitest";

import {
  buildWhatsAppLink,
  toWhatsAppDigits,
} from "@/lib/whatsapp/deep-link";

describe("WhatsApp deep-link builder", () => {
  describe("toWhatsAppDigits", () => {
    it("strips the leading 0 and prefixes 213 for the canonical persisted form", () => {
      expect(toWhatsAppDigits("0555123456")).toBe("213555123456");
    });

    it("accepts the display mask exactly like the persisted form", () => {
      expect(toWhatsAppDigits("05 55 12 34 56")).toBe("213555123456");
    });

    it.each([
      "+213555123456",
      "00213555123456",
      "213555123456",
      " 0555123456 ",
    ])("canonicalizes %s to the same wa.me digits", (input) => {
      expect(toWhatsAppDigits(input)).toBe("213555123456");
    });

    it("keeps the second mobile prefix family (06/07) intact", () => {
      expect(toWhatsAppDigits("0661234567")).toBe("213661234567");
      expect(toWhatsAppDigits("0771234567")).toBe("213771234567");
    });

    it("rejects non-Algerian-mobile numbers with null", () => {
      expect(toWhatsAppDigits("021123456")).toBeNull(); // fixed line (02)
      expect(toWhatsAppDigits("055512345")).toBeNull(); // too short
      expect(toWhatsAppDigits("05551234567")).toBeNull(); // too long
      expect(toWhatsAppDigits("12345")).toBeNull();
      expect(toWhatsAppDigits("")).toBeNull();
      expect(toWhatsAppDigits("not-a-phone")).toBeNull();
    });
  });

  describe("buildWhatsAppLink", () => {
    it("builds a bare wa.me link without a message", () => {
      expect(buildWhatsAppLink("0555123456")).toBe(
        "https://wa.me/213555123456",
      );
    });

    it("appends a URL-encoded prefilled message", () => {
      expect(
        buildWhatsAppLink("0555123456", "Hello, we confirm your order."),
      ).toBe(
        "https://wa.me/213555123456?text=Hello%2C%20we%20confirm%20your%20order.",
      );
    });

    it("encodes accented French copy without corruption", () => {
      const link = buildWhatsAppLink("+213555123456", "Commandé — confirmé");
      expect(link).toBe(
        "https://wa.me/213555123456?text=" +
          encodeURIComponent("Commandé — confirmé"),
      );
    });

    it("encodes Arabic copy without corruption", () => {
      const message = "مرحباً، نؤكد استلام طلبكم";
      const link = buildWhatsAppLink("05 55 12 34 56", message);
      expect(link).toBe(
        "https://wa.me/213555123456?text=" + encodeURIComponent(message),
      );
    });

    it("ignores blank messages instead of producing an empty text param", () => {
      expect(buildWhatsAppLink("0555123456", "   ")).toBe(
        "https://wa.me/213555123456",
      );
      expect(buildWhatsAppLink("0555123456", undefined)).toBe(
        "https://wa.me/213555123456",
      );
    });

    it("returns null for invalid phones so callers can hide the action", () => {
      expect(buildWhatsAppLink("021123456", "hi")).toBeNull();
      expect(buildWhatsAppLink("", "hi")).toBeNull();
    });
  });
});
