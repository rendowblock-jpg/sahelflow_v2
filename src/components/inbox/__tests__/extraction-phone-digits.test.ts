import { describe, expect, it } from "vitest";

import { needlesFor } from "@/components/inbox/extraction/extraction-source-pane";
import { algerianPhoneToWhatsAppJid } from "@/components/inbox/message-extraction";
import type { ExtractedOrder } from "@/lib/ai/extraction";

// The order phone can reach these helpers typed on an Arabic keyboard
// (Arabic-Indic U+0660-0669 or Eastern U+06F0-06F9 digits). /\D/ treats those
// as separators, so the number used to vanish.
describe("extraction phone helpers with Arabic digits (PB-PHONE-FOLLOWUPS)", () => {
  describe("algerianPhoneToWhatsAppJid", () => {
    it("keeps the ASCII results", () => {
      expect(algerianPhoneToWhatsAppJid("0655123456")).toBe("213655123456@s.whatsapp.net");
      expect(algerianPhoneToWhatsAppJid("06 55 12 34 56")).toBe("213655123456@s.whatsapp.net");
      expect(algerianPhoneToWhatsAppJid("+213655123456")).toBe("213655123456@s.whatsapp.net");
      expect(algerianPhoneToWhatsAppJid("655123456")).toBe("213655123456@s.whatsapp.net");
    });

    it("reads Arabic-Indic and Eastern Arabic-Indic digits", () => {
      expect(algerianPhoneToWhatsAppJid("٠٦٥٥١٢٣٤٥٦")).toBe("213655123456@s.whatsapp.net");
      expect(algerianPhoneToWhatsAppJid("۰۶۵۵۱۲۳۴۵۶")).toBe("213655123456@s.whatsapp.net");
      expect(algerianPhoneToWhatsAppJid("+٢١٣ ٦٥٥ ١٢ ٣٤ ٥٦")).toBe("213655123456@s.whatsapp.net");
    });
  });

  describe("needlesFor (source-pane highlight)", () => {
    const phoneNeedles = (phone: string) =>
      needlesFor({ phone } as ExtractedOrder).filter((needle) => needle.kind === "customer");
    const matches = (phone: string, body: string) =>
      phoneNeedles(phone).some(({ pattern }) => new RegExp(pattern).test(body));

    it("keeps highlighting an ASCII phone in the customer's words", () => {
      expect(phoneNeedles("0655123456")).toHaveLength(1);
      expect(matches("0655123456", "رقمي 0655 12 34 56 شكرا")).toBe(true);
      expect(matches("0655123456", "رقمي +213655123456")).toBe(true);
    });

    it("builds the phone needle from an Arabic-digit order phone", () => {
      expect(phoneNeedles("٠٦٥٥١٢٣٤٥٦")).toHaveLength(1);
      expect(matches("٠٦٥٥١٢٣٤٥٦", "رقمي 0655 12 34 56 شكرا")).toBe(true);
      expect(matches("۰۶۵۵۱۲۳۴۵۶", "رقمي 0655123456")).toBe(true);
    });
  });
});
