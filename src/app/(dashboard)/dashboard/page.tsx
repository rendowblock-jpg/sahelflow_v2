import { getDashboardAnalytics } from "@/lib/data/analytics-data";
import { getDashboardStats, getRecentOrders } from "@/lib/data/dashboard";
import { getFirstRunCounts } from "@/lib/data/first-run-counts";
import { getStaleOrderCount } from "@/lib/data/confirmation-queue";
import { db, shopContext } from "@/lib/db";
import { getI18n } from "@/lib/i18n-server";
import { requireTrustedAction } from "@/lib/identity/authorization";
import { projectDashboardForTrustedActor, resolveDashboardFieldAccess } from "@/lib/identity/dashboard-projection";
import { getRiskAnalyticsReport } from "@/lib/risk-engine";
import { DashboardView } from "@/components/dashboard/dashboard-view";


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
    firstRunCounts,
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
    // Brand-new shop check: three live counts, skipped for tables the role cannot read.
    getFirstRunCounts(
      {
        order: { count: (args) => db.order.count(args) },
        product: { count: (args) => db.product.count(args) },
        customer: { count: (args) => db.customer.count(args) },
      },
      {
        orders: fieldAccess.orders,
        products: fieldAccess.products,
        customers: fieldAccess.customers,
      },
    ),
  ]);

  const { stats, recentOrders, analytics } = projectDashboardForTrustedActor(
    {
      stats: rawStats,
      recentOrders: rawRecentOrders,
      analytics: rawAnalytics,
    },
    fieldAccess,
  );

  return (
    <DashboardView
      t={t}
      locale={locale}
      stats={stats}
      recentOrders={recentOrders}
      analytics={analytics}
      fieldAccess={fieldAccess}
      firstRunCounts={firstRunCounts}
      riskReport={riskReport}
      staleConfirmations={staleConfirmations}
    />
  );
}
