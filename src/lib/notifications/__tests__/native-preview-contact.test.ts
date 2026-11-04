import { describe, expect, it } from "vitest";

import { sanitizeNativePreview } from "@/lib/notifications/preview-safety";

// F-0028: the desktop notification title is the contact name. A raw WhatsApp id
// must never reach the lock screen: an unnamed contact falls back to the
// generic (localized) notification, a phone-number contact shows the number.
const LID = "202460866064562@lid";
const PN = "213791999157@s.whatsapp.net";

describe("sanitizeNativePreview contact title (F-0028)", () => {
  it("keeps a real name", () => {
    expect(sanitizeNativePreview("Amina B.", "Salam", LID)).toEqual({ contactName: "Amina B.", body: "Salam" });
  });

  it("drops the preview for a contact whose stored name is its raw LID", () => {
    expect(sanitizeNativePreview(LID, "Salam", LID)).toBeNull();
    expect(sanitizeNativePreview("202460866064562", "Salam", LID)).toBeNull();
  });

  it("shows the formatted phone for a phone-number contact without a name", () => {
    expect(sanitizeNativePreview("213791999157", "Salam", PN)).toEqual({
      contactName: "+213 791 99 91 57",
      body: "Salam",
    });
    expect(sanitizeNativePreview(PN, "Salam", PN)).toEqual({ contactName: "+213 791 99 91 57", body: "Salam" });
  });

  it("never lets a raw id through whatever the source id is", () => {
    for (const sourceId of [LID, PN, "120363025123456789@g.us", null, undefined]) {
      for (const name of [LID, PN, "120363025123456789@g.us", "202460866064562"]) {
        const preview = sanitizeNativePreview(name, "Salam", sourceId);
        expect(JSON.stringify(preview)).not.toMatch(/\d{8,}@/);
        expect(preview?.contactName ?? "").not.toMatch(/\d{9,}/);
      }
    }
  });
});
