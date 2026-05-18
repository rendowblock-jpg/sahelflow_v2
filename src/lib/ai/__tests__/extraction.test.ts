import { describe, it, expect, vi } from "vitest";
import {
  extractOrderFromMessages,
  extractOrderFromSingleMessage,
  matchProductToCatalog,
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
});
