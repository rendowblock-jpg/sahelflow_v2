import { describe, it, expect, vi } from "vitest";
import {
  extractOrderFromMessages,
  extractOrderFromSingleMessage,
  matchProductToCatalog,
  extractOrderWithCatalog,
} from "../extraction";

vi.mock("@/lib/agents/groq", () => ({
  callLLMJson: vi.fn().mockRejectedValue(new Error("LLM mocked in unit tests")),
  callLLM: vi.fn().mockRejectedValue(new Error("LLM mocked in unit tests")),
  callLLMWithTools: vi
    .fn()
    .mockRejectedValue(new Error("LLM mocked in unit tests")),
}));

describe("Extraction Engine — extractOrderFromSingleMessage()", () => {
  it("extracts phone number from message", async () => {
    const result = await extractOrderFromSingleMessage(
      "salam bghit commande, raqmi 0555123456",
    );
    expect(result.phone).toBe("0555123456");
  });

  it("extracts phone with +213 prefix", async () => {
    const result = await extractOrderFromSingleMessage(
      "call me at +213555123456",
    );
    expect(result.phone).toBe("0555123456");
  });

  it("extracts wilaya from French name", async () => {
    const result = await extractOrderFromSingleMessage(
      "je suis de oran, envoyez moi le produit",
    );
    expect(result.wilaya).toBe("Oran");
  });

  it("extracts wilaya from Darija alias", async () => {
    const result = await extractOrderFromSingleMessage("ana men wahran");
    expect(result.wilaya).toBe("Oran");
  });

  it("extracts wilaya from commune alias", async () => {
    const result = await extractOrderFromSingleMessage("ana fi bab el oued");
    expect(result.wilaya).toBe("El Oued");
  });

  it('extracts name from "ismi X" pattern', async () => {
    const result = await extractOrderFromSingleMessage(
      "salam ismi Ahmed Benali",
    );
    expect(result.customer_name).toBeTruthy();
    expect(result.customer_name).toContain("Ahmed");
  });

  it("extracts product quantity", async () => {
    const result = await extractOrderFromSingleMessage("bghit 3 pièces");
    expect(result.products[0]?.quantity).toBe(3);
  });

  it("extracts color variant", async () => {
    const result = await extractOrderFromSingleMessage(
      "bghit wahda noir taille M",
    );
    expect(result.products[0]?.variant).toContain("Noir");
  });

  it("calculates confidence based on extracted fields", async () => {
    const full = await extractOrderFromSingleMessage(
      "ismi Ahmed, raqmi 0555123456, ana men oran, 3anwani hai salam, bghit 2 pièces",
    );
    expect(full.confidence).toBeGreaterThan(0.5);

    const empty = await extractOrderFromSingleMessage("hello");
    expect(empty.confidence).toBeLessThan(0.3);
  });
});

describe("Extraction Engine — extractOrderFromMessages()", () => {
  it("combines data from multiple messages", async () => {
    const result = await extractOrderFromMessages([
      "salam bghit commande",
      "ismi Ahmed",
      "raqmi 0555123456",
      "ana men oran",
    ]);
    expect(result.customer_name).toContain("Ahmed");
    expect(result.phone).toBe("0555123456");
    expect(result.wilaya).toBe("Oran");
  });
});

