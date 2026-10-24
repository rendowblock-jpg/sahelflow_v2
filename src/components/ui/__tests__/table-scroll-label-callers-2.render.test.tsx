/**
 * @vitest-environment happy-dom
 */
/**
 * Second batch of shared-Table callers (PB-A11Y-TABLE-SCROLL-LABELS). The
 * first batch lives in table-scroll-label-callers.render.test.tsx. Each caller
 * must pass the heading it already shows as `scrollLabel`, so the horizontal
 * scroller is a named region and a tab stop (axe scrollable-region-focusable).
 */
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import AccountingPage from "@/app/(dashboard)/accounting/page";
import ProductDetailPage from "@/app/(dashboard)/products/[id]/page";
import { AiMarkdown } from "@/components/ai/markdown/ai-markdown";
import { ImportPanel } from "@/components/import/import-panel";
import { BackupRestorePanel } from "@/components/settings/backup-restore-panel";
import { COPY } from "@/components/settings/backup-restore-copy";
import { getAiCanvasRuntimeTranslation } from "@/lib/i18n/ai-canvas-runtime";
import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";
import { getTranslations } from "@/lib/i18n";
import { render } from "@/test-utils/render";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  notFound: vi.fn(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
    locale: "en",
    dir: "ltr",
    setLocale: vi.fn(),
    isLocalePending: false,
  }),
}));

vi.mock("@/lib/i18n-server", () => ({
  getI18n: async () => ({ t: (key: string) => key, locale: "en" }),
}));

vi.mock("@/lib/identity/authorization", () => ({
  requireTrustedAction: async () => ({ shop: { shopId: "shop-1" } }),
  // No profitability and no edit rights: the expenses card still renders.
  trustedActionAllowed: () => false,
}));

vi.mock("@/lib/db", () => ({
  db: {
    expense: {
      findMany: async () => [
        { id: "e1", date: new Date("2026-10-01T00:00:00Z"), category: "rent", amount: 1000, notes: null },
      ],
    },
  },
  shopContext: { shopId: "shop-1" },
}));

vi.mock("@/lib/data", () => ({ productService: { listCategories: async () => [] } }));

vi.mock("@/lib/products/product-detail-workbench", () => ({
  getProductDetailWorkbench: async () => ({
    product: {
      id: "p1",
      name: "Shirt",
      sku: "SKU1",
      category: null,
      createdAt: new Date("2026-09-01T00:00:00Z"),
      price: 1000,
      cost: null,
      stock: 5,
      lowStockThreshold: 2,
      isActive: true,
      productVariants: [],
    },
    recentItems: [
      {
        id: "i1",
        quantity: 1,
        unitPrice: 1000,
        total: 1000,
        order: { id: "o1", orderNumber: "A1", status: "pending", createdAt: new Date("2026-10-01T00:00:00Z") },
      },
    ],
    stockHistory: [
      { id: "h1", createdAt: new Date("2026-10-01T00:00:00Z"), delta: -1, toStock: 4, source: "manual", reason: null, actor: null },
    ],
    orderMovements: [
      { id: "m1", occurredAt: new Date("2026-10-01T00:00:00Z"), kind: "reserved", quantity: 1, orderId: "o1", orderNumber: "A1" },
    ],
    canManage: false,
    canReadOrders: true,
    canReadOrderFinancials: true,
  }),
}));

// Pieces that fetch, journal or draw on their own are not under test.
vi.mock("@/components/shared/recent-record-tracker", () => ({ RecentRecordTracker: () => null }));
vi.mock("@/components/products/product-detail-actions", () => ({ ProductDetailActions: () => null }));
vi.mock("@/components/products/product-variant-picker", () => ({ ProductVariantPicker: () => null }));
vi.mock("@/components/accounting/expense-form-dialog", () => ({ ExpenseFormDialog: () => null }));
vi.mock("@/components/accounting/expense-row-actions", () => ({ ExpenseRowActions: () => null }));
vi.mock("@/components/shared/import-export-buttons", () => ({ ImportExportButtons: () => null }));

vi.mock("@/lib/env", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  isTauriEnv: () => true,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function scrollers(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-slot="table-container"]'));
}

