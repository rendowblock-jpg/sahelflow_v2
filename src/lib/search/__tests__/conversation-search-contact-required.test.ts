import { describe, expect, it } from "vitest";

import { contactRequiredTokenStrings, contactTokenStringsOf } from "@/lib/search/conversation-search-tokens";
import { compactSearchText, matchesSearchQuery, normalizeSearchText } from "@/lib/search/universal-search";

/**
 * The query side of the contact tokens (PB-LIST-SEARCH-SPEED). The index must return a SUPERSET of the contacts
 * for which today's matchesSearchQuery is true: every candidate is tested again with matchesSearchQuery, so a
 * false candidate costs one decrypt, but a missing one would be a lost conversation.
 *
 * "Candidate" = the C doc holds EVERY token of at least one group (name, phone or compact). A null answer means
 * "cannot be narrowed": the caller uses the old path, so it can never lose a contact.
 */

type Required = NonNullable<ReturnType<typeof contactRequiredTokenStrings>>;
const requiredOf = (query: string): ReturnType<typeof contactRequiredTokenStrings> =>
  contactRequiredTokenStrings(normalizeSearchText(query), compactSearchText(query));
const holdsAll = (doc: ReadonlySet<string>, group: readonly string[]): boolean => group.every((entry) => doc.has(entry));

/** The superset rule for one contact and one query. Returns a description of a violation, or null. */
function violation(name: string, phone: string, query: string): { narrowed: boolean; problem: string | null } {
  const required = requiredOf(query);
  if (required === null) return { narrowed: false, problem: null };
  const doc = new Set(contactTokenStringsOf(name, phone));
  const compactHeld = required.compact.length > 0 && holdsAll(doc, required.compact);
  if (matchesSearchQuery(query, [name]) && !(holdsAll(doc, required.name) || compactHeld)) {
    return { narrowed: true, problem: `name "${name}" matches "${query}" but its C doc lacks the tokens` };
  }
  if (matchesSearchQuery(query, [phone]) && !(holdsAll(doc, required.phone) || compactHeld)) {
    return { narrowed: true, problem: `phone "${phone}" matches "${query}" but its C doc lacks the tokens` };
  }
  return { narrowed: true, problem: null };
}

describe("contactRequiredTokenStrings: shape", () => {
  it("asks for the 3-character pieces of the folded query, under each family, and of the compact query", () => {
    expect(requiredOf("ali")).toEqual({
      name: ["conv-n:msg-t:ali"],
      phone: ["conv-p:msg-t:ali"],
      compact: ["conv-c:msg-t:ali"],
    });
    const long = requiredOf("Amine");
    expect(long!.name).toEqual(["conv-n:msg-t:ami", "conv-n:msg-t:min", "conv-n:msg-t:ine"]);
  });

  it("asks for the pieces of every word of a several-word query (each word may sit anywhere), and of the glued form", () => {
    const required = requiredOf("ben amine")!;
    expect(required.name.sort()).toEqual(["conv-n:msg-t:ami", "conv-n:msg-t:ben", "conv-n:msg-t:ine", "conv-n:msg-t:min"]);
    expect(required.compact).toContain("conv-c:msg-t:nam"); // "benamine"
  });

  it("cannot narrow an empty, 1-character or 2-character query, nor one whose compact form is too short", () => {
    for (const query of ["", " ", "a", "al", "ab cd", "a-b", "٠٥", "+213"]) {
      expect(requiredOf(query), query).toBeNull();
    }
  });

  it("has no compact group when the query has no letter or digit", () => {
    expect(requiredOf("---")!.compact).toEqual([]);
  });
});

describe("contactRequiredTokenStrings: the superset property on a table", () => {
  const CASES: Array<[name: string, phone: string, query: string]> = [
    // Arabic with the al- prefix, with or without it in the query
    ["الجزائري محمد", "0555123456", "جزائر"],
    ["الجزائري محمد", "0555123456", "الجزائري"],
    ["محمد الجزائري", "0555123456", "ال"],
    ["عبد الرحمن", "0555123456", "الرحمَن"],
    ["عبد الرحمن", "0555123456", "عبد الر"],
    ["عبدالرحمن", "0555123456", "عبد الرحمن"],
    ["فاطمة الزهراء", "0555123456", "فاطمه"],
    ["مصطفى", "0555123456", "مصطفي"],
    ["أحمد بن علي", "0555123456", "علي بن"],
    ["أحمد بن علي", "0555123456", "احمدبن"],
    // Latin with accents and case
    ["Hélène Benamar", "0555123456", "helene"],
    ["Hélène Benamar", "0555123456", "ÉLÈNE"],
    ["Hélène Benamar", "0555123456", "benamar hel"],
    ["Hélène Benamar", "0555123456", "lenebe"],
    ["Amine Ben Ali", "0555123456", "amineben"],
    ["Amine Ben Ali", "0555123456", "benali"],
    ["Amine Ben Ali", "0555123456", "ali-ben"],
    ["Amine Ben Ali", "0555123456", "ben amine"],
    ["Al-Amine O'Brien", "0555123456", "l-am"],
    ["Al-Amine O'Brien", "0555123456", "o’brien"],
    // digits with spaces and country codes
    ["Client", "0555 12 34 56", "555 12"],
    ["Client", "0555 12 34 56", "0555 12 34"],
    ["Client", "0555 12 34 56", "55 12 34"],
    ["Client", "0555 12 34 56", "0555123456"],
    ["Client", "0555 12 34 56", "+213555123456"],
    ["Client", "+213555123456", "0555 12 34 56"],
    ["Client", "+213 555 12 34 56", "555123"],
    ["Client", "00213555123456", "0555-12"],
    ["Client", "213555123456", "٠٥٥٥ ١٢"],
    ["Client", "0555123456", "34 56"],
    // 2 and 3 characters
    ["Amine", "0555123456", "am"],
    ["Amine", "0555123456", "ami"],
    ["Amine", "0555123456", "ine"],
    ["Amine", "0555123456", "55"],
    ["Amine", "0555123456", "555"],
    ["Ali", "0555123456", "ali"],
    ["Ali", "0555123456", "li"],
    // nothing matches
    ["Amine", "0555123456", "zzz"],
    ["Amine", "0555123456", "yacine"],
  ];

  it.each(CASES)("name %s, phone %s, query %s: no matching contact is excluded", (name, phone, query) => {
    expect(violation(name, phone, query).problem).toBeNull();
  });

  it("really narrows the 3-character and longer cases (the table is not passing by saying 'cannot narrow')", () => {
    const narrowed = CASES.filter(([, , query]) => requiredOf(query) !== null).length;
    expect(narrowed).toBeGreaterThan(CASES.length * 0.8);
    expect(requiredOf("am")).toBeNull();
    expect(requiredOf("55")).toBeNull();
  });
});

