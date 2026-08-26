import { describe, expect, it } from "vitest";

import {
  messageText,
  normalizeWhatsAppJid,
  normalizeWhatsAppMessageContent,
} from "../types";

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

describe("WhatsApp provider message normalization", () => {
  it("boundedly unwraps nested future-proof media containers", () => {
    const normalized = normalizeWhatsAppMessageContent({
      ephemeralMessage: {
        message: {
          viewOnceMessageV2: {
            message: {
              imageMessage: {
                mimetype: "image/jpeg",
                caption: "Photo commande",
              },
            },
          },
        },
      },
    });

    expect(normalized).toEqual({
      imageMessage: {
        mimetype: "image/jpeg",
        caption: "Photo commande",
      },
    });
    expect(messageText(normalized)).toBe("Photo commande");
  });

  it("unwraps protocol edited content without following provider retrieval data", () => {
    const normalized = normalizeWhatsAppMessageContent({
      protocolMessage: {
        editedMessage: {
          documentWithCaptionMessage: {
            message: {
              documentMessage: {
                mimetype: "application/pdf",
                fileName: "commande.pdf",
                directPath: "/provider/private",
              },
            },
          },
        },
      },
    });

    expect(normalized).toMatchObject({
      documentMessage: {
        mimetype: "application/pdf",
        fileName: "commande.pdf",
      },
    });
  });
});
