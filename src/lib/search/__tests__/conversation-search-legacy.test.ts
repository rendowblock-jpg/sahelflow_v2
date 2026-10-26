import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { legacyConversationMatch, messageBodyMatches } from "@/lib/search/conversation-search-legacy";
import { normalizeSearchText } from "@/lib/search/universal-search";

/**
 * PB-CONV-SEARCH-LOAD, slice 4: the one predicate of today's conversation search. The route (old path) and the
 * check of every index candidate call it, so the indexed search cannot show a result the old one would not.
 */
const match = (
  rawQuery: string,
  fields: { name?: string; phone?: string | null; bodies?: Array<string | null>; canReadContact?: boolean },
) =>
  legacyConversationMatch({
    query: normalizeSearchText(rawQuery),
    canReadContact: fields.canReadContact ?? true,
    contactName: fields.name ?? "Karim Bensalem",
    contactPhone: fields.phone === undefined ? "0555123456" : fields.phone,
    messageBodies: fields.bodies ?? [],
  });

describe("legacyConversationMatch", () => {
  it("answers name, phone, message or null", () => {
    expect(match("karim", { bodies: ["salam"] })).toBe("name");
    expect(match("0555123456", { bodies: ["salam"] })).toBe("phone");
    expect(match("livraison", { bodies: ["salam", "livraison à Oran"] })).toBe("message");
    expect(match("zerdoukhane", { bodies: ["salam", "livraison à Oran"] })).toBeNull();
  });

  it("prefers name over phone over message", () => {
    expect(match("amine", { name: "Amine", phone: "Amine", bodies: ["amine"] })).toBe("name");
    expect(match("0555", { name: "Karim", phone: "0555123456", bodies: ["0555 sur WhatsApp"] })).toBe("phone");
  });

  it("without the right to read the contact, name and phone never match", () => {
    expect(match("karim", { canReadContact: false, bodies: ["salam"] })).toBeNull();
    expect(match("0555123456", { canReadContact: false, bodies: ["salam"] })).toBeNull();
    expect(match("karim", { canReadContact: false, bodies: ["merci karim"] })).toBe("message");
  });

  it("folds accents on both sides", () => {
    expect(match("helene", { name: "Hélène Benkhalifa", phone: null })).toBe("name");
    expect(match("bejaia", { name: "Sofiane", bodies: ["colis arrivé à Béjaïa"] })).toBe("message");
  });

  it("reads Arabic with and without the al- prefix as plain substring text", () => {
    // The query without al- is inside the word with al-; the other way round it is not.
    expect(match("كتاب", { name: "Sofiane", bodies: ["الكتاب وصل"] })).toBe("message");
    expect(match("الكتاب", { name: "Sofiane", bodies: ["كتاب وصل"] })).toBeNull();
    expect(match("امين", { name: "محمد الأمين", phone: null })).toBe("name");
    expect(match("الامين", { name: "محمد أمين", phone: null })).toBeNull();
  });

  it("finds a phone typed with a separator, +213 or 00213 as the national number", () => {
    for (const typed of ["0555 12 34 56", "+213555123456", "+213 555 12 34 56", "00213555123456", "213555123456", "555123456", "0555-12"]) {
      expect(match(typed, { name: "Sofiane", bodies: [] }), typed).toBe("phone");
    }
    expect(match("0556123456", { name: "Sofiane", bodies: [] })).toBeNull();
  });

  it("treats a missing body as empty text and an empty query as no match", () => {
    expect(match("salam", { name: "Sofiane", phone: null, bodies: [null, "salam"] })).toBe("message");
    expect(match("salam", { name: "Sofiane", phone: null, bodies: [null] })).toBeNull();
    expect(match("   ", { bodies: ["salam"] })).toBeNull();
  });
});

describe("the conversation search", () => {
  it("decides every match, indexed or not, through legacyConversationMatch", () => {
    const query = readFileSync(join(process.cwd(), "src/lib/search/conversation-search-query.ts"), "utf8");
    expect(query).toContain("legacyConversationMatch(");
    expect(query).not.toContain("matchesSearchQuery(");
    const route = readFileSync(join(process.cwd(), "src/app/api/conversations/search/route.ts"), "utf8");
    expect(route).not.toContain("matchesSearchQuery(");
  });
});

describe("messageBodyMatches: the one message rule of the old path and the index path", () => {
  it("3 or more characters: the folded query anywhere in the folded body", () => {
    expect(messageBodyMatches("liv", "la livraison")).toBe(true);
    expect(messageBodyMatches("ais", "la livraison")).toBe(true);
    expect(messageBodyMatches("a l", "la livraison")).toBe(true);
    expect(messageBodyMatches("xyz", "la livraison")).toBe(false);
  });
  it("1 or 2 characters: the start of a word, never the middle of one", () => {
    expect(messageBodyMatches("li", "la livraison")).toBe(true);
    expect(messageBodyMatches("la", "la livraison")).toBe(true);
    expect(messageBodyMatches("l", "la livraison")).toBe(true);
    expect(messageBodyMatches("ra", "la livraison")).toBe(false);
    expect(messageBodyMatches("on", "la livraison")).toBe(false);
    expect(messageBodyMatches("a", "la livraison")).toBe(false);
    expect(messageBodyMatches("ال", "هذا التوصيل")).toBe(true);
    expect(messageBodyMatches("وص", "هذا التوصيل")).toBe(false);
    expect(messageBodyMatches("li", null)).toBe(false);
  });
  it("legacyConversationMatch uses it: a 2-character query no longer finds a message mid-word", () => {
    const base = { canReadContact: true, contactName: "Amine", contactPhone: null, messageBodies: ["la livraison"] };
    expect(legacyConversationMatch({ ...base, query: "ra" })).toBeNull();
    expect(legacyConversationMatch({ ...base, query: "li" })).toBe("message");
  });
});
