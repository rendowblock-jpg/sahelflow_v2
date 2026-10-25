import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { legacyConversationMatch } from "@/lib/search/conversation-search-legacy";
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
