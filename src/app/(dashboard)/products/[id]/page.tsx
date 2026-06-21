import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Package,
  AlertTriangle,
  Boxes,
  TrendingUp,
  ShoppingBag,
  Tag,
} from "lucide-react";

import { getI18n } from "@/lib/i18n-server";
import { db } from "@/lib/db";
import { productService } from "@/lib/data";
import { formatDZD, formatDate } from "@/lib/utils";
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
import { SahelFlowError } from "@/types/errors";
import type { OrderStatus } from "@/types/domain";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function ProductDetailPage({ params }: PageProps) {
  const { t, locale } = await getI18n();
  const { id } = await params;

  let product;
  try {
    product = await productService.getById({ prisma: db }, id);
  } catch (err) {
    if (err instanceof SahelFlowError && err.statusCode === 404) {
      notFound();
    }
    throw err;
  }

  // Resolve category name (if any)
  const category = product.categoryId
    ? await db.category.findUnique({ where: { id: product.categoryId } })
    : null;

  // Pull recent order items containing this product (no service method yet)
  const recentItems = await db.orderItem.findMany({
    where: { productId: id },
    include: { order: true },
    orderBy: { order: { createdAt: "desc" } },
    take: 20,
  });

  const isLowStock = product.stock <= product.lowStockThreshold;
  const inventoryValue = product.price * Math.max(0, product.stock);
  const margin =
    product.cost !== null && product.cost > 0
      ? product.price - product.cost
      : null;
  const marginPct =
    product.cost !== null && product.cost > 0 && product.price > 0
      ? Math.round(((product.price - product.cost) / product.price) * 100)
      : null;

  const statusLabels: Record<OrderStatus, string> = {
    draft: t("status.draft"),
    pending: t("status.pending"),
    confirmed: t("status.confirmed"),
    shipped: t("status.shipped"),
    delivered: t("status.delivered"),
    returned: t("status.returned"),
    refused: t("status.refused"),
    cancelled: t("status.cancelled"),
  };
  const statusBadgeVariant: Record<
    OrderStatus,
    "default" | "secondary" | "destructive" | "outline"
  > = {
    draft: "outline",
    pending: "secondary",
    confirmed: "default",
    shipped: "default",
    delivered: "default",
    returned: "destructive",
    refused: "destructive",
    cancelled: "destructive",
  };

  return (
    <div className="space-y-6 p-6">
      {/* Back link */}
      <Button variant="ghost" size="sm" asChild>
        <Link href="/products">
          <ArrowLeft className="h-4 w-4" />
          {t("products.title")}
        </Link>
      </Button>

      {/* Product header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{product.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {product.sku && (
              <span className="font-mono">
                {t("products.sku")}: {product.sku}
              </span>
            )}
            {category && (
              <span className="inline-flex items-center gap-1">
                <Tag className="h-3.5 w-3.5" />
                {category.name}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              {t("common.date")}: {formatDate(product.createdAt, locale)}
            </span>
          </div>
        </div>
        {isLowStock && (
          <Badge variant="destructive" className="self-start">
            <AlertTriangle className="h-3.5 w-3.5" />
            {t("products.lowStock")}
          </Badge>
        )}
      </div>

      {/* Stats strip */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("products.sellPrice")}
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatDZD(product.price)}</div>
            {product.cost !== null && (
              <p className="text-xs text-muted-foreground mt-1">
                {t("products.cost")}: {formatDZD(product.cost)}
                {margin !== null && (
                  <>
                    {" · "}
                    {t("products.value")}: {formatDZD(margin)}
                    {marginPct !== null && ` (${marginPct}%)`}
                  </>
                )}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("products.stock")}
            </CardTitle>
            <Boxes className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${isLowStock ? "text-destructive" : ""}`}
            >
              {product.stock}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {t("products.lowStock")}: {product.lowStockThreshold}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("products.inventoryValue")}
            </CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatDZD(inventoryValue)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("common.status")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {product.isActive ? (
              <Badge variant="default">{t("common.active")}</Badge>
            ) : (
              <Badge variant="secondary">{t("common.inactive")}</Badge>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent orders containing this product */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("customers.recentOrders")}</CardTitle>
        </CardHeader>
        <CardContent>
          {recentItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <ShoppingBag className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">{t("customers.noOrders")}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                  <TableHead className="text-right">{t("orders.quantity")}</TableHead>
                  <TableHead className="text-right">{t("orders.price")}</TableHead>
                  <TableHead className="text-right">{t("products.value")}</TableHead>
                  <TableHead>{t("common.date")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentItems.map((item) => {
                  const status = item.order.status as OrderStatus;
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono text-sm">
                        <Link
                          href="/orders"
                          className="font-medium hover:underline"
                        >
                          {item.order.orderNumber}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusBadgeVariant[status]}>
                          {statusLabels[status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {item.quantity}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatDZD(item.unitPrice)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatDZD(item.total)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(item.order.createdAt, locale)}
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
