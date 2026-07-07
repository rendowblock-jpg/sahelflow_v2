/**
 * Regex extractor tests — synthetic Algerian COD messages.
 *
 * These test the regex against common message patterns.
 * Real-world accuracy will be validated in Phase −1 Gate 1
 * (50 real WhatsApp messages).
 */
import { describe, it, expect } from "vitest";
import { extractWithRegex } from "@/lib/ai/extraction/regex-extractor";

describe("regex extractor — Arabic Darija messages", () => {
  it("extracts a simple Arabic COD message with product, price, wilaya", () => {
    const result = extractWithRegex({
      body: "بغيت نشرى iPhone 14 ب 8500 دج ف Alger",
    });

    expect(result.method).toBe("regex");
    expect(result.order).not.toBeNull();
    expect(result.order?.wilaya).toBe("Alger");
    expect(result.order?.items.length).toBeGreaterThan(0);
    expect(result.confidence).toBeGreaterThanOrEqual(0.4);
  });

  it("extracts Arabic with Arabic-Indic numerals", () => {
    const result = extractWithRegex({
      body: "نبغي نشري ٢ قطعة من écouteurs ب ٤٥٠٠ دج وهران",
    });

    expect(result.order?.wilaya).toBe("Oran");
    expect(result.order?.items.length).toBeGreaterThan(0);
  });

  it("extracts phone number from Arabic message", () => {
    const result = extractWithRegex({
      body: "بغيت نشرى chargeur ب 2000 دج ف Constantine، رقمي 0661234567",
    });

    expect(result.order?.phone).toBe("0661234567");
    expect(result.order?.wilaya).toBe("Constantine");
  });

  it("extracts customer name when present", () => {
    const result = extractWithRegex({
      body: "اسمي Ahmed، بغيت نشرى montre ب 5000 دج ف Alger",
    });

    expect(result.order?.customerName).toBe("Ahmed");
  });
});

describe("regex extractor — French messages", () => {
  it("extracts a simple French COD message", () => {
    const result = extractWithRegex({
      body: "Je veux commander 2 écouteurs JBL 9000 DA, Oran",
    });

    expect(result.method).toBe("regex");
    expect(result.order?.wilaya).toBe("Oran");
    expect(result.order?.items.length).toBeGreaterThan(0);
  });

  it("extracts phone from French message with spaces", () => {
    const result = extractWithRegex({
      body: "Bonjour, commande pour Sétif, 06 61 23 45 67, iPhone 14 85000 DA",
    });

    expect(result.order?.phone).toBe("0661234567");
    expect(result.order?.wilaya).toBe("Sétif");
  });

  it("extracts 'je m'appelle' pattern", () => {
    const result = extractWithRegex({
      body: "Je m'appelle Karim, je veux commander iPhone 14 8500 DA a Annaba, 0661234567",
    });

    expect(result.order?.customerName).toBe("Karim");
    expect(result.order?.wilaya).toBe("Annaba");
  });

  it("extracts quantity with 'x' notation", () => {
    const result = extractWithRegex({
      body: "3x basket sport 6500 DA Constantine",
    });

    expect(result.order?.items.length).toBeGreaterThan(0);
    expect(result.order?.items[0]?.quantity).toBe(3);
  });
});

describe("regex extractor — mixed/edge cases", () => {
  it("handles a complete message with all fields", () => {
    const result = extractWithRegex({
      body: "اسمي Fatima، بغيت 2x robe d'été ب 3500 دج كل وحدة، التوصيل ل Oran، Es Senia، رقمي 0661987654",
    });

    expect(result.order?.customerName).toBeTruthy();
    expect(result.order?.wilaya).toBe("Oran");
    expect(result.order?.phone).toBe("0661987654");
    expect(result.order?.items.length).toBeGreaterThan(0);
    expect(result.isComplete).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0.6);
  });

  it("returns incomplete when wilaya is missing", () => {
    const result = extractWithRegex({
      body: "Je veux un iPhone 14, 85000 DA",
    });

    expect(result.isComplete).toBe(false);
    expect(result.missingFields).toContain("wilaya");
  });

  it("returns incomplete when phone is missing", () => {
    const result = extractWithRegex({
      body: "2x écouteurs JBL 9000 DA Alger",
    });

    expect(result.isComplete).toBe(false);
    expect(result.missingFields).toContain("phone");
  });

  it("returns null order when message is not an order", () => {
    const result = extractWithRegex({
      body: "Bonjour, comment ça va?",
    });

    expect(result.order).toBeNull();
    expect(result.method).toBe("none");
  });

  it("handles Arabic wilaya names", () => {
    const result = extractWithRegex({
      body: "التوصيل ل الجزائر، بغيت نشرى chargeur",
    });

    expect(result.order?.wilaya).toBe("Alger");
  });

  it("uses knownPhone as fallback when message has no phone", () => {
    const result = extractWithRegex({
      body: "بغيت نشرى iPhone 14 ب 8500 دج ف Alger",
      knownPhone: "0555123456",
    });

    expect(result.order?.phone).toBe("0555123456");
  });
});

