import { redirect } from "next/navigation";
import { AlertTriangle, Boxes, DollarSign, Package } from "lucide-react";

import { ProductFormDialog } from "@/components/products/product-form-dialog";
import { ProductsDataTable } from "@/components/products/products-data-table";
import { ImportExportButtons } from "@/components/shared/import-export-buttons";
import { PageHeader } from "@/components/shared/page-header";
import { StateSurface } from "@/components/shared/state-surface";
import { StatCard } from "@/components/shared/stat-card";
import { productService } from "@/lib/data";
import { db, shopContext } from "@/lib/db";
import { getI18n } from "@/lib/i18n-server";
import { requireTrustedAction } from "@/lib/identity/authorization";
import {
  getProductsWorkbenchPage,
  getProductWorkbenchSummary,
} from "@/lib/products/product-workbench";
import { formatDZD } from "@/lib/utils";

export const dynamic = "force-dynamic";

type ProductsPageProps = {
  searchParams: Promise<{ page?: string }>;
};

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const { t, locale } = await getI18n();
  const actorContext = await requireTrustedAction("products.read");
  const requestedPage = Number.parseInt((await searchParams).page ?? "1", 10);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0
    ? requestedPage
    : 1;

  const [fallback, summary, categories] = await Promise.all([
    getProductsWorkbenchPage(actorContext, { page, pageSize: 25 }),
    getProductWorkbenchSummary(actorContext),
    productService.listCategories({ prisma: db, shop: shopContext }),
  ]);
  const lastPage = Math.max(1, Math.ceil(fallback.total / fallback.pageSize));
  if (page > lastPage) redirect(`/products?page=${lastPage}`);

  const access = fallback.fieldAccess;
  const canCreate = access.manage && access.cost && access.costUpdate;

  return (
    <div className="app-content page-sections">
      {summary.lowStock > 0 ? (
        <StateSurface
          icon={AlertTriangle}
          title={
            summary.lowStock > 1
              ? t("products.lowStockAlertMany", { count: summary.lowStock })
              : t("products.lowStockAlertOne", { count: summary.lowStock })
          }
          description={t("products.lowStockAlertHint")}
          tone="warning"
          size="inline"
        />
      ) : null}

      <PageHeader
        title={t("products.title")}
        description={`${t("products.totalStock")}: ${summary.total} · ${t("products.inventoryValue")}: ${formatDZD(summary.inventoryValue, locale)}`}
        actions={access.export || access.import || canCreate ? (
          <div className="flex flex-wrap items-center gap-2">
            {access.export || access.import ? (
              <ImportExportButtons
                exportRoute={access.export ? "/api/export/products" : undefined}
                importRoute={access.import ? "/api/import/products" : undefined}
              />
            ) : null}
            {canCreate ? <ProductFormDialog categories={categories} /> : null}
          </div>
        ) : undefined}
      />

      <div className="card-grid-4">
        <StatCard
          label={t("products.total")}
          value={summary.total}
          icon={<Package />}
        />
        <StatCard
          label={t("common.active")}
          value={summary.active}
          icon={<Boxes />}
          subtitle={t("products.activeOutOf", { total: summary.total })}
        />
        <StatCard
          label={t("products.lowStock")}
          value={summary.lowStock}
          icon={<AlertTriangle />}
          trend={summary.lowStock > 0 ? -1 : 0}
          trendLabel={
            summary.lowStock > 0
              ? t("products.needsRestock")
              : t("products.stockOk")
          }
        />
        <StatCard
          label={t("products.inventoryValue")}
          value={formatDZD(summary.inventoryValue, locale)}
          icon={<DollarSign />}
        />
      </div>

      <ProductsDataTable
        fallback={{
          ...fallback,
          products: fallback.products.map((product) => ({
            ...product,
            createdAt:
              product.createdAt instanceof Date
                ? product.createdAt.toISOString()
                : product.createdAt,
          })),
        }}
        categories={categories}
      />
    </div>
  );
}
