import { getI18n } from "@/lib/i18n-server";
import { db } from "@/lib/db";
import { productService } from "@/lib/data";
import { formatDZD } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PremiumTable } from "@/components/shared/premium-table";
import { Package, Eye, AlertTriangle, Boxes, DollarSign, Download } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { ImportExportButtons } from "@/components/shared/import-export-buttons";
import { ProductFormDialog } from "@/components/products/product-form-dialog";
import { ProductRowActions } from "@/components/products/product-row-actions";
import type { Product } from "@/types/domain";

// Always fetch fresh data (local-first app, no ISR)
export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const { t } = await getI18n();
  const products = await productService.list({ prisma: db });
  const categories = await productService.listCategories({ prisma: db });

  // Build a categoryId → name lookup so the table can show category names
  const categoryNames = new Map(categories.map((c) => [c.id, c.name]));

  const totalProducts = products.length;
  const activeCount = products.filter((p) => p.isActive).length;
  const lowStockCount = products.filter(
    (p) => p.stock <= p.lowStockThreshold,
  ).length;
  const inventoryValue = products.reduce(
    (sum, p) => sum + p.price * Math.max(0, p.stock),
    0,
  );

  return (
    <div className="app-content page-sections">
      {/* Low stock alert banner */}
      {lowStockCount > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800/50 dark:bg-amber-950/30 p-3 animate-fade-up">
          <div className="flex size-8 items-center justify-center rounded-lg bg-amber-500/10">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
              {lowStockCount > 1
                ? t("products.lowStockAlertMany", { count: lowStockCount })
                : t("products.lowStockAlertOne", { count: lowStockCount })}
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-400">
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
            <Button variant="outline" size="sm" asChild>
              <Link href="/api/export/products">
                <Download className="me-1.5 h-4 w-4" />
                {t("products.export")}
              </Link>
            </Button>
            <ProductFormDialog categories={categories} />
          </div>
        }
      />

      {/* Stat strip — upgraded with accent icons */}
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
          accentIcon="text-emerald-600 dark:text-emerald-400"
          subtitle={t("products.activeOutOf", { total: totalProducts })}
          style={{ animationDelay: "120ms" }}
        />
        <StatCard
          label={t("products.lowStock")}
          value={lowStockCount}
          icon={<AlertTriangle />}
          accentBg="bg-amber-500/10 dark:bg-amber-500/15"
          accentIcon="text-amber-600 dark:text-amber-400"
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

      {/* Products table — upgraded styling */}
      <Card className="animate-fade-up" style={{ animationDelay: "240ms" }}>
        <CardHeader>
          <CardTitle className="text-base">{t("products.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          {products.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 p-5 mb-5 ring-1 ring-primary/10">
                <Package className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-base font-semibold mb-1.5">{t("products.noProductsTitle")}</h3>
              <p className="text-sm text-muted-foreground max-w-md mb-4">
                {t("products.noProductsDesc")}
              </p>
              <ProductFormDialog categories={categories} />
            </div>
          ) : (
            <PremiumTable>
              <PremiumTable.Header>
                <PremiumTable.Row>
                  <PremiumTable.Head>{t("products.productName")}</PremiumTable.Head>
                  <PremiumTable.Head hideOn="md">{t("products.sku")}</PremiumTable.Head>
                  <PremiumTable.Head hideOn="lg">{t("products.category")}</PremiumTable.Head>
                  <PremiumTable.Head align="end">{t("orders.price")}</PremiumTable.Head>
                  <PremiumTable.Head align="end">{t("products.stock")}</PremiumTable.Head>
                  <PremiumTable.Head align="center">{t("common.status")}</PremiumTable.Head>
                  <PremiumTable.Head align="end" width="w-20">{t("common.actions")}</PremiumTable.Head>
                </PremiumTable.Row>
              </PremiumTable.Header>
              <PremiumTable.Body>
                {products.map((product: Product) => {
                  const isLowStock = product.stock <= product.lowStockThreshold;
                  const categoryName = product.categoryId
                    ? categoryNames.get(product.categoryId) ?? null
                    : null;
                  return (
                    <PremiumTable.Row key={product.id}>
                      <PremiumTable.Cell className="font-medium">{product.name}</PremiumTable.Cell>
                      <PremiumTable.Cell hideOn="md" className="font-mono text-muted-foreground">
                        {product.sku ?? "—"}
                      </PremiumTable.Cell>
                      <PremiumTable.Cell hideOn="lg" className="text-muted-foreground">
                        {categoryName ?? t("products.noCategory")}
                      </PremiumTable.Cell>
                      <PremiumTable.Cell align="end" className="tabular-nums">
                        {formatDZD(product.price)}
                      </PremiumTable.Cell>
                      <PremiumTable.Cell align="end" className="tabular-nums">
                        <span className={isLowStock ? "text-destructive font-medium" : ""}>
                          {product.stock}
                        </span>
                        {isLowStock && (
                          <Badge variant="destructive" className="ms-2">
                            <AlertTriangle className="h-3 w-3" />
                            {t("products.low")}
                          </Badge>
                        )}
                      </PremiumTable.Cell>
                      <PremiumTable.Cell align="center">
                        {product.isActive ? (
                          <span className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50">
                            <span className="size-1.5 rounded-full bg-emerald-500" />
                            {t("common.active")}
                          </span>
                        ) : (
                          <Badge variant="secondary">{t("common.inactive")}</Badge>
                        )}
                      </PremiumTable.Cell>
                      <PremiumTable.Cell align="end">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon-sm" asChild>
                            <Link href={`/products/${product.id}`}>
                              <Eye className="h-4 w-4" />
                              <span className="sr-only">{t("products.viewDetails", { name: product.name })}</span>
                            </Link>
                          </Button>
                          <ProductRowActions product={product} categories={categories} />
                        </div>
                      </PremiumTable.Cell>
                    </PremiumTable.Row>
                  );
                })}
              </PremiumTable.Body>
            </PremiumTable>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
