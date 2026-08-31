import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { matchesComboboxQuery } from "@/components/shared/combobox/search-match";
import {
  fetchCustomerOptions,
} from "@/components/orders/order-customer-combobox";
import {
  fetchProductOptions,
  productHasSelectableVariant,
  productStockLevel,
} from "@/components/orders/order-product-combobox";
import { getOrderFormRuntimeTranslation } from "@/lib/i18n/order-form-runtime";
import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("combobox local search (Arabic/French normalization)", () => {
  it("matches Arabic queries across hamza and diacritic variants", () => {
    expect(matchesComboboxQuery("احمد", ["أحمد بن عمار"])).toBe(true);
    expect(matchesComboboxQuery("أحمد", ["احمد بن عمار"])).toBe(true);
    expect(matchesComboboxQuery("مرحبا", ["مرحباً بكم"])).toBe(true);
  });

  it("matches Arabic-Indic digits against Latin phone digits", () => {
    expect(matchesComboboxQuery("٠٥٥٥", ["05 55 12 34 56"])).toBe(true);
    expect(matchesComboboxQuery("0555 12", ["0555123456"])).toBe(true);
  });

  it("matches French queries accent-insensitively", () => {
    expect(matchesComboboxQuery("ecran", ["Écran 24 pouces"])).toBe(true);
    expect(matchesComboboxQuery("ÉCRAN", ["ecran"])).toBe(true);
  });

  it("keeps an empty query permissive and a foreign query exclusive", () => {
    expect(matchesComboboxQuery("", ["anything"])).toBe(true);
    expect(matchesComboboxQuery("  ", ["anything"])).toBe(true);
    expect(matchesComboboxQuery("tshirt", ["Écran 24"])).toBe(false);
    expect(matchesComboboxQuery("skdjf", [null, undefined])).toBe(false);
  });
});

describe("variant-aware product availability", () => {
  const noVariants = {
    id: "p-1",
    name: "Écran",
    price: 100,
    stock: 10,
    isActive: true,
    productVariants: [],
  };
  const withVariants = {
    id: "p-2",
    name: "T-shirt",
    price: 100,
    stock: 10,
    isActive: true,
    productVariants: [
      { id: "v-1", name: "S", sku: null, price: 100, stock: 5, isActive: true },
      { id: "v-2", name: "M", sku: null, price: 110, stock: 5, isActive: true },
      { id: "v-3", name: "L", sku: null, price: 120, stock: 5, isActive: false },
    ],
  };

  it("blocks re-adding a variant-less product already on the order", () => {
    expect(productHasSelectableVariant(noVariants, [])).toBe(true);
    expect(
      productHasSelectableVariant(noVariants, [
        { productId: "p-1", productVariantId: null },
      ]),
    ).toBe(false);
  });

  it("keeps the product selectable while an active variant is unused", () => {
    expect(
      productHasSelectableVariant(withVariants, [
        { productId: "p-2", productVariantId: "v-1" },
      ]),
    ).toBe(true);
    expect(
      productHasSelectableVariant(withVariants, [
        { productId: "p-2", productVariantId: "v-1" },
        { productId: "p-2", productVariantId: "v-2" },
      ]),
    ).toBe(false);
  });

  it("ignores inactive variants when counting availability", () => {
    expect(
      productHasSelectableVariant(withVariants, [
        { productId: "p-2", productVariantId: "v-3" },
      ]),
    ).toBe(true);
  });

  it("classifies stock levels with the workbench thresholds", () => {
    expect(productStockLevel(0)).toBe("out");
    expect(productStockLevel(3, 5)).toBe("low");
    expect(productStockLevel(5, 5)).toBe("low");
    expect(productStockLevel(6, 5)).toBe("in");
    expect(productStockLevel(10)).toBe("in");
  });
});

