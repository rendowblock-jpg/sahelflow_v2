import { describe, expect, it } from "vitest";

import {
  canOpenProtectedOperationalDetail,
  compactSearchText,
  mergeUniversalSearchFamilies,
  normalizeSearchText,
  rankUniversalSearchCandidates,
  scoreUniversalSearchCandidate,
  type UniversalSearchCandidate,
} from "../universal-search";

describe("universal search normalization and ranking", () => {
  it("normalizes Arabic digits, diacritics, tatweel and compatibility forms", () => {
    expect(normalizeSearchText("  طَــلَب ٠١٢٣  ")).toBe("طلب 0123");
    expect(normalizeSearchText("۱۲۳۴")).toBe("1234");
    expect(compactSearchText("0555 12-34-56")).toBe("0555123456");
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

    expect(rankUniversalSearchCandidates("0001", candidates, 3).map((item) => item.id)).toEqual([
      "order:exact",
      "customer:weak",
      "product:weak",
    ]);
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
