import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import ar from "@/lib/i18n/locales/ar.json";
import en from "@/lib/i18n/locales/en.json";
import fr from "@/lib/i18n/locales/fr.json";
import { matchKnownServerError, translateServerError } from "@/lib/i18n/translate-server-error";

/** Identity t(): returns the key so tests pin the mapping contract. */
const t = (key: string) => key;
const FALLBACK = "common.error";

describe("translateServerError rule coverage", () => {
  it("maps the canonical invalid-phone producer text (strategy 1 verbatim)", () => {
    expect(
      translateServerError(
        "Invalid Algerian phone (must be 0[5-7]XXXXXXXX)",
        t,
        FALLBACK,
      ),
    ).toBe("inbox.invalidPhoneFormat");
  });

  it("maps the required-phone producer text", () => {
    expect(translateServerError("Phone is required", t, FALLBACK)).toBe(
      "validation.phoneRequired",
    );
  });

  it("maps license-authority hook/store failures", () => {
    expect(
      translateServerError(
        "License authority returned an invalid response",
        t,
        FALLBACK,
      ),
    ).toBe("license.status.unavailable");
    expect(
      translateServerError("License authority is unavailable", t, FALLBACK),
    ).toBe("license.status.unavailable");
  });

  it("maps native shop-lifecycle failures", () => {
    expect(
      translateServerError(
        "Native shop lifecycle is available only in the desktop application",
        t,
        FALLBACK,
      ),
    ).toBe("shops.lifecycleError");
    expect(
      translateServerError(
        "Native shop lifecycle did not return an authenticated pending receipt",
        t,
        FALLBACK,
      ),
    ).toBe("shops.lifecycleError");
  });

  it("keeps matching case-insensitive and keeps the fallback contract", () => {
    expect(
      translateServerError("LICENSE AUTHORITY FILE IS UNREADABLE", t, FALLBACK),
    ).toBe("license.status.unavailable");
    expect(translateServerError("", t, FALLBACK)).toBe(FALLBACK);
    expect(translateServerError(undefined, t, FALLBACK)).toBe(FALLBACK);
  });
});

describe("stop-desk booking refusal (STORE-DESK-BOOKING)", () => {
  it("maps the coded English refusal to its seller-facing key", () => {
    expect(
      translateServerError(
        "This order is for stop-desk pickup and has no delivery address, so SahelFlow cannot book it with a courier. Book it in your courier's own dashboard.",
        t,
        FALLBACK,
      ),
    ).toBe("deliveries.errors.stopDeskNotBookable");
  });
});

const STOCK_KEY = "orders.errors.insufficientStock";

