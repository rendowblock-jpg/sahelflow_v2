/**
 * PB-AI-GROQ-WRITE-LOOKUPS: an order-creation question is offered ONLY the two lookups and the write
 * tool; every other question keeps the tools it had. Router + slim prompt, no network.
 */
import { appendFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import "@/lib/ai/chat/tools/core-tools";
import "@/lib/ai/chat/tools/extended-tools";
import "@/lib/ai/chat/tools/advanced-tools";

import { aiCapabilityGroups, type AiCapabilityGroupId } from "../../tools/capability-groups";
import { getAllToolDefinitions } from "../../tools/registry";
import { estimateTokens } from "../budget";
import { aiChatSystemPromptSlim } from "../slim-prompt";
import { BASE_TOOL_NAMES, FALLBACK_TOOL_NAMES, ORDER_CREATION_TOOL_NAMES, isOrderCreationQuestion, selectToolsForQuestion } from "../tool-router";

const THREE = ["create_order", "search_customers", "search_products"];
const names = (q: string) => selectToolsForQuestion({ question: q, locale: "fr" }).tools.map((t) => t.name).sort();

const ORDER_QUESTIONS: string[] = [
  "Crée une commande pour Karim Benali : 2 Écouteurs Bluetooth Pro, livraison à Alger Bab Ezzouar, téléphone 0555000101",
  "créer une commande pour Sara",
  "ajoute une nouvelle commande pour Amine",
  "cree commande Karim",
  "Peux-tu enregistrer une commande pour Yacine ?",
  "Create an order for Karim Benali: 2 Bluetooth earphones, Algiers",
  "add an order for Sara",
  "Please create a new order for Amine",
  "place a draft order for Karim",
  "اعمل طلب جديد للزبون كريم",
  "سجل طلب لكريم بن علي",
  "أنشئ طلب جديد",
  "أضف طلبية جديدة لسارة",
  "اعمل لي كوماند لكريم",
  "dir commande l Karim",
  "zid commande l Karim Benali: 2 sabbat sport noir, Alger, 0555000101",
  "dir talab jdid l Karim",
];

// Old answer, as groups: BASE + every tool of the matched groups (or BASE + FALLBACK for no keyword).
const NON_ORDER: Array<{ q: string; groups: AiCapabilityGroupId[] | "fallback" }> = [
  { q: "cancel the order of Karim", groups: ["orders"] },
  { q: "stock of Casque", groups: ["products"] },
  { q: "how many orders today", groups: ["orders"] },
  { q: "montre-moi les commandes en attente", groups: ["orders"] },
  { q: "اعرض لي الطلبات المعلقة", groups: ["orders"] },
  { q: "ajoute une note au client Karim : préfère être appelé après 17h", groups: ["customers"] },
  { q: "passe la commande 77 en livrée", groups: ["orders", "delivery"] },
  { q: "add a note to order 5", groups: ["orders"] },
  { q: "quel est le téléphone de Nadia Zerrouki ?", groups: ["customers"] },
  { q: "annule la commande ORD-0006", groups: ["orders"] },
  { q: "mets le stock du Sabbat sport noir à 25", groups: ["products"] },
  { q: "show me the new orders", groups: ["orders"] },
  { q: "ajoute un article à la commande 5", groups: ["orders", "products"] },
  { q: "bonjour", groups: "fallback" },
  { q: "crée un client Samir, 0661234567", groups: ["customers"] },
  { q: "create a new product called Power Bank at 5500 DA", groups: ["products"] },
  { q: "la commande créée hier pour Karim, elle est où ?", groups: ["orders"] },
  { q: "اضف ملاحظة للطلب 55", groups: ["orders"] },
  { q: "Give me the details of order ORD-9999.", groups: ["orders"] },
  { q: "wach kayen talabat jdod lyoum", groups: ["orders"] },
  { q: "add an order note to order 5", groups: ["orders"] },
];

function oldAnswer(groups: AiCapabilityGroupId[] | "fallback"): string[] {
  const out = new Set<string>(BASE_TOOL_NAMES);
  if (groups === "fallback") FALLBACK_TOOL_NAMES.forEach((n) => out.add(n));
  else for (const g of aiCapabilityGroups()) if (groups.includes(g.id)) g.tools.forEach((t) => out.add(t.name));
  return [...out].sort();
}

describe("order-creation routing", () => {
  it("the offered set is pinned to the real registry names", () => {
    expect([...ORDER_CREATION_TOOL_NAMES].sort()).toEqual(THREE);
    const registry = getAllToolDefinitions().map((d) => d.name);
    for (const n of THREE) expect(registry).toContain(n);
  });

  it.each(ORDER_QUESTIONS)("offers exactly the two lookups and create_order: %s", (q) => {
    const route = selectToolsForQuestion({ question: q, locale: "fr" });
    expect(route.tools.map((t) => t.name).sort()).toEqual(THREE);
    expect(route.reason).toBe("order-creation");
    expect(route.fallback).toBe(false);
  });

  it.each(NON_ORDER)("keeps the old tool set: $q", ({ q, groups }) => {
    expect(isOrderCreationQuestion(q)).toBe(false);
    const route = selectToolsForQuestion({ question: q, locale: "fr" });
    expect(route.reason).not.toBe("order-creation");
    expect(names(q)).toEqual(oldAnswer(groups));
  });

  it("a second action in the same sentence keeps the larger set (never too little)", () => {
    const got = names("Crée une commande pour Karim puis annule la commande 12");
    expect(got).toContain("cancel_order");
    expect(got).toContain("get_stats");
    expect(got.length).toBeGreaterThan(3);
    expect(names("اعمل طلب جديد ثم الغ الطلب 12")).toContain("cancel_order");
  });

  it("without create_order in the list there is nothing to narrow towards: the old answer", () => {
    const defs = getAllToolDefinitions().filter((d) => d.name !== "create_order");
    const route = selectToolsForQuestion({ question: "créer une commande pour Sara", locale: "fr" }, defs);
    expect(route.reason).toBe("keywords");
    expect(route.tools.map((t) => t.name)).toContain("get_stats");
  });

  it("the question is read alone: a follow-up with order history is not an order request", () => {
    const route = selectToolsForQuestion({
      question: "et pour Sara ?",
      locale: "fr",
      history: [{ role: "user", content: "crée une commande pour Karim" }, { role: "assistant", content: "ok" }],
    });
    expect(route.reason).not.toBe("order-creation");
  });

  it("schemas and estimated tokens per step: before vs after (the repo's estimator)", () => {
    const q = ORDER_QUESTIONS[0]!;
    const after = selectToolsForQuestion({ question: q, locale: "fr" }).tools;
    const oldNames = oldAnswer(["orders", "customers", "products", "delivery"]);
    const before = selectToolsForQuestion({ question: "commande client produit livraison", locale: "fr" }).tools;
    expect(before.map((t) => t.name).sort()).toEqual(oldNames);
    const tAfter = estimateTokens(JSON.stringify(after));
    const tBefore = estimateTokens(JSON.stringify(before));
    const line = `ROUTER schemas before=${before.length} after=${after.length}; tool-list tokens before=${tBefore} after=${tAfter}\n`;
    appendFileSync("/tmp/l78u-w202-numbers.txt", line);
    expect(after).toHaveLength(3);
    expect(before.length, line).toBeGreaterThan(after.length * 3);
    expect(tAfter, line).toBeLessThan(tBefore / 3);
  });
});

describe("slim prompt: the order line", () => {
  const OLD = { en: 1622, fr: 1876, ar: 1375 } as const;
  const ADDED = { en: 311, fr: 370, ar: 265 } as const;
  const MARK = { en: /same step.*never invent an id.*seller approves before anything is written/s, fr: /même étape.*n'invente jamais d'identifiant.*approuve avant toute écriture/s, ar: /الخطوة نفسها.*لا تخترع معرّفاً.*يوافق البائع قبل أي كتابة/s } as const;
  it.each(["en", "fr", "ar"] as const)("%s: one line, exactly the stated size, names no tool", (locale) => {
    const slim = aiChatSystemPromptSlim(locale);
    expect(slim).toMatch(MARK[locale]);
    expect(slim.length).toBe(OLD[locale] + ADDED[locale]);
    expect(slim.length).toBeLessThanOrEqual(3500);
    expect(slim).not.toMatch(/create_order|search_customers|search_products/);
    expect(slim.split("\n\n").filter((p) => MARK[locale].test(p))).toHaveLength(1);
  });
});
