import { describe, expect, it } from "vitest";

import { matchesComboboxQuery } from "@/components/shared/combobox/search-match";
import { searchHighlightRanges } from "@/lib/search/search-highlight";
import {
  compactSearchText,
  normalizeSearchText,
  rankUniversalSearchCandidates,
} from "@/lib/search/universal-search";

/**
 * Corpus of the spellings Algerian sellers really type. Each row is
 * [group, name stored in the shop, what the seller types, how it must match].
 * "text" rows compare the folded words; "phone" rows compare the compact form
 * (digits and letters only, +213 / 00213 / 213 read as the national 0).
 */
type Mode = "text" | "phone";
const MATCHES: ReadonlyArray<readonly [string, string, string, Mode]> = [
  // 1. Diacritics (harakat, tanwin, shadda, dagger alef) and bidi marks.
  ["diacritics", "أحمد", "أَحْمَد", "text"],
  ["diacritics", "محمد", "مُحَمَّد", "text"],
  ["diacritics", "مُحَمَّد", "محمد", "text"],
  ["diacritics", "كتابا", "كِتَابًا", "text"],
  ["diacritics", "هذا", "هٰذا", "text"],
  ["diacritics", "أحمد", "\u200Eأحمد\u200F", "text"],
  ["diacritics", "أحمد بن علي", "\u202Bأحمد\u202C بن علي", "text"],
  ["diacritics", "أحمد", "\u2066أحمد\u2069", "text"],
  // 2. Tatweel.
  ["tatweel", "أحمد", "أحمـــد", "text"],
  ["tatweel", "محمد", "مـحـمـد", "text"],
  ["tatweel", "أحمـد", "احمد", "text"],
  ["tatweel", "عبد الرحمن", "عبــد الرحمــن", "text"],
  // 3. Alef forms, ya / alef maqsura, ta marbuta / ha, hamza on waw and ya.
  ["letters", "أحمد", "احمد", "text"],
  ["letters", "احمد", "أحمد", "text"],
  ["letters", "إبراهيم", "ابراهيم", "text"],
  ["letters", "آمنة", "امنه", "text"],
  ["letters", "ٱبن", "ابن", "text"],
  ["letters", "مصطفى", "مصطفي", "text"],
  ["letters", "موسى", "موسي", "text"],
  ["letters", "فاطمة", "فاطمه", "text"],
  ["letters", "مدرسه", "مدرسة", "text"],
  ["letters", "مؤمن", "مومن", "text"],
  ["letters", "رئيس", "رييس", "text"],
  ["letters", "عائشة", "عايشه", "text"],
  ["letters", "کریم", "كريم", "text"],
  // 4. Digits and phone forms.
  ["phones", "0655123456", "0655 12 34 56", "phone"],
  ["phones", "0655123456", "+213 655 12 34 56", "phone"],
  ["phones", "0655123456", "00213655123456", "phone"],
  ["phones", "0655123456", "٠٦٥٥١٢٣٤٥٦", "phone"],
  ["phones", "0655123456", "۰۶۵۵۱۲۳۴۵۶", "phone"],
  ["phones", "0655123456", "+213 (0) 655 12 34 56", "phone"],
  ["phones", "0655123456", "0655-12-34-56", "phone"],
  ["phones", "+213655123456", "0655 12 34 56", "phone"],
  ["phones", "213655123456", "0655123456", "phone"],
  ["phones", "ORD-2026-0012", "ord-٢٠٢٦-٠٠١٢", "phone"],
  ["phones", "SKU-0012", "sku 0012", "phone"],
  // 5. French accents and case.
  ["french", "Décoratif", "decoratif", "text"],
  ["french", "ÉCOLE", "ecole", "text"],
  ["french", "Hélène", "HELENE", "text"],
  ["french", "Crème brûlée", "creme brulee", "text"],
  ["french", "L’Oréal", "l'oreal", "text"],
  ["french", "Çevik", "cevik", "text"],
  ["french", "Zoë", "zoe", "text"],
  ["french", "İstanbul", "istanbul", "text"],
];

