import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Banknote,
  LockKeyhole,
  MessageSquare,
  Package,
  PiggyBank,
  ShoppingCart,
  TrendingDown,
  Truck,
  Users,
} from "lucide-react";

import {
  AttentionCenter,
  type AttentionItem,
} from "@/components/dashboard/attention-center";
import { PageHeader } from "@/components/shared/page-header";
import { StateSurface } from "@/components/shared/state-surface";
import { StatCard } from "@/components/shared/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getDashboardAnalytics } from "@/lib/data/analytics-data";
import { getDashboardStats, getRecentOrders } from "@/lib/data/dashboard";
import { getStaleOrderCount } from "@/lib/data/confirmation-queue";
import { db, shopContext } from "@/lib/db";
import { getI18n } from "@/lib/i18n-server";
import {
  formatPositiveRiskPoints,
  getRiskWorkspaceCopy,
} from "@/lib/i18n/risk-workspace";
import { requireTrustedAction } from "@/lib/identity/authorization";
import {
  projectDashboardForTrustedActor,
  resolveDashboardFieldAccess,
} from "@/lib/identity/dashboard-projection";
import { getRiskAnalyticsReport } from "@/lib/risk-engine";
import { orderStatusStyles } from "@/lib/shared";
import { statusI18nKey } from "@/lib/shared/status-colors";
import { formatDZD } from "@/lib/utils";
import type { OrderStatus } from "@/types/domain";

