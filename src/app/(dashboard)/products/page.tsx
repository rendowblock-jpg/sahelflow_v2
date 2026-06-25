import { getI18n } from "@/lib/i18n-server";
import { db } from "@/lib/db";
import { productService } from "@/lib/data";
import { formatDZD } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Package, Eye, AlertTriangle, Boxes, DollarSign } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
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

  const stats = [
    { label: t("products.product"), value: String(totalProducts), icon: Package, accentBg: "bg-sky-500/10 dark:bg-sky-500/15", accentIcon: "text-sky-600 dark:text-sky-400" },
    { label: t("common.active"), value: String(activeCount), icon: Boxes, accentBg: "bg-emerald-500/10 dark:bg-emerald-500/15", accentIcon: "text-emerald-600 dark:text-emerald-400" },
    { label: t("products.lowStock"), value: String(lowStockCount), icon: AlertTriangle, accentBg: "bg-amber-500/10 dark:bg-amber-500/15", accentIcon: "text-amber-600 dark:text-amber-400" },
    { label: t("products.inventoryValue"), value: formatDZD(inventoryValue), icon: DollarSign, accentBg: "bg-violet-500/10 dark:bg-violet-500/15", accentIcon: "text-violet-600 dark:text-violet-400" },
  ];

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
        actions={<ProductFormDialog categories={categories} />}
      />

      {/* Stat strip — upgraded with accent icons */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className="shadow-xs hover:shadow-md transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] animate-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.label}
                </CardTitle>
                <div className={`flex size-8 items-center justify-center rounded-lg ${stat.accentBg}`}>
                  <Icon className={`h-4 w-4 ${stat.accentIcon}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tabular-nums">{stat.value}</div>
              </CardContent>
            </Card>
          );
        })}
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
              <h3 className="text-lg font-semibold mb-1">{t("products.noProductsTitle")}</h3>
              <p className="text-sm text-muted-foreground max-w-md mb-4">
                {t("products.noProductsDesc")}
              </p>
              <ProductFormDialog categories={categories} />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("products.productName")}</TableHead>
                  <TableHead>{t("products.sku")}</TableHead>
                  <TableHead>{t("products.category")}</TableHead>
                  <TableHead className="text-end">{t("orders.price")}</TableHead>
                  <TableHead className="text-end">{t("products.stock")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                  <TableHead className="text-end">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product: Product) => {
                  const isLowStock = product.stock <= product.lowStockThreshold;
                  const categoryName = product.categoryId
                    ? categoryNames.get(product.categoryId) ?? null
                    : null;
                  return (
                    <TableRow key={product.id}>
                      <TableCell className="font-medium">{product.name}</TableCell>
                      <TableCell className="font-mono text-sm text-muted-foreground">
                        {product.sku ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {categoryName ?? t("products.noCategory")}
                      </TableCell>
                      <TableCell className="text-end tabular-nums">
                        {formatDZD(product.price)}
                      </TableCell>
                      <TableCell className="text-end tabular-nums">
                        <span className={isLowStock ? "text-destructive font-medium" : ""}>
                          {product.stock}
                        </span>
                        {isLowStock && (
                          <Badge variant="destructive" className="ms-2">
                            <AlertTriangle className="h-3 w-3" />
                            {t("products.low")}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {product.isActive ? (
                          <span className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50">
                            <span className="size-1.5 rounded-full bg-emerald-500" />
                            {t("common.active")}
                          </span>
                        ) : (
                          <Badge variant="secondary">{t("common.inactive")}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-end">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon-sm" asChild>
                            <Link href={`/products/${product.id}`}>
                              <Eye className="h-4 w-4" />
                              <span className="sr-only">{t("products.product")}</span>
                            </Link>
                          </Button>
                          <ProductRowActions product={product} categories={categories} />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
