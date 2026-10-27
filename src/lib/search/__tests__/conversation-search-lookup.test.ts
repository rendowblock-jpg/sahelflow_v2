import { describe, expect, it } from "vitest";

import { messageBodyMatches } from "@/lib/search/conversation-search-legacy";
import { DEFAULT_LOOKUP_MAX, pickLookupTokens } from "@/lib/search/conversation-search-lookup";
import { contactRequiredTokenStrings, contactTokenStringsOf, requiredTokenStringsOf, tokenStringsOf } from "@/lib/search/conversation-search-tokens";
import { compactSearchText, matchesSearchQuery, normalizeSearchText } from "@/lib/search/universal-search";

/**
 * Any subset of the required tokens is a valid filter: every required token is necessary for a match, so fewer of
 * them can only add false candidates (the shared predicate drops those on the opened text), never lose a true one.
 */
const list = (count: number) => Array.from({ length: count }, (_, at) => `t${at}`);

describe("pickLookupTokens", () => {
  it("returns a list that is not longer than max unchanged", () => {
    const strings = list(3);
    expect(pickLookupTokens(strings, 3)).toEqual(strings);
    expect(pickLookupTokens(strings, 10)).toEqual(strings);
    expect(pickLookupTokens([], 3)).toEqual([]);
    expect(strings).toEqual(list(3)); // the input is never changed
  });

  it("spreads the picks over the list: first, middle, last", () => {
    expect(pickLookupTokens(list(9), 3)).toEqual(["t0", "t4", "t8"]);
    expect(pickLookupTokens(list(5), 3)).toEqual(["t0", "t2", "t4"]);
    expect(pickLookupTokens(list(7), 2)).toEqual(["t0", "t6"]);
    expect(pickLookupTokens(list(12), 4)).toEqual(["t0", "t4", "t7", "t11"]);
    expect(pickLookupTokens(list(12), 1)).toEqual(["t0"]);
  });

  it("is deterministic, order-preserving, distinct, at most max, and always from the list", () => {
    for (let count = 0; count <= 40; count += 1) {
      const strings = list(count);
      for (let max = 1; max <= 12; max += 1) {
        const picked = pickLookupTokens(strings, max);
        expect(picked).toEqual(pickLookupTokens(strings, max));
        expect(picked.length).toBe(Math.min(count, max));
        const places = picked.map((entry) => strings.indexOf(entry));
        expect(places.every((place) => place >= 0)).toBe(true); // nothing that is not in the list
        expect(places).toEqual([...places].sort((a, b) => a - b));
        expect(new Set(places).size).toBe(places.length);
        if (count > 0) expect(places[0]).toBe(0);
        if (count > max && max >= 2) expect(places[places.length - 1]).toBe(count - 1);
      }
    }
  });

  it("never returns an empty answer for a non-empty list (an empty lookup would find nothing)", () => {
    for (const max of [0, -3, Number.NaN, 0.4]) expect(pickLookupTokens(list(6), max).length).toBeGreaterThanOrEqual(1);
    expect(pickLookupTokens(list(6), Number.POSITIVE_INFINITY)).toEqual(list(6));
    expect(DEFAULT_LOOKUP_MAX).toBeGreaterThanOrEqual(2);
    expect(DEFAULT_LOOKUP_MAX).toBeLessThanOrEqual(4); // the subset is the speed-up: a default of "all" would undo it
  });
});

function random(seed0: number): () => number {
  let state = seed0 >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const LETTERS = ["a", "b", "e", "i", "l", "m", "n", "o", "r", "s", "t", "é", "à", "ç", "0", "5", "-", "+", "'", "ب", "م", "ع", "ل", "😀", "ß"];

describe("every picked token is in the tokens of a body that matches (property)", () => {
  it("message bodies: 4000 generated bodies and queries, K = 1 to 5", () => {
    const next = random(57);
    const pick = <T,>(items: readonly T[]) => items[Math.floor(next() * items.length)]!;
    const word = () => Array.from({ length: 1 + Math.floor(next() * 11) }, () => pick(LETTERS)).join("");
    let matched = 0;
    let multiWord = 0;
    for (let round = 0; round < 4000; round += 1) {
      const raw = Array.from({ length: 1 + Math.floor(next() * 6) }, word).join(next() < 0.1 ? "  " : " ");
      const folded = normalizeSearchText(raw);
      const stored = new Set(tokenStringsOf(folded));
      // Most queries are cut out of the body (a real hit); some are made up; some are 1 or 2 characters.
      const start = Math.floor(next() * folded.length);
      const length = 1 + Math.floor(next() * 14);
      const query = normalizeSearchText(next() < 0.8 ? folded.slice(start, start + length) : Array.from({ length: 1 + Math.floor(next() * 9) }, () => pick(LETTERS)).join(""));
      if (!query || !messageBodyMatches(query, folded)) continue;
      const required = requiredTokenStrings(query);
      if (required.length === 0) continue;
      matched += 1;
      if (query.includes(" ")) multiWord += 1;
      for (let max = 1; max <= 5; max += 1) {
        const missing = pickLookupTokens(required, max).filter((entry) => !stored.has(entry));
        expect(missing, `query ${JSON.stringify(query)} in body ${JSON.stringify(folded)}, K=${max}`).toEqual([]);
      }
    }
    expect(matched).toBeGreaterThan(1500);
    expect(multiWord).toBeGreaterThan(100);
  });

  it("contacts: a name or phone the query matches keeps one group whose picked tokens are all in the document", () => {
    const next = random(1957);
    const pick = <T,>(items: readonly T[]) => items[Math.floor(next() * items.length)]!;
    const word = () => Array.from({ length: 2 + Math.floor(next() * 9) }, () => pick(LETTERS)).join("");
    let matched = 0;
    for (let round = 0; round < 3000; round += 1) {
      const name = `${word()} ${word()}`;
      const phone = next() < 0.8 ? `${pick(["0555", "0661", "+213 555 ", "05 50 "])}${Math.floor(next() * 1_000_000)}` : null;
      const stored = new Set(contactTokenStringsOf(name, phone));
      const field = next() < 0.5 || phone === null ? name : phone;
      const folded = normalizeSearchText(field);
      const start = Math.floor(next() * folded.length);
      const query = normalizeSearchText(folded.slice(start, start + 3 + Math.floor(next() * 10)));
      if (!query || !matchesSearchQuery(query, [name]) && !matchesSearchQuery(query, [phone])) continue;
      const groups = contactRequiredTokenStrings(query, compactSearchText(query));
      if (groups === null) continue;
      matched += 1;
      for (let max = 1; max <= 5; max += 1) {
        const held = [groups.name, groups.phone, groups.compact].filter((group) => group.length > 0).some((group) => pickLookupTokens(group, max).every((entry) => stored.has(entry)));
        expect(held, `query ${JSON.stringify(query)} for ${JSON.stringify([name, phone])}, K=${max}`).toBe(true);
      }
    }
    expect(matched).toBeGreaterThan(1000);
  });
});

const requiredTokenStrings = requiredTokenStringsOf;