/** Small seeded generator: the same cases on every run. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LATIN = ["Amine", "Karim", "Yacine", "Nadia", "Fatima Zohra", "Mohamed", "Benali", "Boudiaf", "Hélène", "Mourad", "Sofiane", "Imène", "O'Brien", "Al-Amine", "Ouahiba"];
const ARABIC = ["محمد", "أحمد", "فاطمة", "عبد الرحمن", "بن علي", "الجزائري", "خديجة", "يوسف", "مصطفى", "إبراهيم", "الأمين"];
const GLUE = ["", " ", " ", "-", " ben ", " بن "];

function generate(seed: number, count: number): Array<{ name: string; phone: string; query: string }> {
  const random = mulberry32(seed);
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(random() * list.length)]!;
  const digits = (length: number): string => Array.from({ length }, () => Math.floor(random() * 10)).join("");
  const out: Array<{ name: string; phone: string; query: string }> = [];
  for (let index = 0; index < count; index += 1) {
    const pool = random() < 0.5 ? LATIN : ARABIC;
    const parts = 1 + Math.floor(random() * 3);
    let name = pick(pool);
    for (let part = 1; part < parts; part += 1) name += pick(GLUE) + pick(random() < 0.8 ? pool : LATIN);
    const local = `05${pick(["5", "6", "7"])}${digits(7)}`;
    const phone = pick([
      local,
      `${local.slice(0, 4)} ${local.slice(4, 6)} ${local.slice(6, 8)} ${local.slice(8)}`,
      `+213${local.slice(1)}`,
      `+213 ${local.slice(1, 4)} ${local.slice(4, 6)} ${local.slice(6, 8)} ${local.slice(8)}`,
      `00213${local.slice(1)}`,
      `${local.slice(0, 4)}-${local.slice(4, 6)}-${local.slice(6)}`,
    ]);
    const kind = Math.floor(random() * 6);
    const sliceOf = (text: string): string => {
      const start = Math.floor(random() * text.length);
      return text.slice(start, start + 1 + Math.floor(random() * 8));
    };
    let query: string;
    if (kind === 0) query = sliceOf(name);
    else if (kind === 1) query = sliceOf(name).toUpperCase();
    else if (kind === 2) query = sliceOf(name).replace(/[\s-]+/gu, "");
    else if (kind === 3) query = sliceOf(phone);
    else if (kind === 4) query = sliceOf(phone).replace(/\D+/gu, "");
    else {
      const words = name.split(/[\s-]+/u).filter(Boolean);
      query = random() < 0.5 ? [...words].reverse().join(" ") : `${pick(words)} ${sliceOf(pick(words))}`;
    }
    out.push({ name, phone, query });
  }
  return out;
}

describe("contactRequiredTokenStrings: the superset property on generated cases", () => {
  it("300 generated cases: every contact that matchesSearchQuery holds the required tokens (0 failures)", () => {
    const cases = generate(20261025, 300);
    const failures = cases.map((c) => violation(c.name, c.phone, c.query)).filter((result) => result.problem !== null);
    const narrowed = cases.filter((c) => requiredOf(c.query) !== null).length;
    const matched = cases.filter((c) => matchesSearchQuery(c.query, [c.name]) || matchesSearchQuery(c.query, [c.phone])).length;
    process.stdout.write(`SUPERSET_REPORT cases=300 matched=${matched} narrowed=${narrowed} failures=${failures.length}\n`);
    expect(failures.map((result) => result.problem)).toEqual([]);
    expect(matched).toBeGreaterThan(150);
    expect(narrowed).toBeGreaterThan(150);
  });

  it("5,000 more cases from other seeds: 0 failures", () => {
    let failures = 0;
    let matched = 0;
    for (const seed of [1, 7, 42, 2026, 99991]) {
      for (const c of generate(seed, 1000)) {
        if (matchesSearchQuery(c.query, [c.name]) || matchesSearchQuery(c.query, [c.phone])) matched += 1;
        if (violation(c.name, c.phone, c.query).problem !== null) failures += 1;
      }
    }
    process.stdout.write(`SUPERSET_REPORT cases=5000 matched=${matched} failures=${failures}\n`);
    expect(failures).toBe(0);
    expect(matched).toBeGreaterThan(2500);
  });
});
