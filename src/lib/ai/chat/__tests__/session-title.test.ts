import { describe, expect, it } from "vitest";

import {
  AI_SESSION_TITLE_MAX_LENGTH,
  deriveAiSessionTitle,
  isDerivableAiSessionTitle,
  LEGACY_AI_SESSION_TITLE,
} from "@/lib/ai/chat/session-title";

describe("deriveAiSessionTitle (UI-05)", () => {
  it("returns a short prompt unchanged", () => {
    expect(deriveAiSessionTitle("Combien de commandes aujourd'hui ?")).toBe(
      "Combien de commandes aujourd'hui ?",
    );
  });

  it("collapses newlines and runs of whitespace into a single line", () => {
    // A pasted multi-line prompt used to be stored with its breaks intact,
    // which the history rail then rendered as a run-on line.
    expect(deriveAiSessionTitle("Commande\n\n  1234\t\tstatut")).toBe(
      "Commande 1234 statut",
    );
  });

  it("cuts on a word boundary instead of mid-word", () => {
    const title = deriveAiSessionTitle(
      "Montre-moi toutes les commandes en attente de livraison a Alger",
    );
    expect(title.endsWith("…")).toBe(true);
    // The old slice(0, 50) landed inside "livraison"; a boundary cut must not.
    expect(title).not.toMatch(/livrais…$/);
    expect(title.replace(/…$/u, "").endsWith(" ")).toBe(false);
  });

  it("never exceeds the bound, ellipsis included", () => {
    const title = deriveAiSessionTitle("a".repeat(400));
    expect(Array.from(title).length).toBeLessThanOrEqual(
      AI_SESSION_TITLE_MAX_LENGTH + 1,
    );
  });

  it("hard-cuts a single unspaced token rather than collapsing to a stub", () => {
    // No word boundary exists, so the boundary rule must not win here.
    const title = deriveAiSessionTitle("x".repeat(120));
    expect(Array.from(title).length).toBe(AI_SESSION_TITLE_MAX_LENGTH + 1);
  });

  it("never splits a surrogate pair", () => {
    // slice(0, 50) on UTF-16 units could cut through an astral character and
    // store a lone surrogate. Code-point slicing cannot.
    const title = deriveAiSessionTitle("📦".repeat(80));
    expect(title).not.toMatch(/[\uD800-\uDFFF]/u);
  });

  it("keeps Arabic prompts intact and boundary-cut", () => {
    const title = deriveAiSessionTitle(
      "أرني كل الطلبات المعلقة التي تنتظر التوصيل إلى الجزائر العاصمة اليوم",
    );
    expect(title.endsWith("…")).toBe(true);
    expect(Array.from(title).length).toBeLessThanOrEqual(
      AI_SESSION_TITLE_MAX_LENGTH + 1,
    );
    // The seller's own words — never a generated or translated label.
    expect(title.startsWith("أرني")).toBe(true);
  });

  it("does not leave dangling punctuation before the ellipsis", () => {
    const title = deriveAiSessionTitle(
      "Statut de la commande 1234, puis la livraison et le paiement complet",
    );
    expect(title).not.toMatch(/[,;:.\s]…$/u);
  });

  it("returns empty for a message with nothing renderable", () => {
    expect(deriveAiSessionTitle("   \n\t  ")).toBe("");
    expect(deriveAiSessionTitle("")).toBe("");
  });
});

describe("isDerivableAiSessionTitle", () => {
  it("treats null and empty titles as derivable", () => {
    expect(isDerivableAiSessionTitle(null)).toBe(true);
    expect(isDerivableAiSessionTitle("")).toBe(true);
  });

  it("treats the legacy French seed as derivable", () => {
    expect(isDerivableAiSessionTitle(LEGACY_AI_SESSION_TITLE)).toBe(true);
    expect(isDerivableAiSessionTitle(` ${LEGACY_AI_SESSION_TITLE} `)).toBe(true);
  });

  it("never overwrites a title the seller chose", () => {
    expect(isDerivableAiSessionTitle("Litige livreur Oran")).toBe(false);
  });
});