describe("combobox remote search contracts", () => {
  it("queries the blind-index customer search and keeps the address", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        customers: [
          {
            id: "c-1",
            name: "أحمد بن عمار",
            phone: "0555123456",
            wilaya: "Alger",
            commune: "Bab Ezzouar",
            address: "Rue 5",
          },
        ],
        total: 1,
        query: "0555123456",
        fieldAccess: { contact: true },
      }),
    );

    const rows = await fetchCustomerOptions("0555123456");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/customers/search?q=0555123456&limit=50",
      expect.objectContaining({ headers: { Accept: "application/json" } }),
    );
    expect(rows).toEqual([
      {
        id: "c-1",
        name: "أحمد بن عمار",
        phone: "0555123456",
        wilaya: "Alger",
        commune: "Bab Ezzouar",
        address: "Rue 5",
      },
    ]);
  });

  it("normalizes malformed customer rows instead of crashing", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        customers: [
          { name: "no id" },
          { id: "c-2", name: null, phone: null, wilaya: undefined },
        ],
      }),
    );

    const rows = await fetchCustomerOptions("x");
    expect(rows).toEqual([
      {
        id: "c-2",
        name: "",
        phone: "",
        wilaya: null,
        commune: null,
        address: null,
      },
    ]);
  });

  it("surfaces customer search failures to the degraded state", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { error: "boom" }));
    await expect(fetchCustomerOptions("x")).rejects.toThrow(
      /customer search failed \(500\)/,
    );
  });

  it("queries the catalog workbench search with sku and variants", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        products: [
          {
            id: "p-1",
            name: "Écran",
            sku: "ECR-24",
            price: 100,
            stock: 2,
            lowStockThreshold: 5,
            isActive: true,
            productVariants: [
              {
                id: "v-1",
                name: "Noir",
                sku: "ECR-24-N",
                price: 100,
                stock: 2,
                isActive: true,
                sortOrder: 0,
              },
            ],
          },
        ],
        total: 1,
        page: 1,
        pageSize: 50,
      }),
    );

    const rows = await fetchProductOptions("ecr");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/products?q=ecr&activeOnly=true&page=1&pageSize=50",
      expect.objectContaining({ headers: { Accept: "application/json" } }),
    );
    expect(rows).toEqual([
      {
        id: "p-1",
        name: "Écran",
        sku: "ECR-24",
        price: 100,
        stock: 2,
        lowStockThreshold: 5,
        isActive: true,
        productVariants: [
          {
            id: "v-1",
            name: "Noir",
            sku: "ECR-24-N",
            price: 100,
            stock: 2,
            isActive: true,
          },
        ],
      },
    ]);
  });

  it("surfaces product search failures to the degraded state", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(403, { error: "forbidden" }));
    await expect(fetchProductOptions("x")).rejects.toThrow(
      /product search failed \(403\)/,
    );
  });
});

