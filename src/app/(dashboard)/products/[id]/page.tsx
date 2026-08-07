import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, Boxes, DollarSign, Package, ShoppingBag, TrendingUp } from "lucide-react";

import { ProductRowActions } from "@/components/products/product-row-actions";
import { ProductVariantPicker, type VariantOption } from "@/components/products/product-variant-picker";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getI18n } from "@/lib/i18n-server";
import { requireTrustedAction } from "@/lib/identity/authorization";
import { getProductWorkbenchDetail } from "@/lib/products/product-workbench";
import { formatDZD, formatDate } from "@/lib/utils";
import type { OrderStatus } from "@/types/domain";
import { SahelFlowError } from "@/types/errors";

export const dynamic = "force-dynamic";
type PageProps = { params: Promise<{ id: string }> };

export default async function ProductDetailPage({ params }: PageProps) {
  const actorContext = await requireTrustedAction("products.read");
  const { t, locale } = await getI18n();
  const { id } = await params;
  let detail;
  try {
    detail = await getProductWorkbenchDetail(actorContext, id);
  } catch (error) {
    if (error instanceof SahelFlowError && error.statusCode === 404) notFound();
    throw error;
  }
  const { product, recentOrders, fieldAccess } = detail;
  const lowStock = product.stock <= product.lowStockThreshold;
  const inventoryValue = product.price * Math.max(0, product.stock);
  const margin = product.cost !== null ? product.price - product.cost : null;
  const marginPct = margin !== null && product.price > 0 ? Math.round((margin / product.price) * 100) : null;
  const variants: VariantOption[] = product.productVariants.map((variant) => ({ id: variant.id, name: variant.name, sku: variant.sku, price: variant.price, stock: variant.stock, isActive: variant.isActive }));
  const statusVariant: Record<OrderStatus, "default" | "secondary" | "destructive" | "outline"> = { draft: "outline", pending: "secondary", confirmed: "default", shipped: "default", delivered: "default", returned: "destructive", refused: "destructive", cancelled: "destructive" };

  return (
    <div className="app-content page-sections">
      <Breadcrumbs items={[{ label: t("products.title"), href: "/products" }, { label: product.name }]} />
      <PageHeader
        title={product.name}
        description={[product.sku && `${t("products.sku")}: ${product.sku}`, product.categoryName, formatDate(product.createdAt, locale)].filter(Boolean).join(" · ")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {lowStock ? <Badge variant="destructive"><AlertTriangle className="size-3.5" />{t("products.lowStock")}</Badge> : null}
            {fieldAccess.manage ? <ProductRowActions product={{ id: product.id, name: product.name, sku: product.sku, price: product.price, cost: product.cost, stock: product.stock, lowStockThreshold: product.lowStockThreshold, categoryId: product.categoryId, images: product.images, isActive: product.isActive, productVariants: product.productVariants }} /> : null}
          </div>
        }
      />

      <div className="card-grid-4">
        <StatCard label={t("products.sellPrice")} value={formatDZD(product.price, locale)} icon={<TrendingUp />} subtitle={product.cost !== null ? `${t("products.cost")}: ${formatDZD(product.cost, locale)}${margin !== null ? ` · ${formatDZD(margin, locale)}${marginPct !== null ? ` (${marginPct}%)` : ""}` : ""}` : undefined} />
        <StatCard label={t("products.stock")} value={product.stock} icon={<Boxes />} subtitle={`${t("products.lowStock")}: ${product.lowStockThreshold}`} />
        <StatCard label={t("products.inventoryValue")} value={formatDZD(inventoryValue, locale)} icon={<Package />} />
        <StatCard label={t("common.status")} value={product.isActive ? t("common.active") : t("common.inactive")} icon={<DollarSign />} />
      </div>

      {variants.length > 0 ? (
        <Card><CardHeader><CardTitle className="text-base">{t("products.variantsSection")}</CardTitle></CardHeader><CardContent><ProductVariantPicker variants={variants} defaultPrice={product.price} /></CardContent></Card>
      ) : null}

      {fieldAccess.orders ? (
        <Card>
          <CardHeader><CardTitle className="text-base">{t("customers.recentOrders")}</CardTitle></CardHeader>
          <CardContent>
            {recentOrders.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">{t("customers.noOrders")}</p> : (
              <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>#</TableHead><TableHead>{t("common.status")}</TableHead><TableHead className="text-end">{t("orders.quantity")}</TableHead>{fieldAccess.orderFinancials ? <><TableHead className="text-end">{t("orders.price")}</TableHead><TableHead className="text-end">{t("products.value")}</TableHead></> : null}<TableHead>{t("common.date")}</TableHead></TableRow></TableHeader><TableBody>{recentOrders.map((item) => { const status = item.status as OrderStatus; return <TableRow key={item.id}><TableCell><Link href={`/orders/${item.orderId}`} className="rounded-sm font-mono font-medium hover:underline focus-visible:ring-2 focus-visible:ring-ring">{item.orderNumber}</Link></TableCell><TableCell><Badge variant={statusVariant[status]}>{t(`status.${status}`)}</Badge></TableCell><TableCell className="text-end tabular-nums">{item.quantity}</TableCell>{fieldAccess.orderFinancials ? <><TableCell className="text-end tabular-nums">{formatDZD(item.unitPrice ?? 0, locale)}</TableCell><TableCell className="text-end tabular-nums">{formatDZD(item.total ?? 0, locale)}</TableCell></> : null}<TableCell className="text-sm text-muted-foreground">{formatDate(item.createdAt, locale)}</TableCell></TableRow>; })}</TableBody></Table></div>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
