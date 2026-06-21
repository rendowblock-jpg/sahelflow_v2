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
