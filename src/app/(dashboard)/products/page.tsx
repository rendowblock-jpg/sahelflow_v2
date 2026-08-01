import { getI18n } from "@/lib/i18n-server";
import { db, shopContext } from "@/lib/db";
import { productService } from "@/lib/data";
import { formatDZD } from "@/lib/utils";
import { Package, AlertTriangle, Boxes, DollarSign } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { ImportExportButtons } from "@/components/shared/import-export-buttons";
import { ProductFormDialog } from "@/components/products/product-form-dialog";
import { ProductsDataTable } from "@/components/products/products-data-table";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  requireTrustedAction,
  trustedActionAllowed,
} from "@/lib/identity/authorization";
import { projectProductsForTrustedActor } from "@/lib/identity/product-projection";

// Always fetch fresh data (local-first app, no ISR)
export const dynamic = "force-dynamic";

type ProductsPageProps = {
  searchParams: Promise<{ page?: string }>;
};

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const { t } = await getI18n();
  const actorContext = await requireTrustedAction("products.read");
  const resource = { shopId: actorContext.shop.shopId };
  const canManage = trustedActionAllowed(
    actorContext,
    "products.manage",
    resource,
  );
  const canReadCost = trustedActionAllowed(
    actorContext,
    "products.cost.read",
    resource,
  );
  const canExport = canReadCost && trustedActionAllowed(
    actorContext,
    "data.export",
    resource,
  );
  const canImport = canManage && trustedActionAllowed(
    actorContext,
    "data.import",
    resource,
  );

  const PAGE_SIZE = 25;
  const requestedPage = parseInt((await searchParams).page ?? "1", 10);
  const currentPage = Number.isSafeInteger(requestedPage) && requestedPage > 0
    ? requestedPage
    : 1;
  const offset = (currentPage - 1) * PAGE_SIZE;

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
    productService.list({ prisma: db, shop: shopContext }, { limit: PAGE_SIZE, offset }),
    productService.listCategories({ prisma: db, shop: shopContext }),
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
  const projectedProducts = projectProductsForTrustedActor(
    actorContext,
    products,
  );
  const hasNextPage = offset + products.length < totalProducts;

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
        actions={canExport || canManage ? (
          <div className="flex items-center gap-2">
            {canExport && (
              <ImportExportButtons
                exportRoute="/api/export/products"
                importRoute={canImport ? "/api/import/products" : undefined}
              />
            )}
            {canManage && <ProductFormDialog categories={categories} />}
          </div>
        ) : undefined}
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
        {canManage ? (
          <ProductsDataTable
          fallback={{
            products: projectedProducts.map((p) => ({
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
            hasNextPage,
            page: currentPage,
            pageSize: PAGE_SIZE,
          }}
          categories={categories}
          />
        ) : (
          <>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("products.productName")}</TableHead>
                  <TableHead>{t("products.sku")}</TableHead>
                  <TableHead className="text-end">{t("orders.price")}</TableHead>
                  <TableHead className="text-end">{t("products.stock")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projectedProducts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      {t("products.noProductsTitle")}
                    </TableCell>
                  </TableRow>
                ) : projectedProducts.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell>
                      <Link
                        href={`/products/${product.id}`}
                        className="font-medium hover:underline"
                      >
                        {product.name}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-muted-foreground">
                      {product.sku ?? "—"}
                    </TableCell>
                    <TableCell className="text-end tabular-nums">
                      {formatDZD(product.price)}
                    </TableCell>
                    <TableCell className="text-end tabular-nums">
                      {product.stock}
                    </TableCell>
                    <TableCell>
                      <Badge variant={product.isActive ? "secondary" : "outline"}>
                        {product.isActive ? t("common.active") : t("common.inactive")}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="mt-3 flex items-center justify-end gap-2">
            {currentPage > 1 && (
              <Link
                href={`/products?page=${currentPage - 1}`}
                className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"
              >
                {t("common.back")}
              </Link>
            )}
            {hasNextPage && (
              <Link
                href={`/products?page=${currentPage + 1}`}
                className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"
              >
                {t("common.next")}
              </Link>
            )}
          </div>
          </>
        )}
      </div>
    </div>
  );
}
