import { describe, expect, it } from "vitest";

import {
  conversationAvatarInitial,
  conversationDisplayPhone,
  conversationDisplayTitle,
  conversationSafeLabel,
} from "@/lib/inbox/conversation-title";

// F-0028: the Founder's installed Internal.48 showed raw ids as conversation
// titles ("202460866064562@lid") and a digit in the avatar circle.
const RAW_ID = /\d{8,}@(lid|s\.whatsapp\.net|g\.us)/;
const LRI = "\u2066";
const PDI = "\u2069";

const LID = "202460866064562@lid";
const LID2 = "54783113175105@lid";
const PN = "213791999157@s.whatsapp.net";
const PN_DEVICE = "213791999157:12@s.whatsapp.net";
const GROUP = "120363025123456789@g.us";

type Row = {
  label: string;
  input: Parameters<typeof conversationDisplayTitle>[0];
  expected: string;
};

const TITLE_TABLE: Row[] = [
  // known name wins, in every locale and whatever the id is
  { label: "known name beats a LID", input: { name: "Amina B.", sourceId: LID, locale: "en" }, expected: "Amina B." },
  { label: "known Arabic name beats a PN", input: { name: "أمينة بن علي", sourceId: PN, locale: "ar" }, expected: "أمينة بن علي" },
  { label: "known name with no id", input: { name: "Karim", locale: "fr" }, expected: "Karim" },
  { label: "name is trimmed and whitespace collapsed", input: { name: "  Nadia   Belkacem \n", sourceId: LID, locale: "en" }, expected: "Nadia Belkacem" },
  // phone number from a phone-number JID only
  { label: "PN, no name (en)", input: { name: "", sourceId: PN, locale: "en" }, expected: "+213 791 99 91 57" },
  { label: "PN with device suffix (fr)", input: { name: null, sourceId: PN_DEVICE, locale: "fr" }, expected: "+213 791 99 91 57" },
  { label: "PN in Arabic is isolated left-to-right", input: { name: "", sourceId: PN, locale: "ar" }, expected: `${LRI}+213 791 99 91 57${PDI}` },
  { label: "stored name equal to the PN digits is the number", input: { name: "213791999157", sourceId: PN, locale: "en" }, expected: "+213 791 99 91 57" },
  { label: "stored name equal to the whole PN jid", input: { name: PN, sourceId: PN, locale: "en" }, expected: "+213 791 99 91 57" },
  { label: "Algerian landline (8 digits after 213)", input: { name: "", sourceId: "21321123456@s.whatsapp.net", locale: "en" }, expected: "+213 21 12 34 56" },
  { label: "French number", input: { name: "", sourceId: "33612345678@s.whatsapp.net", locale: "en" }, expected: "+33 6 12 34 56 78" },
  { label: "Moroccan number", input: { name: "", sourceId: "212612345678@s.whatsapp.net", locale: "en" }, expected: "+212 612 345 678" },
  { label: "US number", input: { name: "", sourceId: "14155552671@s.whatsapp.net", locale: "en" }, expected: "+1 415 555 2671" },
  { label: "unknown country code still gets a + and groups", input: { name: "", sourceId: "998901234567@s.whatsapp.net", locale: "en" }, expected: "+998 901 234 567" },
  // LID: no phone can be derived
  { label: "LID (en)", input: { name: "", sourceId: LID, locale: "en" }, expected: "Unknown contact ·4562" },
  { label: "LID (fr)", input: { name: "", sourceId: LID, locale: "fr" }, expected: "Contact inconnu ·4562" },
  { label: "LID (ar)", input: { name: "", sourceId: LID, locale: "ar" }, expected: "جهة اتصال غير معروفة ·4562" },
  { label: "second LID has its own suffix", input: { name: null, sourceId: LID2, locale: "en" }, expected: "Unknown contact ·5105" },
  { label: "LID with device suffix keeps the same suffix", input: { name: "", sourceId: "202460866064562:7@lid", locale: "en" }, expected: "Unknown contact ·4562" },
  { label: "stored name IS the raw LID (what Internal.48 writes)", input: { name: LID, sourceId: LID, locale: "en" }, expected: "Unknown contact ·4562" },
  { label: "stored name is the LID digits only (ensureConversationForJid)", input: { name: "202460866064562", sourceId: LID, locale: "en" }, expected: "Unknown contact ·4562" },
  { label: "raw LID in the name, source id missing (fallback projection)", input: { name: LID2, sourceId: null, locale: "fr" }, expected: "Contact inconnu ·5105" },
  { label: "unknown locale falls back to English", input: { name: "", sourceId: LID, locale: "de" }, expected: "Unknown contact ·4562" },
  // groups
  { label: "group without subject (en)", input: { name: "", sourceId: GROUP, locale: "en" }, expected: "Group ·6789" },
  { label: "group without subject (fr)", input: { name: GROUP, sourceId: GROUP, locale: "fr" }, expected: "Groupe ·6789" },
  { label: "group without subject (ar)", input: { name: "", sourceId: GROUP, locale: "ar" }, expected: "مجموعة ·6789" },
  { label: "group with a known subject", input: { name: "", sourceId: GROUP, groupSubject: "Livraison Alger", locale: "fr" }, expected: "Livraison Alger" },
  { label: "group name wins over subject", input: { name: "Famille", sourceId: GROUP, groupSubject: "Livraison Alger", locale: "fr" }, expected: "Famille" },
  { label: "old-style group id with a dash", input: { name: "", sourceId: "213791999157-1456789012@g.us", locale: "en" }, expected: "Group ·9012" },
  // empty and odd input
  { label: "empty string, no id", input: { name: "", sourceId: "", locale: "en" }, expected: "Unknown contact" },
  { label: "nothing at all (ar)", input: { locale: "ar" }, expected: "جهة اتصال غير معروفة" },
  { label: "whitespace only name", input: { name: "   ", sourceId: null, locale: "fr" }, expected: "Contact inconnu" },
  { label: "non-JID source id with no digits", input: { name: "", sourceId: "conv_abc", locale: "en" }, expected: "Unknown contact" },
];