describe("Product Matching — matchProductToCatalog()", () => {
  const catalog = [
    { id: "1", name: "عطر رجالي فاخر", price: 3500, sku: null },
    { id: "2", name: "كريم وجه طبيعي", price: 1800, sku: null },
    { id: "3", name: "Parfum Homme Premium", price: 4200, sku: "PH001" },
    { id: "4", name: "Sac à main cuir", price: 2800, sku: null },
  ];

  it("matches exact product name", () => {
    const result = matchProductToCatalog("عطر رجالي فاخر", catalog);
    expect(result?.id).toBe("1");
  });

  it("matches French product name", () => {
    const result = matchProductToCatalog("Parfum Homme Premium", catalog);
    expect(result?.id).toBe("3");
  });

  it("matches partial name (substring)", () => {
    const result = matchProductToCatalog("كريم وجه", catalog);
    expect(result?.id).toBe("2");
  });

  it("returns null for unrelated text", () => {
    const result = matchProductToCatalog(
      "something completely different xyz",
      catalog,
    );
    expect(result).toBeNull();
  });

  it("returns null for empty mention", () => {
    const result = matchProductToCatalog("", catalog);
    expect(result).toBeNull();
  });

  it("returns null if mention normalizes to empty", () => {
    const result = matchProductToCatalog("   ", catalog);
    expect(result).toBeNull();
  });

  it("handles empty normalized product name in catalog", () => {
    const badCatalog = [
      { id: "empty", name: "   ", price: 100 },
      { id: "1", name: "عطر رجالي فاخر", price: 3500 }
    ];
    const result = matchProductToCatalog("عطر", badCatalog);
    expect(result?.id).toBe("1");
  });

  it("matches when normalized mention contains normalized product name (inverse contains)", () => {
    const result = matchProductToCatalog("عطر رجالي فاخر بالياسمين", catalog);
    expect(result?.id).toBe("1");
  });

  it("returns null if word overlap score is below 0.5", () => {
    const result = matchProductToCatalog("عطر شيء آخر تماما", catalog);
    expect(result).toBeNull();
  });

  it("matches via word overlap score >= 0.5 when no substring match", () => {
    const result = matchProductToCatalog("عطر رجالي مميز", catalog);
    expect(result?.id).toBe("1");
  });

  it("returns null for empty catalog", () => {
    const result = matchProductToCatalog("عطر", []);
    expect(result).toBeNull();
  });
});

describe("Extraction edge cases", () => {
  it("returns generic product when only quantity detected (no keyword match)", async () => {
    const result = await extractOrderFromSingleMessage("bghit 3");
    expect(result.products).toHaveLength(1);
    expect(result.products[0].name).toBe("");
    expect(result.products[0].quantity).toBe(3);
  });

  it("returns generic product with variant when color+size detected", async () => {
    const result = await extractOrderFromSingleMessage("taille L noir");
    expect(result.products).toHaveLength(1);
    expect(result.products[0].name).toBe("");
    expect(result.products[0].variant).toContain("L");
    expect(result.products[0].variant).toContain("Noir");
  });

  it("extracts products with keywords, quantities, and variants using regex fallback", async () => {
    const result = await extractOrderFromSingleMessage("bghit 2 triko noir taille L");
    expect(result.products).toHaveLength(1);
    expect(result.products[0].name).toBe("t-shirt");
    expect(result.products[0].quantity).toBe(2);
    expect(result.products[0].variant).toContain("L");
    expect(result.products[0].variant).toContain("Noir");
  });

  it("extracts quantity using simple digit fallback inside segment", async () => {
    const result = await extractOrderFromSingleMessage("bghit triko 3");
    expect(result.products).toHaveLength(1);
    expect(result.products[0].quantity).toBe(3);
  });

  it("combines quantities of duplicate products in segments", async () => {
    const result = await extractOrderFromSingleMessage("bghit triko w triko");
    expect(result.products).toHaveLength(1);
    expect(result.products[0].quantity).toBe(2);
  });

  it("returns empty products for messages with no product info", async () => {
    const result = await extractOrderFromSingleMessage("salam labas");
    expect(result.products).toHaveLength(0);
  });

  it("normalizes Franco-Arab characters in matching", () => {
    const catalog = [{ id: "6", name: "3sl", price: 1000 }];
    const result = matchProductToCatalog("3sl", catalog);
    expect(result?.id).toBe("6");
  });

  it("extracts wilaya from code number (e.g., wilaya 16)", async () => {
    const result = await extractOrderFromSingleMessage("bghit livraison l wilaya 16");
    expect(result.wilaya).toBe("Alger");
  });

  it("filters out invalid names", async () => {
    const res1 = await extractOrderFromSingleMessage("ismi a   ");
    expect(res1.customer_name).toBeUndefined();

    const res2 = await extractOrderFromSingleMessage("ismi ab");
    expect(res2.customer_name).toBeUndefined();
  });

  it("handles out of range wilaya codes", async () => {
    const res = await extractOrderFromSingleMessage("l wilaya 99");
    expect(res.wilaya).toBeUndefined();
  });

  it("handles out of range quantities globally", async () => {
    const res1 = await extractOrderFromSingleMessage("bghit 150");
    expect(res1.products).toHaveLength(0);

    const res2 = await extractOrderFromSingleMessage("bghit 0");
    expect(res2.products).toHaveLength(0);
  });

  it("handles out of range quantities in segments", async () => {
    const res1 = await extractOrderFromSingleMessage("bghit 150 triko");
    expect(res1.products[0]?.quantity).toBe(1);

    const res2 = await extractOrderFromSingleMessage("bghit 0 triko");
    expect(res2.products[0]?.quantity).toBe(1);
  });
});

