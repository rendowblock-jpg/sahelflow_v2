import { describe, expect, it } from "vitest";

import { normalizeWhatsAppJid } from "../types";

describe("WhatsApp individual recipient normalization", () => {
  it("normalizes Algerian mobile numbers and PN device JIDs", () => {
    expect(normalizeWhatsAppJid("0555 00 01 11")).toBe(
      "213555000111@s.whatsapp.net",
    );
    expect(
      normalizeWhatsAppJid("213555000111:12@s.whatsapp.net"),
    ).toBe("213555000111@s.whatsapp.net");
  });

  it("preserves a canonical privacy LID exactly", () => {
    expect(normalizeWhatsAppJid("88665640448190@lid")).toBe(
      "88665640448190@lid",
    );
  });

  it.each([
    "88665640448190@g.us",
    "status@broadcast",
    "88665640448190@newsletter",
    "88665640448190@hosted.lid",
    "0@lid",
    "88665640448190:2@lid",
  ])("rejects non-individual or non-canonical JID %s", (jid) => {
    expect(() => normalizeWhatsAppJid(jid)).toThrow();
  });
});