/** Pairs that must stay different: folding must not merge real differences. */
const MISSES: ReadonlyArray<readonly [string, string]> = [
  ["0655123456", "0655123457"],
  ["0655123456", "0755123456"],
  ["أحمد", "محمد"],
  ["213456789", "0456789"],
  ["Helene", "Hélas"],
];

const comparable = (value: string, mode: Mode) =>
  mode === "phone" ? compactSearchText(value) : normalizeSearchText(value);

const GROUPS = [...new Set(MATCHES.map(([group]) => group))];

describe("Arabic / French search folding corpus", () => {
  it("has at least 30 cases in 5 groups", () => {
    expect(MATCHES.length).toBeGreaterThanOrEqual(30);
    expect(GROUPS).toHaveLength(5);
  });

  describe.each(GROUPS)("%s", (group) => {
    const rows = MATCHES.filter(([name]) => name === group);

    it.each(rows)(
      "normalizer: %s stored %j typed %j",
      (_group, stored, typed, mode) => {
        expect(comparable(typed, mode)).toBe(comparable(stored, mode));
      },
    );

    it.each(rows)(
      "ranker finds it: %s stored %j typed %j",
      (_group, stored, typed, mode) => {
        const candidate =
          mode === "phone"
            ? { id: "c", kind: "customer" as const, label: "Client", sublabel: stored, href: "/c" }
            : { id: "c", kind: "customer" as const, label: stored, href: "/c" };
        expect(rankUniversalSearchCandidates(typed, [candidate], 5)).toHaveLength(1);
      },
    );

    it.each(rows)(
      "picker predicate finds it: %s stored %j typed %j",
      (_group, stored, typed) => {
        expect(matchesComboboxQuery(typed, [stored])).toBe(true);
      },
    );

    it.each(rows.filter(([, , , mode]) => mode === "text"))(
      "highlight marks it: %s stored %j typed %j",
      (_group, stored, typed) => {
        expect(searchHighlightRanges(stored, typed).length).toBeGreaterThan(0);
      },
    );
  });

  it.each(MISSES)("keeps %j and %j apart", (stored, typed) => {
    const candidate = { id: "c", kind: "customer" as const, label: "Client", sublabel: stored, href: "/c" };
    expect(rankUniversalSearchCandidates(typed, [candidate], 5)).toHaveLength(0);
    expect(matchesComboboxQuery(typed, [stored])).toBe(false);
  });

  it("finds a partial name inside a realistic customer list, whatever the spelling", () => {
    const customers = [
      { id: "a", kind: "customer" as const, label: "أحمد بن علي", sublabel: "0655123456", href: "/a" },
      { id: "f", kind: "customer" as const, label: "فاطمة الزهراء", sublabel: "0770112233", href: "/f" },
      { id: "m", kind: "customer" as const, label: "مصطفى بوعلام", sublabel: "0550998877", href: "/m" },
      { id: "h", kind: "customer" as const, label: "Hélène Dupont", sublabel: "0661000111", href: "/h" },
    ];
    const top = (query: string) =>
      rankUniversalSearchCandidates(query, customers, 5)[0]?.id;
    expect(top("احمد")).toBe("a");
    expect(top("اَحمد بن")).toBe("a");
    expect(top("فاطمه")).toBe("f");
    expect(top("الزهراء فاطمه")).toBe("f");
    expect(top("مصطفي")).toBe("m");
    expect(top("+213 550 99 88 77")).toBe("m");
    expect(top("٠٧٧٠١١٢٢٣٣")).toBe("f");
    expect(top("helene")).toBe("h");
  });

  it("keeps the old letters when asked to (tokens already stored in the search index)", () => {
    expect(normalizeSearchText("فاطمة", { foldLetters: false })).toBe("فاطمة");
    expect(compactSearchText("+213 655 12 34 56", { nationalPhone: false })).toBe("213655123456");
  });
});
