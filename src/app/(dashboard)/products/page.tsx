import { getI18n } from "@/lib/i18n-server";
import { db } from "@/lib/db";
import { productService } from "@/lib/data";
import { formatDZD } from "@/lib/utils";
import { Package, AlertTriangle, Boxes, DollarSign } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { ImportExportButtons } from "@/components/shared/import-export-buttons";
import { ProductFormDialog } from "@/components/products/product-form-dialog";
import { ProductsDataTable } from "@/components/products/products-data-table";

// Always fetch fresh data (local-first app, no ISR)
export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const { t } = await getI18n();

  const PAGE_SIZE = 25;

  // Page-1 fallback for the DataTable (SWR takes over on navigation).
  // Aggregates (active count, low-stock count, inventory value) are computed
  // across ALL products — not just page 1 — so the stat cards are correct
  // regardless of pagination. Low-stock needs stock <= lowStockThreshold
  // (a field-to-field comparison Prisma can't express in where), so we fetch
  // the relevant columns once and compute both low-stock count + inventory
  // value in JS (single round trip, cheap on local SQLite).
  //
  // W3-14: low-stock count now filters isActive=true so retired/archived
  // products don't inflate the alert — matches the dashboard + notification-
  // bell definitions (DATA_INTEGRITY_PLAN scenario #9 fix). Inventory value
  // still spans ALL non-deleted products (capital tied up in inactive stock
  // is still real). Two separate queries: the low-stock query fetches fewer
  // rows (perf win) and only the columns it needs; the inventory query
  // fetches price+stock across everything.
  const [products, categories, totalProducts, activeCount, lowStockRows, inventoryRows] = await Promise.all([
    productService.list({ prisma: db }, { limit: PAGE_SIZE, offset: 0 }),
    productService.listCategories({ prisma: db }),
    db.product.count({ where: { deletedAt: null } }),
    db.product.count({ where: { isActive: true, deletedAt: null } }),
    db.product.findMany({
      where: { isActive: true, deletedAt: null },
      select: { stock: true, lowStockThreshold: true },
    }),
    db.product.findMany({
      where: { deletedAt: null },
      select: { price: true, stock: true },
    }),
  ]);

  const lowStockCount = lowStockRows.filter((p) => p.stock <= p.lowStockThreshold).length;
  const inventoryValue = inventoryRows.reduce((sum, p) => sum + p.price * Math.max(0, p.stock), 0);

  return (
    <div className="app-content page-sections">
      {/* Low stock alert banner */}
      {lowStockCount > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800/50 dark:bg-amber-950/30 p-3 animate-fade-up">
          <div className="flex size-8 items-center justify-center rounded-lg bg-amber-500/10">
            <AlertTriangle className="h-4 w-4 text-warning" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
              {lowStockCount > 1
                ? t("products.lowStockAlertMany", { count: lowStockCount })
                : t("products.lowStockAlertOne", { count: lowStockCount })}
            </p>
            <p className="text-xs text-warning">
              {t("products.lowStockAlertHint")}
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <PageHeader
        title={t("products.title")}
        description={`${t("products.totalStock")}: ${totalProducts} · ${t("products.inventoryValue")}: ${formatDZD(inventoryValue)}`}
        actions={
          <div className="flex items-center gap-2">
            <ImportExportButtons exportRoute="/api/export/products" importRoute="/api/import/products" />
            <ProductFormDialog categories={categories} />
          </div>
        }
      />

      {/* Stat strip */}
      <div className="card-grid-4 stagger-grid">
        <StatCard
          label={t("products.total")}
          value={totalProducts}
          icon={<Package />}
          accentBg="bg-teal-500/10 dark:bg-teal-500/15"
          accentIcon="text-teal-600 dark:text-teal-400"
          style={{ animationDelay: "60ms" }}
        />
        <StatCard
          label={t("common.active")}
          value={activeCount}
          icon={<Boxes />}
          accentBg="bg-emerald-500/10 dark:bg-emerald-500/15"
          accentIcon="text-success"
          subtitle={t("products.activeOutOf", { total: totalProducts })}
          style={{ animationDelay: "120ms" }}
        />
        <StatCard
          label={t("products.lowStock")}
          value={lowStockCount}
          icon={<AlertTriangle />}
          accentBg="bg-amber-500/10 dark:bg-amber-500/15"
          accentIcon="text-warning"
          trend={lowStockCount > 0 ? -1 : 0}
          trendLabel={lowStockCount > 0 ? t("products.needsRestock") : t("products.stockOk")}
          style={{ animationDelay: "180ms" }}
        />
        <StatCard
          label={t("products.inventoryValue")}
          value={formatDZD(inventoryValue)}
          icon={<DollarSign />}
          accentBg="bg-violet-500/10 dark:bg-violet-500/15"
          accentIcon="text-violet-600 dark:text-violet-400"
          style={{ animationDelay: "240ms" }}
        />
      </div>

      {/* Products table (DataTable v2: paginated, skeleton loading, density toggle) */}
      <div className="animate-fade-up" style={{ animationDelay: "240ms" }}>
        <ProductsDataTable
          fallback={{
            products: products.map((p) => ({
              id: p.id,
              name: p.name,
              sku: p.sku,
              price: p.price,
              cost: p.cost,
              stock: p.stock,
              lowStockThreshold: p.lowStockThreshold,
              categoryId: p.categoryId,
              isActive: p.isActive,
              createdAt: p.createdAt.toISOString(),
            })),
            total: totalProducts,
            hasNextPage: totalProducts > PAGE_SIZE,
            page: 1,
            pageSize: PAGE_SIZE,
          }}
          categories={categories}
        />
      </div>
    </div>
  );
}