describe("conversationDisplayTitle (F-0028)", () => {
  it.each(TITLE_TABLE)("$label", ({ input, expected }) => {
    expect(conversationDisplayTitle(input)).toBe(expected);
  });

  it("never lets a raw jid or lid through, whatever the input", () => {
    const names = ["", LID, LID2, PN, PN_DEVICE, GROUP, "202460866064562", "status@broadcast", "Amina"];
    const ids = [null, "", LID, LID2, PN, PN_DEVICE, GROUP, "conv_1"];
    for (const locale of ["ar", "fr", "en"]) {
      for (const name of names) {
        for (const sourceId of ids) {
          const title = conversationDisplayTitle({ name, sourceId, locale });
          expect(title, `${locale} | ${name} | ${sourceId}`).not.toMatch(RAW_ID);
          expect(title).not.toContain("@");
          expect(title).not.toMatch(/\d{9,}/);
        }
      }
    }
  });

  it("keeps a very long real name whole (the row truncates with CSS)", () => {
    const long = `Mohamed-Amine ${"Benabdellah ".repeat(40)}`.trim();
    expect(conversationDisplayTitle({ name: long, sourceId: LID, locale: "en" })).toBe(
      long.replace(/\s+/g, " "),
    );
  });

  it("does not take a 40-digit run for a phone number", () => {
    const title = conversationDisplayTitle({ name: "1".repeat(40), sourceId: LID, locale: "en" });
    expect(title).toBe("Unknown contact ·4562");
  });

  it("is the same answer for the same input (stable suffix)", () => {
    const a = conversationDisplayTitle({ name: "", sourceId: LID, locale: "en" });
    const b = conversationDisplayTitle({ name: LID, sourceId: LID, locale: "en" });
    expect(a).toBe(b);
  });
});

describe("conversationAvatarInitial (F-0028)", () => {
  it.each([
    ["Amina B.", LID, "A"],
    ["amine", PN, "A"],
    ["أمينة", LID, "أ"],
    ["  zoubir", null, "Z"],
    ["7 Stars Shop", LID, "S"],
    ["😀 Bob", LID, "B"],
  ])("named contact %s gets a letter", (name, sourceId, expected) => {
    expect(conversationAvatarInitial({ name, sourceId, locale: "en" })).toBe(expected);
  });

  it.each([
    ["raw LID name", LID, LID],
    ["second raw LID name", LID2, LID2],
    ["empty name on a LID", "", LID],
    ["empty name on a PN", "", PN],
    ["empty name on a group", "", GROUP],
    ["digits-only name", "1234567", null],
    ["emoji-only name", "😀", LID],
  ])("%s never gets a digit (person glyph = null)", (_label, name, sourceId) => {
    const initial = conversationAvatarInitial({ name, sourceId, locale: "en" });
    expect(initial).toBeNull();
  });
});

describe("conversationDisplayPhone / conversationSafeLabel", () => {
  it("formats a real phone and hides a LID that was stored as a phone", () => {
    expect(conversationDisplayPhone({ phone: "213791999157", sourceId: PN })).toBe("+213 791 99 91 57");
    expect(conversationDisplayPhone({ phone: "202460866064562", sourceId: LID })).toBeNull();
    expect(conversationDisplayPhone({ phone: null, sourceId: PN })).toBe("+213 791 99 91 57");
    expect(conversationDisplayPhone({ phone: null, sourceId: LID })).toBeNull();
    expect(conversationDisplayPhone({ phone: "", sourceId: null })).toBeNull();
  });

  it("gives a locale-free safe label for server-side surfaces", () => {
    expect(conversationSafeLabel({ name: "Amina B.", sourceId: LID })).toBe("Amina B.");
    expect(conversationSafeLabel({ name: LID, sourceId: LID })).toBeNull();
    expect(conversationSafeLabel({ name: "", sourceId: PN })).toBe("+213 791 99 91 57");
    expect(conversationSafeLabel({ name: "202460866064562", sourceId: LID })).toBeNull();
  });
});