describe("order cannot be confirmed: not enough stock (409 CONFLICT)", () => {
  it("maps the product text, ids with quotes and dashes included", () => {
    for (const id of ["demo-product-09", "cm0x'quoted'id", "a-b_c-1234-5678"]) {
      expect(
        translateServerError(`Insufficient available stock for product '${id}'`, t, FALLBACK),
      ).toBe(STOCK_KEY);
    }
  });

  it("maps the variant text", () => {
    for (const id of ["demo-variant-09-L", "v'-'1"]) {
      expect(
        translateServerError(`Insufficient available stock for variant '${id}'`, t, FALLBACK),
      ).toBe(STOCK_KEY);
    }
  });

  it("wins even when the id itself contains words that other rules match", () => {
    expect(
      translateServerError("Insufficient available stock for product 'order not found'", t, FALLBACK),
    ).toBe(STOCK_KEY);
    expect(
      translateServerError("Insufficient available stock for variant 'validation-unauthorized'", t, FALLBACK),
    ).toBe(STOCK_KEY);
  });

  it("is not triggered by unrelated texts: those still fall to the calm generic sentence", () => {
    expect(translateServerError("Database is locked", t, FALLBACK)).toBe("firstRun.error.unmapped");
    expect(
      translateServerError("Variant 'v1' is missing or belongs to another product", t, FALLBACK),
    ).toBe("firstRun.error.unmapped");
    expect(translateServerError("Request failed (409)", t, FALLBACK)).toBe("common.error");
  });

  it("has a seller sentence in en, fr and ar that carries no id and no technical word", () => {
    const sentences = [en, fr, ar].map((table) => (table as Record<string, string>)[STOCK_KEY] ?? "");
    for (const sentence of sentences) {
      expect(typeof sentence).toBe("string");
      expect(sentence.trim().length).toBeGreaterThan(20);
      expect(sentence).not.toMatch(/\{\{|'|demo-|variant|CONFLICT|409/i);
    }
    expect(new Set(sentences).size).toBe(3);
    expect(sentences[2]).toMatch(/[\u0600-\u06FF]/);
  });

  it("keeps matching the texts the producers really throw (byte-identical contract)", () => {
    const root = join(__dirname, "..", "..", "..", "..");
    for (const file of ["src/lib/orders/manual-confirmation.ts", "src/lib/data/product-stock-model.ts"]) {
      const source = readFileSync(join(root, file), "utf8");
      const thrown = source.match(/Insufficient available stock for (product|variant) '\$\{[^}]+\}'/g) ?? [];
      expect(thrown.length, file).toBeGreaterThan(0);
      for (const template of thrown) {
        const sample = template.replace(/\$\{[^}]+\}/, "demo-id-1");
        expect(translateServerError(sample, t, FALLBACK), `${file}: ${template}`).toBe(STOCK_KEY);
      }
    }
  });
});

describe("other 409 texts a seller can hit from the customers and products screens", () => {
  it("customer with orders cannot be deleted", () => {
    expect(translateServerError("Cannot delete customer with 3 orders", t, FALLBACK)).toBe(
      "customers.errors.hasOrders",
    );
  });

  it("customer phone already used (create)", () => {
    expect(translateServerError("Customer with phone 0550123456 already exists", t, FALLBACK)).toBe(
      "customers.errors.phoneExists",
    );
  });

  it("product SKU already used (create)", () => {
    expect(translateServerError("Product with SKU TS-001 already exists", t, FALLBACK)).toBe(
      "products.errors.skuExists",
    );
  });

  it("each new key exists in en, fr and ar, filled, with no placeholder left over", () => {
    for (const key of ["customers.errors.hasOrders", "customers.errors.phoneExists", "products.errors.skuExists"]) {
      const sentences = [en, fr, ar].map((table) => (table as Record<string, string>)[key] ?? "");
      for (const sentence of sentences) {
        expect(typeof sentence, key).toBe("string");
        expect(sentence.trim().length, key).toBeGreaterThan(10);
        expect(sentence, key).not.toMatch(/\{\{/);
      }
      expect(sentences[2], key).toMatch(/[\u0600-\u06FF]/);
      expect(sentences[1], key).not.toBe(sentences[0]);
    }
  });
});

describe("every server text that refuses a duplicate customer phone reads in en, fr and ar", () => {
  const PHONE_KEY = "customers.errors.phoneExists";
  const catalogs: Record<"en" | "fr" | "ar", Record<string, string>> = { en, fr, ar };
  // The exact texts customer-service.ts throws (create; create race on the unique index; update; update race).
  const SERVER_TEXTS: ReadonlyArray<readonly [string, string]> = [
    ["create", "Customer with phone 0550123456 already exists"],
    ["create or update, unique index race", "A customer with this phone number already exists."],
    ["update", "Phone 0550123456 already used by another customer"],
  ];

  for (const [label, text] of SERVER_TEXTS) {
    for (const locale of ["en", "fr", "ar"] as const) {
      it(`${label}: "${text}" shows the ${locale} sentence`, () => {
        const catalog = catalogs[locale];
        const shown = matchKnownServerError(text, (key) => catalog[key] ?? key);
        expect(shown).toBe(catalog[PHONE_KEY]);
      });
    }
  }

  it("keeps matching every phone refusal customer-service.ts really throws (byte-identical contract)", () => {
    const root = join(__dirname, "..", "..", "..", "..");
    const source = readFileSync(join(root, "src/lib/data/customer-service.ts"), "utf8");
    const thrown = (source.match(/new ConflictError\((["`])[^\n]*?\1\)/g) ?? []).filter((call) => /phone/i.test(call));
    expect(thrown.length).toBeGreaterThanOrEqual(4);
    for (const call of thrown) {
      const sample = call.replace(/^new ConflictError\(["`]|["`]\)$/g, "").replace(/\$\{[^}]+\}/, "0550123456");
      expect(matchKnownServerError(sample, (key) => key), call).toBe(PHONE_KEY);
    }
  });

  it("does not touch an unrelated message that only mentions phone or customer", () => {
    for (const text of [
      "Customer 'Phone Planet' saved",
      "Phone number copied",
      "Another customer",
      "Invitation already used",
      "Phone Planet",
    ]) {
      expect(matchKnownServerError(text, (key) => key), text).toBeNull();
    }
  });
});