describe("Extraction Engine — LLM success path", () => {
  it("extracts order details successfully via LLM and matches catalog", async () => {
    const { callLLMJson } = await import("@/lib/agents/groq");
    
    const catalog = [
      { id: "p1", name: "Parfum Homme", price: 5000, variants: [] }
    ];

    vi.mocked(callLLMJson).mockResolvedValueOnce({
      customer_name: "Ahmed",
      phone: "0555123456",
      wilaya: "Oran",
      commune: "Bir El Djir",
      address: "Hai Salem",
      products: [{ name: "Parfum Homme", quantity: 2, variant: "M" }],
      confidence: 0.95
    });

    const result = await extractOrderWithCatalog(["salam bghit parfum"], catalog);

    expect(result.customer_name).toBe("Ahmed");
    expect(result.phone).toBe("0555123456");
    expect(result.wilaya).toBe("Oran");
    expect(result.commune).toBe("Bir El Djir");
    expect(result.address).toBe("Hai Salem");
    expect(result.products).toHaveLength(1);
    expect(result.products[0].name).toBe("Parfum Homme");
    expect(result.products[0].quantity).toBe(2);
    expect(result.products[0].price).toBe(5000);
    expect(result.products[0].product_id).toBe("p1");
    expect(result.products[0].variant).toBe("M");
    expect(result.confidence).toBe(0.95);
  });

  it("handles empty LLM products and null confidence", async () => {
    const { callLLMJson } = await import("@/lib/agents/groq");

    vi.mocked(callLLMJson).mockResolvedValueOnce({
      customer_name: null,
      phone: null,
      wilaya: null,
      commune: null,
      address: null,
      products: [],
      confidence: null as any
    });

    const result = await extractOrderFromMessages(["salam ismi Ahmed 0555123456 Oran bghit 2"]);
    expect(result.customer_name).toBe("Ahmed");
    expect(result.phone).toBe("0555123456");
    expect(result.wilaya).toBe("Oran");
    expect(result.products).toHaveLength(1);
    expect(result.confidence).toBe(0.5);
  });

  it("handles LLM product not in catalog and missing variant", async () => {
    const { callLLMJson } = await import("@/lib/agents/groq");
    
    const catalog = [
      { id: "p1", name: "Parfum Homme", price: 5000, variants: [] }
    ];

    vi.mocked(callLLMJson).mockResolvedValueOnce({
      customer_name: "Ahmed",
      phone: "0555123456",
      wilaya: "Oran",
      commune: "Bir El Djir",
      address: "Hai Salem",
      products: [{ name: "Unrelated Item", quantity: 1, variant: null }],
      confidence: 0.9
    });

    const result = await extractOrderWithCatalog(["salam"], catalog);

    expect(result.products).toHaveLength(1);
    expect(result.products[0].name).toBe("Unrelated Item");
    expect(result.products[0].price).toBeUndefined();
    expect(result.products[0].product_id).toBeUndefined();
    expect(result.products[0].variant).toBeUndefined();
  });
});
