import { Hash } from "lucide-react";
import { describe, expect, it } from "vitest";

import { flattenNavigationItems, utilityNavigationItems } from "@/components/layout/navigation";
import { NAVIGATION_SYNONYMS, groupResults } from "@/components/search/search-palette-model";
import type { SearchRow } from "@/components/search/search-result-row";
import { LOCALES, getTranslations } from "@/lib/i18n";
import { rankUniversalSearchCandidates } from "@/lib/search/universal-search";

const row = (kind: SearchRow["kind"], id: string, score: number) =>
  ({ id, kind, label: id, href: `/${id}`, updatedAt: null, icon: Hash, score }) as SearchRow & { score: number };

describe("command palette grouping", () => {
  it("leads with records by default", () => {
    const groups = groupResults([row("navigation", "page", 900), row("conversation", "chat", 640)]);
    expect(groups.map((group) => group.kind)).toEqual(["conversation", "navigation"]);
  });

  it("leads with the page when the seller typed its exact name", () => {
    const groups = groupResults([row("conversation", "chat", 640), row("navigation", "deliveries", 1_200)]);
    expect(groups.map((group) => group.kind)).toEqual(["navigation", "conversation"]);
  });

  it("keeps an exact record ahead of an exact page", () => {
    const groups = groupResults([row("navigation", "page", 1_200), row("order", "ORD-0002", 1_212)]);
    expect(groups.map((group) => group.kind)).toEqual(["order", "navigation"]);
  });
});

describe("command palette destinations", () => {
  const destinations = [...flattenNavigationItems(), ...utilityNavigationItems];
  const candidates = destinations.map((item) => ({
    id: item.id,
    kind: "navigation" as const,
    label: getTranslations("fr")[item.labelKey] ?? item.id,
    href: item.href,
    keywords: [
      ...(item.keywords ?? []),
      ...LOCALES.map((locale) => getTranslations(locale)[item.labelKey] ?? ""),
      ...(NAVIGATION_SYNONYMS[item.id] ?? []),
    ].filter(Boolean),
  }));

  it("has seller synonyms for every destination", () => {
    for (const item of destinations) expect(NAVIGATION_SYNONYMS[item.id], item.id).toBeDefined();
  });

  it.each([
    ["stock", "products"],
    ["مخزون", "products"],
    ["تأكيد", "confirmation-queue"],
    ["argent", "money"],
    ["commandes", "sell"],
    ["الطلبيات", "sell"],
    ["livraison", "fulfill"],
    ["توصيل", "fulfill"],
    ["paramètres", "settings"],
  ])("finds %s in any interface language", (query, expected) => {
    expect(rankUniversalSearchCandidates(query, candidates, 3)[0]?.id).toBe(expected);
  });
});
