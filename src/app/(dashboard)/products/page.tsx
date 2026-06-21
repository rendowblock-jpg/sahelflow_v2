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
import { Package, Eye, AlertTriangle, Boxes, TrendingUp } from "lucide-react";
import Link from "next/link";
import { ProductFormDialog } from "@/components/products/product-form-dialog";
import type { Product } from "@/types/domain";

// Always fetch fresh data (local-first app, no ISR)
export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const { t } = await getI18n();
  const products = await productService.list({ prisma: db });
  const categories = await productService.listCategories({ prisma: db });

  // Build a categoryId → name lookup so the table can show category names
  // without an extra join (productService.list doesn't include category).
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
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("products.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("products.totalStock")}: {totalProducts} ·{" "}
            {t("products.inventoryValue")}: {formatDZD(inventoryValue)}
          </p>
        </div>
        <ProductFormDialog categories={categories} />
      </div>

      {/* Stat strip */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("products.product")}
            </CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalProducts}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("common.active")}
            </CardTitle>
            <Boxes className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("products.lowStock")}
            </CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{lowStockCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("products.inventoryValue")}
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatDZD(inventoryValue)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Products table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("products.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          {products.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="rounded-full bg-muted p-4 mb-4">
                <Package className="h-8 w-8 text-muted-foreground" />
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
                  <TableHead className="text-right">{t("orders.price")}</TableHead>
                  <TableHead className="text-right">{t("products.stock")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                  <TableHead className="text-right">{t("common.actions")}</TableHead>
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
                      <TableCell className="text-right tabular-nums">
                        {formatDZD(product.price)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <span className={isLowStock ? "text-destructive font-medium" : ""}>
                          {product.stock}
                        </span>
                        {isLowStock && (
                          <Badge variant="destructive" className="ml-2">
                            <AlertTriangle className="h-3 w-3" />
                            {t("products.low")}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {product.isActive ? (
                          <Badge variant="default">{t("common.active")}</Badge>
                        ) : (
                          <Badge variant="secondary">{t("common.inactive")}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/products/${product.id}`}>
                            <Eye className="h-4 w-4" />
                            <span className="sr-only">{t("products.product")}</span>
                          </Link>
                        </Button>
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
