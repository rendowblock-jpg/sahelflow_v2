import { db } from "@/lib/db";
import { orderService } from "@/lib/data/order-service";
import { deliveryService } from "@/lib/data/delivery-service";
import { formatDZD, formatDate } from "@/lib/utils";
import { NotFoundError } from "@/types/errors";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { OrderStatusActions } from "@/components/orders/order-status-actions";
import {
  ArrowRight,
  Phone,
  MapPin,
  Calendar,
  MessageSquare,
  Truck,
  Package,
  User,
  ArrowLeft,
} from "lucide-react";

export const metadata: Metadata = { title: "Commande — SahelFlow" };
export const revalidate = 0;
export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "outline",
  pending: "secondary",
  confirmed: "default",
  shipped: "default",
  delivered: "default",
  returned: "destructive",
  refused: "destructive",
  cancelled: "destructive",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Brouillon",
  pending: "En attente",
  confirmed: "Confirmée",
  shipped: "Expédiée",
  delivered: "Livrée",
  returned: "Retournée",
  refused: "Refusée",
  cancelled: "Annulée",
};

const SOURCE_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp",
  tiktok: "TikTok",
  manual: "Saisie manuelle",
  webstore: "Boutique en ligne",
  shopify: "Shopify",
  woocommerce: "WooCommerce",
  youcan: "YouCan",
};

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let order;
  try {
    order = await orderService.getById({ prisma: db }, id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  // Fetch customer + delivery
  const [customer, delivery] = await Promise.all([
    db.customer.findUnique({ where: { id: order.customerId } }),
    deliveryService.getByOrderId({ prisma: db }, order.id),
  ]);

  const itemsTotal = order.items.reduce((sum, item) => sum + item.total, 0);
  const deliveryCost = order.deliveryCost ?? 0;

  // Status timeline
  const timeline: Array<{ label: string; date: Date | null; done: boolean }> = [
    { label: "Créée", date: order.createdAt, done: true },
    { label: "Confirmée", date: order.confirmedAt, done: !!order.confirmedAt },
    { label: "Expédiée", date: order.shippedAt, done: !!order.shippedAt },
    { label: "Livrée", date: order.deliveredAt, done: !!order.deliveredAt },
  ];

  return (
    <div className="space-y-6 p-6 max-w-5xl mx-auto">
      {/* Breadcrumb + header */}
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href="/orders">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Retour aux commandes
          </Link>
        </Button>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight font-mono">
                {order.orderNumber}
              </h1>
              <Badge variant={STATUS_BADGE[order.status] ?? "outline"} className="text-sm">
                {STATUS_LABELS[order.status] ?? order.status}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              {formatDate(order.createdAt, "fr")}
              <span className="mx-1">·</span>
              <MessageSquare className="h-3.5 w-3.5" />
              {SOURCE_LABELS[order.source] ?? order.source}
            </p>
          </div>
        </div>

        {/* Status actions (client component) */}
        <Card>
          <CardContent className="pt-6">
            <OrderStatusActions orderId={order.id} currentStatus={order.status} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column: items + totals */}
        <div className="lg:col-span-2 space-y-6">
          {/* Items */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Package className="h-4 w-4" />
                Articles ({order.items.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {order.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between py-3 border-b last:border-0"
                  >
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">{item.productName}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.quantity} × {formatDZD(item.unitPrice)}
                      </p>
                    </div>
                    <p className="text-sm font-medium">{formatDZD(item.total)}</p>
                  </div>
                ))}
              </div>

              <Separator className="my-4" />

              {/* Totals */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Sous-total</span>
                  <span>{formatDZD(itemsTotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Livraison</span>
                  <span>{deliveryCost > 0 ? formatDZD(deliveryCost) : "—"}</span>
                </div>
                <Separator />
                <div className="flex justify-between text-base font-bold">
                  <span>Total</span>
                  <span>{formatDZD(order.totalPrice)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Delivery info */}
          {delivery && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Truck className="h-4 w-4" />
                  Livraison
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Transporteur</span>
                  <span className="font-medium capitalize">{delivery.provider}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Suivi</span>
                  <span className="font-mono text-xs">
                    {delivery.trackingNumber ?? "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Coût</span>
                  <span className="font-medium">
                    {delivery.cost ? formatDZD(delivery.cost) : "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Statut</span>
                  <Badge variant="outline" className="capitalize">
                    {delivery.status.replace(/_/g, " ")}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Notes */}
          {order.notes && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {order.notes}
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right column: customer + timeline */}
        <div className="space-y-6">
          {/* Customer */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <User className="h-4 w-4" />
                Client
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {customer ? (
                <>
                  <div>
                    <p className="text-sm font-medium">{customer.name}</p>
                    {customer.orderCount > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {customer.orderCount} commande{customer.orderCount > 1 ? "s" : ""} ·{" "}
                        {formatDZD(customer.totalSpent)}
                      </p>
                    )}
                  </div>
                  <Separator />
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                      <a href={`tel:${customer.phone}`} className="hover:underline">
                        {customer.phone}
                      </a>
                    </div>
                    {customer.wilaya && (
                      <div className="flex items-center gap-2">
                        <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>
                          {customer.commune ?? ""}, {customer.wilaya}
                        </span>
                      </div>
                    )}
                  </div>
                  <Button variant="outline" size="sm" className="w-full" asChild>
                    <Link href={`/customers/${customer.id}`}>
                      Voir la fiche client
                      <ArrowRight className="h-3.5 w-3.5 ml-1" />
                    </Link>
                  </Button>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Client introuvable</p>
              )}
            </CardContent>
          </Card>

          {/* Delivery address */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <MapPin className="h-4 w-4" />
                Adresse de livraison
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p className="font-medium">{order.phone}</p>
              <p className="text-muted-foreground">{order.address}</p>
              <p className="text-muted-foreground">
                {order.commune}, {order.wilaya}
              </p>
            </CardContent>
          </Card>

          {/* Status timeline */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Suivi</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {timeline.map((step, i) => (
                  <div key={step.label} className="flex items-start gap-3">
                    <div className="flex flex-col items-center">
                      <div
                        className={`h-2.5 w-2.5 rounded-full ${
                          step.done ? "bg-primary" : "bg-muted-foreground/30"
                        }`}
                      />
                      {i < timeline.length - 1 && (
                        <div
                          className={`w-0.5 h-8 ${
                            step.done ? "bg-primary" : "bg-muted-foreground/20"
                          }`}
                        />
                      )}
                    </div>
                    <div className="pt-0">
                      <p className={`text-sm font-medium ${step.done ? "" : "text-muted-foreground"}`}>
                        {step.label}
                      </p>
                      {step.date && (
                        <p className="text-xs text-muted-foreground">
                          {formatDate(step.date, "fr")}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