describe("order form combobox surface contract", () => {
  const dialog = read("src/components/orders/order-form-dialog.tsx");
  const page = read("src/app/(dashboard)/orders/page.tsx");
  const core = read("src/components/shared/combobox/async-combobox.tsx");
  const customerBox = read("src/components/orders/order-customer-combobox.tsx");
  const productBox = read("src/components/orders/order-product-combobox.tsx");

  it("replaces the catalog-dump Radix Selects with comboboxes", () => {
    expect(dialog).toContain("OrderCustomerCombobox");
    expect(dialog).toContain("OrderProductCombobox");
    expect(dialog).not.toContain("@/components/ui/select");
    expect(dialog).not.toContain("SelectItem");
    // The full catalog no longer renders into the DOM row by row; remote
    // pages only merge into the cache that feeds variant-aware row logic.
    expect(dialog).not.toContain("customers.map((c) =>");
    expect(dialog).not.toContain(".map((p) => (");
    expect(dialog).toContain("const productCatalog = useMemo(");
    expect(dialog).toContain("registerRemoteProducts");
  });

  it("builds the pickers on the cmdk Command structure with debounced search", () => {
    expect(core).toContain("<Command shouldFilter={false}");
    expect(core).toContain("CommandInput");
    expect(core).toContain("CommandList");
    expect(core).toContain("CommandEmpty");
    expect(core).toContain("CommandItem");
    expect(core).toContain("useDebouncedValue(query, 300)");
    expect(core).toContain('role="combobox"');
    expect(core).toContain('data-testid="combobox-input"');
    expect(core).toContain('data-testid="combobox-skeleton"');
    expect(core).toContain('data-testid="combobox-empty"');
  });

  it("keeps the create-new-customer flow and delivery prefill intact", () => {
    expect(dialog).toContain("toggleNewCustomerMode");
    expect(dialog).toContain("onCreateNew={startNewCustomerFromQuery}");
    expect(dialog).toContain('form.setValue("wilaya", customer.wilaya ?? ""');
    expect(dialog).toContain("formatDZPhone(customer.phone)");
    expect(customerBox).toContain("combobox-create-customer");
    expect(customerBox).toContain('t("orders.form.combobox.createCustomer"');
  });

  it("keeps the variant-aware selection flow on remote products", () => {
    expect(dialog).toContain("ProductVariantPicker");
    expect(dialog).toContain("onProductsLoaded={registerRemoteProducts}");
    expect(productBox).toContain("productHasSelectableVariant");
    expect(productBox).toContain("searchProductPlaceholder");
  });

  it("caps the server-passed seed slice instead of shipping the catalog", () => {
    expect(page).toContain("const ORDER_FORM_INITIAL_SLICE = 50;");
    expect(page.match(/take: ORDER_FORM_INITIAL_SLICE,/g)?.length).toBe(2);
    expect(page).not.toContain("orderBy: { name: \"asc\" }");
  });
});

describe("order form combobox runtime dictionary", () => {
  const locales = ["en", "fr", "ar"] as const;
  const manifest = [
    "orders.form.combobox.searching",
    "orders.form.combobox.searchFailed",
    "orders.form.combobox.noCustomerMatch",
    "orders.form.combobox.noProductMatch",
    "orders.form.combobox.createCustomer",
    "orders.form.combobox.searchProductPlaceholder",
    "orders.form.combobox.allVariantsSelected",
    "orders.form.combobox.stockIn",
    "orders.form.combobox.stockIn_one",
    "orders.form.combobox.stockIn_other",
    "orders.form.combobox.stockLow",
    "orders.form.combobox.stockLow_one",
    "orders.form.combobox.stockLow_other",
    "orders.form.combobox.stockOut",
  ];

  it.each(locales)("resolves every order-form key for %s", (locale) => {
    for (const key of manifest) {
      expect(getOrderFormRuntimeTranslation(locale, key), key).toBeTruthy();
    }
    expect(
      getOrderFormRuntimeTranslation(locale, "orders.form.combobox.missing"),
    ).toBeUndefined();
  });

  it("exposes explicit Arabic plural agreement for stock counts", () => {
    for (const suffix of ["zero", "one", "two", "few", "many", "other"]) {
      expect(
        getOrderFormRuntimeTranslation(
          "ar",
          `orders.form.combobox.stockIn_${suffix}`,
        ),
        suffix,
      ).toBeTruthy();
    }
  });

  it.each(locales)("registers the dictionary in the shared resolver for %s", (locale) => {
    expect(getRuntimeTranslation(locale, "orders.form.combobox.searching")).toBe(
      getOrderFormRuntimeTranslation(locale, "orders.form.combobox.searching"),
    );
  });

  it("keeps the create-customer affordance localized, not machine codes", () => {
    expect(
      getOrderFormRuntimeTranslation("ar", "orders.form.combobox.createCustomer"),
    ).toMatch(/[\u0600-\u06ff]/);
    expect(
      getOrderFormRuntimeTranslation("fr", "orders.form.combobox.createCustomer"),
    ).toContain("Créer");
    expect(
      getOrderFormRuntimeTranslation("en", "orders.form.combobox.createCustomer"),
    ).toContain("Create");
  });
});
