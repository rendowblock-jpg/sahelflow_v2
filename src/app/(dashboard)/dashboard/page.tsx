"use client";

import { useI18n } from "@/hooks/use-i18n";
import { useShopStore } from "@/stores/shop-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ShoppingCart,
  Users,
  Package,
  TrendingUp,
  MessageSquare,
  Truck,
  ArrowUpRight,
  ArrowDownRight,
  Bot,
} from "lucide-react";

// Stub data — will be replaced with real Prisma queries in the data layer phase
const stubStats = {
  ordersToday: 0,
  ordersTrend: 0,
  revenueToday: 0,
  revenueTrend: 0,
  newCustomers: 0,
  activeConversations: 0,
  pendingDeliveries: 0,
  lowStockProducts: 0,
};

export default function DashboardPage() {
  const { t, locale } = useI18n();
  const activeShop = useShopStore((s) => s.shops.find((shop) => shop.id === s.activeShopId) ?? null);

  const stats = [
    {
      label: t("nav.orders"),
      value: String(stubStats.ordersToday),
      icon: ShoppingCart,
      trend: stubStats.ordersTrend,
      format: "count",
    },
    {
      label: t("nav.accounting"),
      value: formatDZD(stubStats.revenueToday),
      icon: TrendingUp,
      trend: stubStats.revenueTrend,
      format: "currency",
    },
    {
      label: t("nav.customers"),
      value: String(stubStats.newCustomers),
      icon: Users,
      trend: 0,
      format: "count",
    },
    {
      label: t("nav.inbox"),
      value: String(stubStats.activeConversations),
      icon: MessageSquare,
      trend: 0,
      format: "count",
    },
  ];

  return (
    <div className="space-y-6 p-6">
      {/* Welcome header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {activeShop?.name ?? t("nav.dashboard")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("nav.dashboard")} — {locale === "ar" ? "أهلا بك" : locale === "fr" ? "Bienvenue" : "Welcome"}
          </p>
        </div>
        <Badge variant="outline" className="gap-1.5">
          <Bot className="h-3 w-3" />
          <span className="text-xs">AI: {t("nav.agents")}</span>
        </Badge>
      </div>

      {/* Stats grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          const isPositive = stat.trend > 0;
          const isNegative = stat.trend < 0;
          return (
            <Card key={stat.label}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.label}
                </CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                {stat.trend !== 0 && (
                  <div className="flex items-center gap-1 text-xs">
                    {isPositive && <ArrowUpRight className="h-3 w-3 text-green-600" />}
                    {isNegative && <ArrowDownRight className="h-3 w-3 text-red-600" />}
                    <span className={isPositive ? "text-green-600" : "text-red-600"}>
                      {Math.abs(stat.trend)}%
                    </span>
                    <span className="text-muted-foreground">vs hier</span>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Secondary cards: deliveries + products */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Truck className="h-4 w-4" />
              {t("nav.delivery")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold">{stubStats.pendingDeliveries}</p>
                <p className="text-xs text-muted-foreground">en attente</p>
              </div>
              <Button variant="outline" size="sm">
                {t("nav.delivery")}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Package className="h-4 w-4" />
              {t("nav.products")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold">{stubStats.lowStockProducts}</p>
                <p className="text-xs text-muted-foreground">stock faible</p>
              </div>
              <Button variant="outline" size="sm">
                {t("nav.products")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Empty state — no data yet */}
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <div className="rounded-full bg-muted p-4 mb-4">
            <ShoppingCart className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-1">
            {locale === "ar" ? "ابدأ بإضافة طلبات" : locale === "fr" ? "Commencez par ajouter des commandes" : "Start by adding orders"}
          </h3>
          <p className="text-sm text-muted-foreground max-w-md mb-4">
            {locale === "ar"
              ? "اربط واتساب للبدء في استخراج الطلبات تلقائيا بالذكاء الاصطناعي"
              : locale === "fr"
              ? "Connectez WhatsApp pour commencer à extraire les commandes automatiquement avec l'IA"
              : "Connect WhatsApp to start extracting orders automatically with AI"}
          </p>
          <Button>
            <MessageSquare className="h-4 w-4 mr-2" />
            {t("nav.inbox")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function formatDZD(amount: number): string {
  return new Intl.NumberFormat("fr-DZ", {
    style: "decimal",
    maximumFractionDigits: 0,
  }).format(amount) + " DA";
}
