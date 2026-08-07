import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AlertTriangle, Boxes, DollarSign, Package } from "lucide-react";

import { ProductFormDialog } from "@/components/products/product-form-dialog";
import { ProductsDataTable } from "@/components/products/products-data-table";
import { ImportExportButtons } from "@/components/shared/import-export-buttons";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { productService } from "@/lib/data/product-service";
import { db, shopContext } from "@/lib/db";
import { getI18n } from "@/lib/i18n-server";
import { requireTrustedAction } from "@/lib/identity/authorization";
import {
  getProductsWorkbenchPage,
  getProductWorkbenchSummary,
} from "@/lib/products/product-workbench";
import { formatDZD } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("metadata.title.products") };
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; sort?: string }>;
}) {
  const actorContext = await requireTrustedAction("products.read");
  const { t, locale } = await getI18n();
  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const [fallback, summary] = await Promise.all([
    getProductsWorkbenchPage(actorContext, {
      page,
      pageSize: 25,
      sort: params.sort,
    }),
    getProductWorkbenchSummary(actorContext),
  ]);
  const access = fallback.fieldAccess;
  const categories = access.manage
    ? await productService.listCategories({ prisma: db, shop: shopContext })
    : [];
  const lastPage = Math.max(1, Math.ceil(fallback.total / fallback.pageSize));
  if (page > lastPage) {
    const query = new URLSearchParams({ page: String(lastPage), sort: fallback.sort });
    redirect(`/products?${query.toString()}`);
  }

  return (
    <div className="app-content page-sections">
      {summary.lowStockProducts > 0 ? (
        <div className="flex items-start gap-3 rounded-md border border-warning/25 bg-warning/[0.04] p-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium">
              {summary.lowStockProducts > 1
                ? t("products.lowStockAlertMany", { count: summary.lowStockProducts })
                : t("products.lowStockAlertOne", { count: summary.lowStockProducts })}
            </p>
            <p className="text-xs text-muted-foreground">{t("products.lowStockAlertHint")}</p>
          </div>
        </div>
      ) : null}

      <PageHeader
        title={t("products.title")}
        description={`${t("products.totalStock")}: ${summary.totalProducts} · ${t("products.inventoryValue")}: ${formatDZD(summary.inventoryValue, locale)}`}
        actions={
          access.export || access.import || access.manage ? (
            <div className="flex flex-wrap items-center gap-2">
              {access.export || access.import ? (
                <ImportExportButtons
                  exportRoute={access.export ? "/api/export/products" : undefined}
                  importRoute={access.import ? "/api/import/products" : undefined}
                />
              ) : null}
              {access.manage ? <ProductFormDialog categories={categories} /> : null}
            </div>
          ) : undefined
        }
      />

      <div className="card-grid-4">
        <StatCard label={t("products.total")} value={summary.totalProducts} icon={<Package />} />
        <StatCard
          label={t("common.active")}
          value={summary.activeProducts}
          icon={<Boxes />}
          subtitle={t("products.activeOutOf", { total: summary.totalProducts })}
        />
        <StatCard
          label={t("products.lowStock")}
          value={summary.lowStockProducts}
          icon={<AlertTriangle />}
          trend={summary.lowStockProducts > 0 ? -1 : 0}
          trendLabel={summary.lowStockProducts > 0 ? t("products.needsRestock") : t("products.stockOk")}
        />
        <StatCard
          label={t("products.inventoryValue")}
          value={formatDZD(summary.inventoryValue, locale)}
          icon={<DollarSign />}
        />
      </div>

      <ProductsDataTable fallback={fallback} locale={locale} />
    </div>
  );
}
