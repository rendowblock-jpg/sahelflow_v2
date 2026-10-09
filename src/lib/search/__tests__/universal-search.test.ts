import { describe, expect, it } from "vitest";

import {
  algerianPhoneSearchForms,
  canOpenProtectedOperationalDetail,
  compactSearchText,
  mergeUniversalSearchFamilies,
  messageExcerpt,
  normalizeSearchText,
  paddedRecordNumber,
  rankUniversalSearchCandidates,
  scoreUniversalSearchCandidate,
  typoDistance,
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

describe("search forms sellers really type", () => {
  const customer: UniversalSearchCandidate = {
    id: "customer:1",
    kind: "customer",
    label: "Fatima Zohra",
    sublabel: "0661987654",
    href: "/customers/1",
  };
  const order: UniversalSearchCandidate = {
    id: "order:58",
    kind: "order",
    label: "ORD-0058",
    sublabel: "Fatima Zohra",
    href: "/orders/58",
    keywords: ["Fatima Zohra", "0661987654"],
  };

  it("reads one Algerian number in its local, international and spaced shapes", () => {
    const forms = ["0661987654", "213661987654"];
    expect(algerianPhoneSearchForms("+213661987654")).toEqual(forms);
    expect(algerianPhoneSearchForms("+213 661 98 76 54")).toEqual(forms);
    expect(algerianPhoneSearchForms("00213661987654")).toEqual(forms);
    expect(algerianPhoneSearchForms("0661 98 76 54")).toEqual(forms);
    expect(algerianPhoneSearchForms("021 23 45 67")).toEqual(["021234567", "21321234567"]);
    expect(algerianPhoneSearchForms("9876")).toEqual([]);
    expect(algerianPhoneSearchForms("Fatima")).toEqual([]);
  });

  it("pads a short order number the way order numbers are written", () => {
    expect(paddedRecordNumber("58")).toBe("0058");
    expect(paddedRecordNumber("7")).toBe("0007");
    expect(paddedRecordNumber("0058")).toBeNull();
    expect(paddedRecordNumber("ord 58")).toBeNull();
  });

  it("ranks the order a short number ends above one that merely contains it", () => {
    const other = { ...order, id: "order:158", label: "ORD-0158" };
    expect(scoreUniversalSearchCandidate("58", order)).toBeGreaterThan(1_000);
    expect(
      rankUniversalSearchCandidates("58", [other, order], 2).map((row) => row.label),
    ).toEqual(["ORD-0058", "ORD-0158"]);
  });

  it("ranks a spaced phone the same way as an unspaced one", () => {
    const rank = (query: string) =>
      rankUniversalSearchCandidates(query, [order, customer], 2).map((row) => row.kind);
    expect(rank("0661 98 76 54")).toEqual(rank("0661987654"));
  });

  it("forgives one typo in a short name and two in a long one, below every real match", () => {
    expect(typoDistance("fatma", "fatima", 1)).toBe(1);
    expect(typoDistance("benli", "benali", 1)).toBe(1);
    expect(typoDistance("mohamed", "mohammed", 2)).toBe(1);
    expect(typoDistance("karim", "zohra", 1)).toBe(2);

    const fatma = scoreUniversalSearchCandidate("Fatma", customer);
    expect(fatma).toBeGreaterThan(0);
    expect(fatma).toBeLessThan(scoreUniversalSearchCandidate("Fati", customer));
    expect(scoreUniversalSearchCandidate("fatma zohra", customer)).toBeGreaterThan(0);
    expect(scoreUniversalSearchCandidate("Karim", customer)).toBe(0);
    // Three letters or digits are never "corrected".
    expect(scoreUniversalSearchCandidate("fat", { ...customer, label: "Fit" })).toBe(0);
    expect(scoreUniversalSearchCandidate("0662", customer)).toBe(0);
  });
});