describe("regex extractor — confidence scoring", () => {
  it("gives higher confidence to complete extractions", () => {
    const complete = extractWithRegex({
      body: "اسمي Ahmed، 2x iPhone 14 ب 8500 دج ف Alger، 0661234567",
    });
    const partial = extractWithRegex({
      body: "iPhone 14 8500 DA",
    });

    expect(complete.confidence).toBeGreaterThan(partial.confidence);
  });

  it("gives 0 confidence to non-orders", () => {
    const result = extractWithRegex({
      body: "Merci beaucoup!",
    });

    expect(result.confidence).toBe(0);
  });
});


// ── AI-M9: findWilaya word-boundary matching ────────────────────────────────

describe("regex extractor — AI-M9: findWilaya word boundaries", () => {
  it("does NOT match 'Mila' inside 'familial'", () => {
    // Include a product+price so extractWithRegex returns a non-null order
    // (otherwise wilaya is undefined regardless of findWilaya's behavior).
    const result = extractWithRegex({
      body: "contexte familial, bati milieu, bpc 12 alger, 2x chargeur 1500 DA",
    });
    // 'Mila' (wilaya 43) must NOT false-positive inside 'familial' / 'milieu'.
    // 'alger' should still be detected.
    expect(result.order?.wilaya).toBe("Alger");
  });

  it("does NOT match 'Mila' inside 'Camila'", () => {
    const result = extractWithRegex({
      body: "Je m'appelle Camila, je veux 2 chargeurs 2000 DA Alger",
    });
    expect(result.order?.wilaya).toBe("Alger");
  });
});

// ── AI-M10: findPhone +213 international format ─────────────────────────────

describe("regex extractor — AI-M10: +213 international phone format", () => {
  it("extracts +213555123456 and normalizes to 0555123456", () => {
    const result = extractWithRegex({
      body: "iPhone 14 85000 DA Alger, tel +213555123456",
    });
    expect(result.order?.phone).toBe("0555123456");
  });

  it("extracts +213 555 12 34 56 (with spaces) and normalizes", () => {
    const result = extractWithRegex({
      body: "Livraison Oran, +213 555 12 34 56, casque 3000 DA",
    });
    expect(result.order?.phone).toBe("0555123456");
  });

  it("still extracts local 0XXXXXXXXX format", () => {
    const result = extractWithRegex({
      body: "tel 0661234567, livraison Constantine, 2x stylos 500 DA",
    });
    expect(result.order?.phone).toBe("0661234567");
  });
});

// ── AI-M11: parsePrice comma decimals ────────────────────────────────────────

describe("regex extractor — AI-M11: parsePrice comma handling", () => {
  it("parses '3,500 DA' (comma thousands) as 3500", () => {
    const result = extractWithRegex({
      body: "iPhone 14 3,500 DA Alger",
    });
    expect(result.order?.items).toHaveLength(1);
    expect(result.order?.items[0]?.unitPrice).toBe(3500);
  });

  it("parses '3500,50 DA' (comma decimal) as 3501 (rounded)", () => {
    const result = extractWithRegex({
      body: "iPhone 14 3500,50 DA Alger",
    });
    expect(result.order?.items).toHaveLength(1);
    // Decimal comma → rounded to int (DZD has no sub-unit for COD).
    expect(result.order?.items[0]?.unitPrice).toBe(3501);
  });

  it("parses '3.500 DA' (dot thousands) as 3500 (no regression)", () => {
    const result = extractWithRegex({
      body: "iPhone 14 3.500 DA Alger",
    });
    expect(result.order?.items).toHaveLength(1);
    expect(result.order?.items[0]?.unitPrice).toBe(3500);
  });
});

// ── AI-M12: extractItems 'product x2' reverse pattern ───────────────────────

describe("regex extractor — AI-M12: product-then-quantity pattern", () => {
  it("extracts 'iPhone 14 x2' (product then quantity)", () => {
    const result = extractWithRegex({
      body: "iPhone 14 x2 8500 DA Alger, 0661234567",
    });
    expect(result.order?.items.length).toBeGreaterThan(0);
    const item = result.order?.items[0];
    expect(item?.productName?.toLowerCase()).toContain("iphone");
    expect(item?.quantity).toBe(2);
  });

  it("extracts 'casque bluetooth x3 2500 DA' (multi-word product)", () => {
    const result = extractWithRegex({
      body: "casque bluetooth x3 2500 DA Oran, 0555123456",
    });
    expect(result.order?.items.length).toBeGreaterThan(0);
    const item = result.order?.items[0];
    expect(item?.productName?.toLowerCase()).toContain("casque");
    expect(item?.quantity).toBe(3);
  });
});
