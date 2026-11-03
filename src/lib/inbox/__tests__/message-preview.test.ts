// F-0029 (A): what the conversation list and the bubble show for a message
// that has no readable text. Pure function; no DOM. The expected labels are
// written out per language on purpose: this table IS the copy contract.
import { describe, expect, it } from "vitest";

import { messagePreview } from "../message-preview";

type Locale = "ar" | "fr" | "en";

const LABEL: Record<Locale, Record<string, string>> = {
  en: {
    image: "Photo",
    video: "Video",
    voice: "Voice message",
    audio: "Audio",
    document: "Document",
    sticker: "Sticker",
    contact: "Contact",
    location: "Location",
    poll: "Poll",
    reaction: "Reaction",
    deleted: "This message was deleted",
    unavailable: "Message could not be shown",
  },
  fr: {
    image: "Photo",
    video: "Vidéo",
    voice: "Message vocal",
    audio: "Audio",
    document: "Document",
    sticker: "Sticker",
    contact: "Contact",
    location: "Localisation",
    poll: "Sondage",
    reaction: "Réaction",
    deleted: "Ce message a été supprimé",
    unavailable: "Ce message ne peut pas être affiché",
  },
  ar: {
    image: "صورة",
    video: "فيديو",
    voice: "رسالة صوتية",
    audio: "ملف صوتي",
    document: "مستند",
    sticker: "ملصق",
    contact: "جهة اتصال",
    location: "موقع",
    poll: "استطلاع",
    reaction: "تفاعل",
    deleted: "تم حذف هذه الرسالة",
    unavailable: "تعذّر عرض هذه الرسالة",
  },
};

const SAVED_HISTORY = ["Saved history", "Historique enregistré", "السجل المحفوظ"];

/** [stored messageType, body, kind expected, icon expected, label key] */
const MEDIA_ROWS = [
  ["image", "image", "image"],
  ["video", "video", "video"],
  ["audio", "voice", "mic"],
  ["voice", "voice", "mic"],
  ["document", "document", "document"],
  ["sticker", "sticker", "sticker"],
  ["contact", "contact", "contact"],
  ["location", "location", "location"],
  ["poll", "poll", "poll"],
  ["reaction", "reaction", "reaction"],
] as const;

for (const locale of ["ar", "fr", "en"] as const) {
  describe(`messagePreview (${locale})`, () => {
    for (const [messageType, labelKey, icon] of MEDIA_ROWS) {
      it(`${messageType} without caption: icon "${icon}" and its label, never "Saved history"`, () => {
        const preview = messagePreview({ body: "", messageType }, locale);
        expect(preview.icon).toBe(icon);
        expect(preview.label).toBe(LABEL[locale][labelKey]);
        expect(preview.text).toBe(LABEL[locale][labelKey]);
        expect(preview.caption).toBe("");
        for (const phrase of SAVED_HISTORY) expect(preview.text).not.toContain(phrase);
      });

      it(`${messageType} with a caption: the label, then the caption's first line`, () => {
        const preview = messagePreview(
          { body: "\n  Le colis est prêt  \nsecond line", messageType },
          locale,
        );
        expect(preview.label).toBe(LABEL[locale][labelKey]);
        expect(preview.caption).toBe("Le colis est prêt");
        expect(preview.text).toBe(`${LABEL[locale][labelKey]} · Le colis est prêt`);
      });
    }

    it("text: its first non-empty line, trimmed, no icon", () => {
      const preview = messagePreview({ body: "\n\n  Salam  \nsecond line", messageType: "text" }, locale);
      expect(preview).toMatchObject({ kind: "text", icon: null, label: null, text: "Salam" });
    });

    it("a stored type that is missing or unknown still shows the text when there is one", () => {
      expect(messagePreview({ body: "Bonjour" }, locale).text).toBe("Bonjour");
      expect(messagePreview({ body: "Bonjour", messageType: "unknown" }, locale).text).toBe("Bonjour");
      expect(messagePreview({ body: "Bonjour", messageType: null }, locale).kind).toBe("text");
    });

    it("an audio file that is known not to be a voice note says Audio", () => {
      const preview = messagePreview(
        { body: "", messageType: "audio", attachment: { voiceMessage: false } },
        locale,
      );
      expect(preview.label).toBe(LABEL[locale].audio);
      expect(preview.icon).toBe("audio");
      const voice = messagePreview(
        { body: "", messageType: "audio", attachment: { voiceMessage: true } },
        locale,
      );
      expect(voice.label).toBe(LABEL[locale].voice);
    });

    it("deleted: the sentence, even when old text is still stored", () => {
      for (const input of [
        { body: "", messageType: "deleted" },
        { body: "old words", messageType: "revoked" },
        { body: "old words", messageType: "text", deleted: true },
      ]) {
        const preview = messagePreview(input, locale);
        expect(preview).toMatchObject({ kind: "deleted", icon: "deleted", text: LABEL[locale].deleted });
      }
    });

    it("no readable content (empty text, unknown type, undecryptable): 'could not be shown', no jargon", () => {
      for (const input of [
        { body: "", messageType: "text" },
        { body: "   \n ", messageType: "text" },
        { body: "", messageType: "unknown" },
        { body: "", messageType: undefined },
        { body: "", messageType: "undecryptable" },
        { body: "x", messageType: "unavailable" },
        { body: "", messageType: "ciphertext" },
      ]) {
        const preview = messagePreview(input, locale);
        expect(preview, JSON.stringify(input)).toMatchObject({
          kind: "unavailable",
          icon: "unavailable",
          text: LABEL[locale].unavailable,
        });
        expect(preview.text).not.toMatch(/decrypt|cipher|stub|null|undefined|sync|history|historique|السجل/i);
      }
    });

    it("no message at all is its own state with no text, never a stored-history phrase", () => {
      for (const input of [null, undefined]) {
        expect(messagePreview(input, locale)).toMatchObject({ kind: "none", icon: null, text: "" });
      }
    });

    it("a very long single line is cut, not dumped into the row", () => {
      const preview = messagePreview({ body: "a".repeat(5000), messageType: "text" }, locale);
      expect(Array.from(preview.text).length).toBeLessThanOrEqual(161);
      expect(preview.text.endsWith("…")).toBe(true);
    });
  });
}

describe("messagePreview keeps the three languages in step", () => {
  it("every label is non-empty, distinct per kind within a language, and never the saved-history phrase", () => {
    for (const locale of ["ar", "fr", "en"] as const) {
      const values = Object.values(LABEL[locale]);
      for (const value of values) {
        expect(value.length).toBeGreaterThan(0);
        expect(SAVED_HISTORY).not.toContain(value);
      }
      expect(new Set(values).size).toBe(values.length);
    }
  });
});