function expectNamedRegions(labels: string[]): void {
  const found = scrollers();
  expect(found).toHaveLength(labels.length);
  found.forEach((wrapper, index) => {
    expect(wrapper.getAttribute("role")).toBe("region");
    expect(wrapper.getAttribute("tabindex")).toBe("0");
    expect((wrapper.getAttribute("aria-label") ?? "").trim()).not.toBe("");
    expect(wrapper.getAttribute("aria-label")).toBe(labels[index]);
  });
}

describe("shared Table callers (second batch) name their scroll region", () => {
  it("product page: stock history, stock moved by orders, recent orders", async () => {
    const ui = (await ProductDetailPage({ params: Promise.resolve({ id: "p1" }) })) as ReactElement;
    render(ui);
    expectNamedRegions([
      "productStock.historyTitle",
      "productStock.orderMovementsTitle",
      "customers.recentOrders",
    ]);
  });

  it("accounting page: the recent expenses table", async () => {
    const ui = (await AccountingPage()) as ReactElement;
    render(ui);
    expectNamedRegions(["accounting.recentExpenses"]);
  });

  it("backup panel: the backups table carries the panel's own heading", async () => {
    const entry = {
      backupId: "bk-1",
      createdAtUnixMs: 1_790_000_000_000,
      verifiedAtUnixMs: 1_790_000_000_000,
      retentionClass: "daily",
      pinned: false,
      workspaceId: "ws-1",
      sourceInstallationId: "inst-1",
      shopCount: 1,
      plaintextBytes: 1000,
      containerBytes: 1200,
      status: "verified",
      location: "local",
      requiresRecoveryKit: false,
      independentRecoveryReady: true,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ backups: [entry] }) })),
    );
    render(<BackupRestorePanel canRead canCreate canRestore />);
    await waitFor(() => expect(scrollers()).toHaveLength(1));
    expectNamedRegions([COPY.en.title]);
  });

  it("import panel: the preview table", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          totalRows: 1,
          mapping: {},
          validCount: 1,
          invalidCount: 0,
          invalid: [],
          preview: [{ name: "Shirt" }],
        }),
      })),
    );
    const { container } = render(<ImportPanel entity="products" title="Products" description="d" />);
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    if (!input) return;
    fireEvent.change(input, {
      target: { files: [new File(["name\nShirt"], "products.csv", { type: "text/csv" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: /import\.analyze/ }));
    await waitFor(() => expect(scrollers()).toHaveLength(1));
    expectNamedRegions(["import.previewTableLabel"]);
  });

  it("assistant markdown: a table in a message", () => {
    render(<AiMarkdown content={"| a | b |\n|---|---|\n| 1 | 2 |"} />);
    expectNamedRegions(["ai.markdownTableLabel"]);
  });
});

describe("the labels read as names in all three languages", () => {
  const existing = [
    "productStock.historyTitle",
    "productStock.orderMovementsTitle",
    "customers.recentOrders",
    "accounting.recentExpenses",
  ];
  const added: Record<string, Record<"en" | "fr" | "ar", string>> = {
    "import.previewTableLabel": {
      en: "Preview of the rows to import",
      fr: "Aperçu des lignes à importer",
      ar: "معاينة الصفوف المراد استيرادها",
    },
    "ai.markdownTableLabel": { en: "Table", fr: "Tableau", ar: "جدول" },
  };

  function resolve(locale: "en" | "fr" | "ar", key: string): string | undefined {
    return getTranslations(locale)[key] ?? getRuntimeTranslation(locale, key) ?? undefined;
  }

  it("existing keys resolve to a non-empty string that is not the key", () => {
    for (const locale of ["en", "fr", "ar"] as const) {
      for (const key of existing) {
        const value = resolve(locale, key);
        expect(value, `${locale}:${key}`).toBeTruthy();
        expect(value, `${locale}:${key}`).not.toBe(key);
      }
    }
  });

  it("the two new keys carry the agreed wording in en, fr and ar", () => {
    for (const locale of ["en", "fr", "ar"] as const) {
      for (const [key, byLocale] of Object.entries(added)) {
        expect(resolve(locale, key), `${locale}:${key}`).toBe(byLocale[locale]);
      }
    }
    expect(getAiCanvasRuntimeTranslation("ar", "ai.markdownTableLabel")).toBe("جدول");
  });
});