export default async function DashboardPage() {
  const { t, locale } = await getI18n();
  const actorContext = await requireTrustedAction("shops.read");
  const fieldAccess = resolveDashboardFieldAccess(actorContext);

  const [
    rawStats,
    rawRecentOrders,
    rawAnalytics,
    staleConfirmations,
    riskReport,
  ] = await Promise.all([
    getDashboardStats(fieldAccess),
    fieldAccess.orders
      ? getRecentOrders(8, fieldAccess)
      : Promise.resolve([]),
    getDashboardAnalytics(fieldAccess),
    fieldAccess.orders ? getStaleOrderCount() : Promise.resolve(0),
    fieldAccess.risk
      ? getRiskAnalyticsReport({ prisma: db, shop: shopContext }, 30)
      : Promise.resolve(null),
  ]);

  const { stats, recentOrders, analytics } = projectDashboardForTrustedActor(
    {
      stats: rawStats,
      recentOrders: rawRecentOrders,
      analytics: rawAnalytics,
    },
    fieldAccess,
  );

  const dateLocale =
    locale === "ar" ? "ar-DZ" : locale === "en" ? "en-GB" : "fr-DZ";
  const integerFormatter = new Intl.NumberFormat(dateLocale, {
    maximumFractionDigits: 0,
  });
  const percentFormatter = new Intl.NumberFormat(dateLocale, {
    style: "percent",
    maximumFractionDigits: 0,
  });
  const revenueSpark = analytics.revenueSeries.flatMap((point) =>
    point.revenue === null ? [] : [{ value: point.revenue }],
  );
  const ordersSpark = analytics.revenueSeries.map((point) => ({
    value: point.orders,
  }));
  const customersSpark = analytics.customerGrowth.map((point) => ({
    value: point.newCustomers,
  }));

  const hour = new Date().getHours();
  const greeting =
    hour < 12
      ? t("dashboard.greetingMorning")
      : hour < 18
        ? t("dashboard.greetingAfternoon")
        : t("dashboard.greetingEvening");
  const delivery = analytics.deliveryPerformance;
  const riskCopy = (key: Parameters<typeof getRiskWorkspaceCopy>[1]) =>
    getRiskWorkspaceCopy(locale, key);
  const riskTopFactor = riskReport?.attentionFactors[0];
  const highRiskShare =
    riskReport && riskReport.totalOrders > 0
      ? riskReport.kpis.highRiskOrderCount / riskReport.totalOrders
      : 0;

  const attentionItems: AttentionItem[] = [
    ...(fieldAccess.orders
      ? [
          {
            id: "confirmation-stale",
            label: t("confirmationQueue.stale"),
            value: staleConfirmations,
            href: "/orders/confirmation-queue",
            icon: AlertTriangle,
            tone: "danger" as const,
          },
        ]
      : []),
    ...(fieldAccess.deliveries && stats.pendingDeliveries !== null
      ? [
          {
            id: "delivery-pending",
            label: t("nav.delivery"),
            value: stats.pendingDeliveries,
            href: "/deliveries?status=pending",
            icon: Truck,
            tone: "warning" as const,
          },
        ]
      : []),
    ...(fieldAccess.conversations && stats.activeConversations !== null
      ? [
          {
            id: "active-conversations",
            label: t("dashboard.activeConversations"),
            value: stats.activeConversations,
            href: "/inbox",
            icon: MessageSquare,
            tone: "neutral" as const,
          },
        ]
      : []),
    ...(fieldAccess.products && stats.lowStockProducts !== null
      ? [
          {
            id: "low-stock",
            label: t("dashboard.lowStock"),
            value: stats.lowStockProducts,
            href: "/products",
            icon: Package,
            tone: "warning" as const,
          },
        ]
      : []),
  ];
  const hasAttentionAuthority =
    fieldAccess.orders ||
    fieldAccess.deliveries ||
    fieldAccess.conversations ||
    fieldAccess.products;

  return (
    <div className="app-content page-sections">
      <PageHeader
        title={<span suppressHydrationWarning>{greeting}</span>}
        description={t("dashboard.activityOverview")}
      />

      <div className="card-grid-4">
        <StatCard
          label={t("dashboard.todaysOrders")}
          value={
            stats.ordersToday === null
              ? "—"
              : integerFormatter.format(stats.ordersToday)
          }
          icon={<ShoppingCart />}
          trend={stats.ordersTrend ?? undefined}
          trendDirectionOnly={false}
          trendLabel={t("dashboard.vsYesterday")}
          spark={ordersSpark}
          sparkColor="var(--color-chart-1)"
        />
        <StatCard
          label={t("dashboard.grossRevenue")}
          value={
            stats.revenueToday === null
              ? "—"
              : formatDZD(stats.revenueToday, locale)
          }
          icon={<Banknote />}
          trend={stats.revenueTrend ?? undefined}
          trendDirectionOnly={false}
          trendLabel={t("dashboard.vsYesterday")}
          subtitle={
            stats.realizedRevenueToday === null
              ? undefined
              : `${t("dashboard.realizedRevenue")}: ${formatDZD(
                  stats.realizedRevenueToday,
                  locale,
                )}`
          }
          tooltip={t("dashboard.grossRevenueTooltip")}
          spark={revenueSpark}
          sparkColor="var(--color-chart-2)"
        />
        <StatCard
          label={t("dashboard.newCustomersToday")}
          value={
            stats.newCustomers === null
              ? "—"
              : integerFormatter.format(stats.newCustomers)
          }
          icon={<Users />}
          spark={customersSpark}
          sparkColor="var(--color-chart-3)"
          subtitle={t("dashboard.last7Days")}
        />
        <StatCard
          label={t("dashboard.deliveryRate")}
          value={
            delivery
              ? percentFormatter.format(delivery.deliveryRate / 100)
              : "—"
          }
          icon={<Truck />}
          subtitle={
            stats.pendingDeliveries === null
              ? undefined
              : t("dashboard.pendingDeliveries", {
                  count: stats.pendingDeliveries,
                })
          }
        />
      </div>

      {hasAttentionAuthority ? (
        <AttentionCenter
          title={t("dashboard.filterAlerts")}
          items={attentionItems}
          allClearLabel={t("confirmationQueue.allCaughtUp")}
        />
      ) : (
        <StateSurface
          icon={LockKeyhole}
          title={t("error.forbidden")}
          tone="info"
          size="inline"
        />
      )}

      <div
        data-dashboard-operational-grid="true"
        className="grid min-w-0 items-start gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]"
      >
        <section className="min-w-0 rounded-md border border-border/80 bg-background">
          <div className="flex items-center justify-between gap-3 border-b border-border/70 px-3 py-2.5">
            <h2 className="text-sm font-semibold">
              {t("dashboard.recentOrders")}
            </h2>
            {fieldAccess.orders ? (
              <Button variant="ghost" size="sm" asChild>
                <Link href="/orders">
                  {t("dashboard.viewAll")}
                  <ArrowRight
                    className="ms-1 size-3.5 rtl:rotate-180"
                    aria-hidden="true"
                  />
                </Link>
              </Button>
            ) : null}
          </div>

          {!fieldAccess.orders ? (
            <StateSurface
              icon={LockKeyhole}
              title={t("error.forbidden")}
              tone="info"
              size="inline"
              className="rounded-none border-0"
            />
          ) : recentOrders.length === 0 ? (
            <StateSurface
              icon={ShoppingCart}
              title={t("dashboard.noOrders")}
              description={t("dashboard.ordersWillAppear")}
              size="inline"
            />
          ) : (
            <div className="divide-y divide-border/70">
              {recentOrders.map((order) => {
                const statusStyle =
                  orderStatusStyles[order.status as OrderStatus];
                const itemCount = integerFormatter.format(order.itemCount);
                const itemLabel =
                  order.itemCount > 1
                    ? t("dashboard.itemsPlural", { n: itemCount })
                    : t("dashboard.items", { n: itemCount });
                return (
                  <Link
                    key={order.id}
                    href={`/orders/${order.id}`}
                    className="flex min-h-14 min-w-0 items-center justify-between gap-3 px-3 py-2.5 outline-none transition-colors hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className="shrink-0 font-mono text-sm font-medium"
                        data-order-number
                      >
                        {order.orderNumber}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {order.customerName ?? "—"}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {itemLabel}
                          {order.wilaya ? ` · ${order.wilaya}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {order.totalPrice !== null ? (
                        <span
                          className="hidden text-sm font-medium tabular-nums sm:inline"
                          data-money
                        >
                          {formatDZD(order.totalPrice, locale)}
                        </span>
                      ) : null}
                      {statusStyle ? (
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${statusStyle.bg} ${statusStyle.text} ${statusStyle.border}`}
                        >
                          <span
                            className={`size-1.5 rounded-full ${statusStyle.dot}`}
                            aria-hidden="true"
                          />
                          {t(statusStyle.i18nKey)}
                        </span>
                      ) : (
                        <Badge variant="outline">
                          {t(statusI18nKey(order.status as never))}
                        </Badge>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <div className="grid min-w-0 gap-3">
          <section className="rounded-md border border-border/80 bg-background">
            <div className="flex items-center justify-between border-b border-border/70 px-3 py-2.5">
              <h2 className="text-sm font-semibold">{t("nav.delivery")}</h2>
              {fieldAccess.deliveries ? (
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/deliveries">
                    {t("dashboard.viewAll")}
                    <ArrowRight
                      className="ms-1 size-3.5 rtl:rotate-180"
                      aria-hidden="true"
                    />
                  </Link>
                </Button>
              ) : null}
            </div>
            {delivery ? (
              <div className="grid grid-cols-2 gap-px bg-border/70">
                {[
                  [
                    t("dashboard.deliveryRate"),
                    percentFormatter.format(delivery.deliveryRate / 100),
                  ],
                  [
                    t("dashboard.inTransit"),
                    integerFormatter.format(delivery.inTransit),
                  ],
                  [
                    t("dashboard.pending"),
                    integerFormatter.format(delivery.pending),
                  ],
                  [
                    t("analytics.returned"),
                    integerFormatter.format(delivery.returned),
                  ],
                ].map(([label, value]) => (
                  <div key={String(label)} className="bg-background px-3 py-3">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">
                      {value}
                    </p>
                  </div>
                ))}
              </div>
            ) : fieldAccess.deliveries ? (
              <div className="px-3 py-5 text-sm text-muted-foreground">—</div>
            ) : (
              <StateSurface
                icon={LockKeyhole}
                title={t("error.forbidden")}
                tone="info"
                size="inline"
                className="rounded-none border-0"
              />
            )}
          </section>

          {fieldAccess.risk && riskReport ? (
            <section
              data-dashboard-risk-watch="true"
              className="overflow-hidden rounded-md border border-border/80 bg-background"
            >
              <div className="flex items-start justify-between gap-3 border-b border-border/70 px-3 py-2.5">
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold">
                    {riskCopy("attentionTitle")}
                  </h2>
                  <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-muted-foreground">
                    {riskCopy("attentionDescription")}
                  </p>
                </div>
                <Button variant="ghost" size="icon-sm" asChild>
                  <Link
                    href="/risk?days=30&tab=overview"
                    aria-label={riskCopy("openAnalysis")}
                  >
                    <ArrowRight
                      className="size-3.5 rtl:rotate-180"
                      aria-hidden="true"
                    />
                  </Link>
                </Button>
              </div>

              <div className="divide-y divide-border/70 px-3">
                <div className="flex min-w-0 items-center gap-3 py-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-destructive/25 bg-destructive/5 text-destructive">
                    <AlertTriangle className="size-3.5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground">
                      {t("risk.kpi.highRiskOrders")}
                    </p>
                    <p className="mt-0.5 text-base font-semibold tabular-nums">
                      {integerFormatter.format(riskReport.kpis.highRiskOrderCount)}
                    </p>
                  </div>
                  {riskReport.totalOrders > 0 ? (
                    <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
                      {percentFormatter.format(highRiskShare)}
                    </span>
                  ) : null}
                </div>

                <div className="flex min-w-0 items-center gap-3 py-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-muted/35 text-muted-foreground">
                    <TrendingDown className="size-3.5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground">
                      {t("risk.kpi.returnRate")}
                    </p>
                    <p className="mt-0.5 text-base font-semibold tabular-nums">
                      {percentFormatter.format(riskReport.kpis.returnRate)}
                    </p>
                  </div>
                </div>

                <div className="flex min-w-0 items-center gap-3 py-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-muted/35 text-muted-foreground">
                    <Activity className="size-3.5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground">
                      {riskCopy("highestImpactFactor")}
                    </p>
                    <p className="mt-0.5 truncate text-sm font-semibold">
                      {riskTopFactor ? t(riskTopFactor.labelKey) : "—"}
                    </p>
                    {riskTopFactor ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatPositiveRiskPoints(
                          locale,
                          riskTopFactor.positivePoints,
                        )}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-border/70 bg-muted/20 px-3 py-2.5">
                <span className="inline-flex min-w-0 items-center gap-2 text-xs font-medium text-muted-foreground">
                  <PiggyBank className="size-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">{t("risk.kpi.potentialSavings")}</span>
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  {formatDZD(riskReport.kpis.potentialSavingsDzd, locale)}
                </span>
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
