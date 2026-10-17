import { describe, expect, it } from "vitest";

import {
  boundedEditDistance,
  canOpenProtectedOperationalDetail,
  compactSearchText,
  mergeUniversalSearchFamilies,
  messageExcerpt,
  normalizeSearchText,
  rankUniversalSearchCandidates,
  scoreUniversalSearchCandidate,
  typoBackoffQueries,
  type UniversalSearchCandidate,
} from "../universal-search";

describe("universal search normalization and ranking", () => {
  it("normalizes Arabic/French marks, Arabic digits, tatweel and compatibility forms", () => {
    expect(normalizeSearchText("  طَــلَب ٠١٢٣  ")).toBe("طلب 0123");
    expect(normalizeSearchText("۱۲۳۴")).toBe("1234");
    expect(normalizeSearchText("أَحْمَد")).toBe("احمد");
    expect(normalizeSearchText("Béjaïa")).toBe("bejaia");
    expect(compactSearchText("0555 12-34-56")).toBe("0555123456");
  });

  it("does not match a one-letter query against keyword contains", () => {
    const accounting: UniversalSearchCandidate = {
      id: "accounting",
      kind: "navigation",
      label: "المحاسبة",
      href: "/accounting",
      keywords: ["money", "finance", "accounting", "profit"],
    };
    expect(scoreUniversalSearchCandidate("g", accounting)).toBe(0);
    expect(scoreUniversalSearchCandidate("acc", accounting)).toBeGreaterThan(0);
  });

  it("ranks exact primary matches above metadata, prefixes and contains", () => {
    const exact: UniversalSearchCandidate = {
      id: "exact",
      kind: "order",
      label: "DZ-00123",
      href: "/orders/exact",
    };
    const metadata: UniversalSearchCandidate = {
      id: "metadata",
      kind: "customer",
      label: "Nabil Ouali",
      sublabel: "DZ-00123",
      href: "/customers/metadata",
    };
    const prefix: UniversalSearchCandidate = {
      id: "prefix",
      kind: "order",
      label: "DZ-00123-EXTRA",
      href: "/orders/prefix",
    };
    const contains: UniversalSearchCandidate = {
      id: "contains",
      kind: "product",
      label: "Bundle DZ-00123 Black",
      href: "/products/contains",
    };

    expect(scoreUniversalSearchCandidate("DZ-00123", exact)).toBeGreaterThan(
      scoreUniversalSearchCandidate("DZ-00123", metadata),
    );
    expect(scoreUniversalSearchCandidate("DZ-00123", metadata)).toBeGreaterThan(
      scoreUniversalSearchCandidate("DZ-00123", prefix),
    );
    expect(scoreUniversalSearchCandidate("DZ-00123", prefix)).toBeGreaterThan(
      scoreUniversalSearchCandidate("DZ-00123", contains),
    );
  });

  it("matches phone formatting without requiring identical punctuation", () => {
    const customer: UniversalSearchCandidate = {
      id: "customer:1",
      kind: "customer",
      label: "Nabil Ouali",
      sublabel: "0660 001 114",
      href: "/customers/1",
    };

    expect(scoreUniversalSearchCandidate("0660001114", customer)).toBeGreaterThan(0);
    expect(scoreUniversalSearchCandidate("٠٦٦٠٠٠١١١٤", customer)).toBeGreaterThan(0);
  });

  it("matches Arabic and French names without requiring identical marks", () => {
    const candidates: UniversalSearchCandidate[] = [
      {
        id: "arabic",
        kind: "customer",
        label: "أحمد بن علي",
        href: "/customers/arabic",
      },
      {
        id: "wilaya",
        kind: "customer",
        label: "Client Béjaïa",
        href: "/customers/wilaya",
      },
    ];

    expect(rankUniversalSearchCandidates("احمد", candidates, 2)[0]?.id).toBe(
      "arabic",
    );
    expect(rankUniversalSearchCandidates("bejaia", candidates, 2)[0]?.id).toBe(
      "wilaya",
    );
  });

  it("ranks one unified result set instead of giving every family equal position", () => {
    const candidates: UniversalSearchCandidate[] = [
      {
        id: "customer:weak",
        kind: "customer",
        label: "Customer 0001",
        href: "/customers/weak",
      },
      {
        id: "product:weak",
        kind: "product",
        label: "Bundle 0001",
        href: "/products/weak",
      },
      {
        id: "order:exact",
        kind: "order",
        label: "0001",
        href: "/orders/exact",
      },
    ];

    expect(
      rankUniversalSearchCandidates("0001", candidates, 3).map(
        (item) => item.id,
      ),
    ).toEqual(["order:exact", "customer:weak", "product:weak"]);
  });

  it("preserves the legacy family merge for non-command-center callers", () => {
    const families = [
      ["o1", "o2"],
      ["c1", "c2"],
      ["p1", "p2"],
    ];
    expect(mergeUniversalSearchFamilies(families, 5)).toEqual([
      "o1",
      "c1",
      "p1",
      "o2",
      "c2",
    ]);
  });

  it("requires both protected detail dimensions before deep-linking", () => {
    expect(
      canOpenProtectedOperationalDetail({
        contact: true,
        financials: true,
      }),
    ).toBe(true);
    expect(
      canOpenProtectedOperationalDetail({
        contact: true,
        financials: false,
      }),
    ).toBe(false);
    expect(
      canOpenProtectedOperationalDetail({
        contact: false,
        financials: true,
      }),
    ).toBe(false);
  });
});

