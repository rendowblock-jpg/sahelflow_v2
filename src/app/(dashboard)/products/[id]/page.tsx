import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Package,
  AlertTriangle,
  Boxes,
  TrendingUp,
  ShoppingBag,
} from "lucide-react";

import { getI18n } from "@/lib/i18n-server";
import { db, shopContext } from "@/lib/db";
import { productService } from "@/lib/data";
import { formatDZD, formatDate } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SahelFlowError } from "@/types/errors";
import { ProductVariantPicker, type VariantOption } from "@/components/products/product-variant-picker";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { DollarSign } from "lucide-react";
import type { OrderStatus } from "@/types/domain";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function ProductDetailPage({ params }: PageProps) {
  const { t, locale } = await getI18n();
  const { id } = await params;

  let product;
  try {
    product = await productService.getById({ prisma: db, shop: shopContext }, id);
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

  // Pull recent order items containing this product (no service method yet).
  // P-M7: filter on order.deletedAt = null so soft-deleted orders do not leak
  // into the "recent orders" list shown on the product detail page.
  const recentItems = await db.orderItem.findMany({
    where: { productId: id, order: { deletedAt: null } },
    include: { order: true },
    orderBy: { order: { createdAt: "desc" } },
    take: 20,
  });

  const isLowStock = product.stock <= product.lowStockThreshold;
  const inventoryValue = product.price * Math.max(0, product.stock);

  // Extract variants from the product relation (loaded by the service)
  const productVariants: VariantOption[] = ((product as { productVariants?: VariantOption[] }).productVariants ?? []).map((v) => ({
    id: v.id,
    name: v.name,
    sku: v.sku,
    price: v.price,
    stock: v.stock,
    isActive: v.isActive,
  }));
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
    <div className="app-content page-sections">
      <Breadcrumbs
        items={[
          { label: t("products.title"), href: "/products" },
          { label: product.name },
        ]}
      />

      <PageHeader
        title={product.name}
        description={
          [product.sku && `${t("products.sku")}: ${product.sku}`,
           category?.name,
           formatDate(product.createdAt, locale)]
          .filter(Boolean).join(" · ")
        }
        actions={
          isLowStock ? (
            <Badge variant="destructive">
              <AlertTriangle className="h-3.5 w-3.5" />
              {t("products.lowStock")}
            </Badge>
          ) : undefined
        }
      />

      {/* Stats strip — using StatCard for visual consistency */}
      <div className="card-grid-4 stagger-grid">
        <StatCard
          label={t("products.sellPrice")}
          value={formatDZD(product.price)}
          icon={<TrendingUp />}
          accentBg="bg-emerald-500/10 dark:bg-emerald-500/15"
          accentIcon="text-success"
          subtitle={
            product.cost !== null
              ? `${t("products.cost")}: ${formatDZD(product.cost)}${margin !== null ? ` · ${t("products.value")}: ${formatDZD(margin)}${marginPct !== null ? ` (${marginPct}%)` : ""}` : ""}`
              : undefined
          }
          style={{ animationDelay: "60ms" }}
        />
        <StatCard
          label={t("products.stock")}
          value={product.stock}
          icon={<Boxes />}
          accentBg={isLowStock ? "bg-amber-500/10 dark:bg-amber-500/15" : "bg-teal-500/10 dark:bg-teal-500/15"}
          accentIcon={isLowStock ? "text-warning" : "text-teal-600 dark:text-teal-400"}
          subtitle={`${t("products.lowStock")}: ${product.lowStockThreshold}`}
          style={{ animationDelay: "120ms" }}
        />
        <StatCard
          label={t("products.inventoryValue")}
          value={formatDZD(inventoryValue)}
          icon={<Package />}
          accentBg="bg-violet-500/10 dark:bg-violet-500/15"
          accentIcon="text-violet-600 dark:text-violet-400"
          style={{ animationDelay: "180ms" }}
        />
        <StatCard
          label={t("common.status")}
          value={product.isActive ? t("common.active") : t("common.inactive")}
          icon={<DollarSign />}
          accentBg={product.isActive ? "bg-emerald-500/10 dark:bg-emerald-500/15" : "bg-muted"}
          accentIcon={product.isActive ? "text-success" : "text-muted-foreground"}
          style={{ animationDelay: "240ms" }}
        />
      </div>

      {/* Variants section — per-variant stock + price */}
      {productVariants.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("products.variantsSection")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <ProductVariantPicker
                  variants={productVariants}
                  defaultPrice={product.price}
                />
                <div className="rounded-md border p-3 bg-muted/30">
                  <div className="text-xs text-muted-foreground mb-2">
                    {t("products.allVariants")}
                  </div>
                  <div className="space-y-2">
                    {productVariants.map((v) => (
                      <div key={v.id} className="flex items-center justify-between text-sm">
                        <span className="font-medium">{v.name}</span>
                        <div className="flex items-center gap-3 text-muted-foreground">
                          <span className="tabular-nums">
                            {v.price !== null ? formatDZD(v.price) : formatDZD(product.price)}
                          </span>
                          <span className={`tabular-nums ${v.stock <= 5 ? "text-destructive font-medium" : ""}`}>
                            {v.stock} {t("products.inStock")}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

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
            <div className="overflow-x-auto">
        <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                  <TableHead className="text-end">{t("orders.quantity")}</TableHead>
                  <TableHead className="text-end">{t("orders.price")}</TableHead>
                  <TableHead className="text-end">{t("products.value")}</TableHead>
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
                          href={`/orders/${item.order.id}`}
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
                      <TableCell className="text-end tabular-nums">
                        {item.quantity}
                      </TableCell>
                      <TableCell className="text-end tabular-nums">
                        {formatDZD(item.unitPrice)}
                      </TableCell>
                      <TableCell className="text-end tabular-nums">
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
        </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