describe("messageExcerpt", () => {
  it("shows the part of a message that matched", () => {
    const body = "Bonjour, je voudrais savoir si la livraison à Oran est possible demain matin svp";
    expect(messageExcerpt(body, "oran")).toContain("Oran");
    expect(messageExcerpt(body, "oran")?.startsWith("…")).toBe(true);
  });

  it("matches across accents and Arabic hamza forms", () => {
    expect(messageExcerpt("Commande confirmée, livraison demain", "confirmee")).toContain("confirmée");
    expect(messageExcerpt("نحب نأكد الطلبية", "ناكد")).toContain("نأكد");
  });

  it("returns nothing when the message did not match", () => {
    expect(messageExcerpt("Salam", "livraison")).toBeUndefined();
  });
});

describe("typo-tolerant fallback", () => {
  const person = (label: string, extra: Partial<UniversalSearchCandidate> = {}): UniversalSearchCandidate => ({
    id: `customer:${label}`,
    kind: "customer",
    label,
    href: "/customers/1",
    ...extra,
  });
  const fuzzy = { fuzzy: true } as const;

  it("measures a bounded edit distance, counting a swap of neighbours as one", () => {
    expect(boundedEditDistance("mohamed", "mohamed", 2)).toBe(0);
    expect(boundedEditDistance("mohamad", "mohamed", 2)).toBe(1);
    expect(boundedEditDistance("ordres", "orders", 2)).toBe(1);
    expect(boundedEditDistance("benali", "benaly", 2)).toBe(1);
    expect(boundedEditDistance("abcdef", "uvwxyz", 2)).toBeGreaterThan(2);
    expect(boundedEditDistance("a", "abcdefgh", 2)).toBeGreaterThan(2);
  });

  it("is off unless asked for, so the normal pass never changes", () => {
    expect(scoreUniversalSearchCandidate("mohamad", person("Mohamed Benali"))).toBe(0);
    expect(scoreUniversalSearchCandidate("mohamad", person("Mohamed Benali"), fuzzy)).toBeGreaterThan(0);
  });

  it("finds a mistyped name, a swapped pair and a mistyped page", () => {
    expect(scoreUniversalSearchCandidate("mohamad", person("Mohamed Benali"), fuzzy)).toBeGreaterThan(0);
    expect(scoreUniversalSearchCandidate("benaly", person("Mohamed Benali"), fuzzy)).toBeGreaterThan(0);
    expect(
      scoreUniversalSearchCandidate("ordres", { id: "nav:orders", kind: "navigation", label: "Orders", href: "/orders" }, fuzzy),
    ).toBeGreaterThan(0);
  });

  it("finds the most common Arabic slip, ه for ة, and a mistyped Latin name for an Arabic one is not invented", () => {
    expect(scoreUniversalSearchCandidate("فاطمه", person("فاطمة بن علي"), fuzzy)).toBeGreaterThan(0);
    expect(scoreUniversalSearchCandidate("mohamed", person("محمد"), fuzzy)).toBe(0);
  });

  it("never ranks a loose match above a real one", () => {
    const loose = scoreUniversalSearchCandidate("mohamad", person("Mohamed Benali", { rankBoost: 50 }), fuzzy);
    const weakestReal = scoreUniversalSearchCandidate("hamed", person("Mohamed Benali"));
    expect(weakestReal).toBeGreaterThanOrEqual(580);
    expect(loose).toBeLessThan(weakestReal);
    const ranked = rankUniversalSearchCandidates(
      "mohamed",
      [person("Mohamad Karim"), person("Mohamed Benali"), person("Hamid Zeroual")],
      5,
      fuzzy,
    );
    expect(ranked.map((row) => row.label)).toEqual(["Mohamed Benali", "Mohamad Karim"]);
  });

  it("keeps a wrong digit a wrong customer, and short words exact", () => {
    expect(scoreUniversalSearchCandidate("0555123456", person("0555123457"), fuzzy)).toBe(0);
    expect(scoreUniversalSearchCandidate("0555123456", person("Karim", { sublabel: "0555123457" }), fuzzy)).toBe(0);
    expect(scoreUniversalSearchCandidate("ali", person("Ala Ben"), fuzzy)).toBe(0);
  });

  it("requires the same first letter and rejects unrelated words", () => {
    expect(scoreUniversalSearchCandidate("xohamed", person("Mohamed Benali"), fuzzy)).toBe(0);
    expect(scoreUniversalSearchCandidate("xylophone", person("Mohamed Benali"), fuzzy)).toBe(0);
    expect(scoreUniversalSearchCandidate("benalixyz", person("Mohamed Benali"), fuzzy)).toBe(0);
  });

  it("allows at most two typos in total across a multi-word query", () => {
    const customer = person("Mohamed Benali");
    const one = scoreUniversalSearchCandidate("mohamad benali", customer, fuzzy);
    const two = scoreUniversalSearchCandidate("mohamad benaly", customer, fuzzy);
    expect(one).toBeGreaterThan(two);
    expect(two).toBeGreaterThan(0);
    expect(scoreUniversalSearchCandidate("mohamad benaly kxxxx", customer, fuzzy)).toBe(0);
    expect(scoreUniversalSearchCandidate("mohamxd benalx", customer, fuzzy)).toBeGreaterThan(0);
    expect(scoreUniversalSearchCandidate("mohamxd benxlx", customer, fuzzy)).toBe(0);
  });

  it("proposes shorter spellings of the longest word, longest first", () => {
    expect(typoBackoffQueries("mohamad")).toEqual(["mohama", "moham"]);
    expect(typoBackoffQueries("benal")).toEqual(["bena", "ben"]);
    expect(typoBackoffQueries("mohamad ben")).toEqual(["mohama ben", "moham ben"]);
    expect(typoBackoffQueries("abdelrahmane")).toEqual(["abdelrahman", "abdelrah"]);
  });

  it("proposes nothing for short words, numbers or long sentences", () => {
    expect(typoBackoffQueries("ali")).toEqual([]);
    expect(typoBackoffQueries("0555123456")).toEqual([]);
    expect(typoBackoffQueries("")).toEqual([]);
    expect(typoBackoffQueries("a b c d")).toEqual([]);
    for (const variant of typoBackoffQueries("mohamad")) {
      expect(variant.length).toBeGreaterThanOrEqual(3);
      expect("mohamad".startsWith(variant)).toBe(true);
    }
  });
});
