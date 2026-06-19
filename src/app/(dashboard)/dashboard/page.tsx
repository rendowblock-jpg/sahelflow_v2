"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ShoppingCart,
  TrendingUp,
  AlertTriangle,
  Package,
  Truck,
  Users,
  DollarSign,
  ArrowUpRight,
  Wallet,
} from "lucide-react";
import { getDashboardStats, getOrders, getAnalyticsData } from "@/lib/data/service";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/components/dashboard/ToastProvider";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { GettingStarted } from "@/components/dashboard/GettingStarted";
import { SkeletonCard, SkeletonTable } from "@/components/ui/Skeleton";
import {
  PageTransition,
  StaggerContainer,
  StaggerItem,
} from "@/components/ui/motion";
import { AnimatedStatCard } from "@/components/ui/AnimatedStatCard";
import { ChartContainer, RevenueChart } from "@/components/ui/charts";
import type { DashboardStats } from "@/types/database";
import { getWilayaName } from "@/lib/data/wilayas";

type DashboardData = DashboardStats;

interface RecentOrder {
  id: string;
  order_number: string;
  wilaya: string | null;
  status: string;
  total_price: number;
  created_at: string;
  source: string | null;
  customer?: { name: string | null } | null;
}

function getGreeting(locale: string) {
  const hour = new Date().getHours();
  if (locale === "ar") {
    if (hour < 12) return "صباح الخير";
    return "مساء الخير";
  }
  if (locale === "fr") {
    if (hour < 12) return "Bonjour";
    return "Bonsoir";
  }
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function DashboardPage() {
  const { t, formatCurrency, locale } = useI18n();
  const { toast } = useToast();
  const [stats, setStats] = useState<DashboardData | null>(null);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [revenueByDay, setRevenueByDay] = useState<{ day: string; revenue: number }[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [dashStats, ordersResult, analyticsResult] = await Promise.all([
        getDashboardStats(),
        getOrders({ limit: 5 }).catch(() => ({ data: [] })),
        getAnalyticsData("30d").catch(() => null),
      ]);
      setStats(dashStats as DashboardData);
      setRecentOrders(ordersResult.data as RecentOrder[]);
      if (analyticsResult && analyticsResult.revenueByDay) {
        setRevenueByDay(analyticsResult.revenueByDay);
      }
    } catch {
      toast({
        type: "error",
        title: t.dashboard?.loadFailed || t.common.error,
      });
    } finally {
      setLoading(false);
    }
  }, [toast, t.dashboard?.loadFailed, t.common.error]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Supabase realtime — auto-refresh dashboard when orders change (debounced)
  useEffect(() => {
    const supabase = createClient();
    let debounceTimer: ReturnType<typeof setTimeout>;
    const debouncedLoad = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => loadData(), 500);
    };
    const channel = supabase
      .channel("dashboard-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        debouncedLoad,
      )
      .subscribe();
    return () => {
      clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [loadData]);

  if (loading && !stats) {
    return (
      <div className="sf-flex-col sf-gap-xl sf-animate-fade">
        <div className="sf-greeting-hero">
          <div className="sf-skeleton sf-skeleton-title" style={{ width: "240px", height: "28px" }} />
          <div className="sf-skeleton sf-skeleton-subtitle" style={{ width: "160px", height: "16px", marginTop: "8px" }} />
        </div>
        <div className="sf-grid-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
        <div className="sf-grid-2 sf-align-start">
          <SkeletonTable rows={4} />
          <SkeletonTable rows={4} />
        </div>
      </div>
    );
  }

  const statCards = [
    {
      label: t.dashboard.totalOrders,
      value: String(stats?.totalOrders || 0),
      icon: ShoppingCart,
      variant: "brand" as const,
    },
    {
      label: t.dashboard.revenue,
      value: formatCurrency(stats?.totalRevenue || 0),
      icon: DollarSign,
      variant: "warning" as const,
    },
    {
      label: t.dashboard.totalProfit || "Net Profit",
      value: formatCurrency(stats?.totalProfit || 0),
      icon: Wallet,
      variant: "success" as const,
    },
    {
      label: t.dashboard.pending,
      value: String(stats?.pendingOrders || 0),
      icon: AlertTriangle,
      variant: "danger" as const,
    },
    {
      label: t.analytics.confirmationRate || "Confirmation Rate",
      value: `${stats?.confirmationRate || 0}%`,
      icon: TrendingUp,
      variant: "brand" as const,
    },
    {
      label: t.dashboard.deliveryRate,
      value: `${stats?.deliveryRate || 0}%`,
      icon: Truck,
      variant: "success" as const,
    },
    {
      label: t.dashboard.customers,
      value: String(stats?.totalCustomers || 0),
      icon: Users,
      variant: "brand" as const,
    },
    {
      label: t.products.totalStock,
      value: String(stats?.totalStock || 0),
      icon: Package,
      variant: "warning" as const,
    },
  ];

  const quickActions = [
    {
      label: t.dashboard.newOrder,
      icon: ShoppingCart,
      href: "/dashboard/orders",
    },
    {
      label: t.dashboard.addProduct,
      icon: Package,
      href: "/dashboard/products",
    },
    {
      label: t.dashboard.trackDelivery,
      icon: Truck,
      href: "/dashboard/delivery",
    },
    { label: t.dashboard.customers, icon: Users, href: "/dashboard/customers" },
    {
      label: t.nav.accounting,
      icon: Wallet,
      href: "/dashboard/accounting",
    },
    {
      label: t.dashboard.revenue,
      icon: TrendingUp,
      href: "/dashboard/analytics",
    },
  ];

  const cashFlowItems = [
    {
      label: t.dashboard.inTransit,
      value: stats?.codInTransit || 0,
      colorClass: "sf-text-brand",
      barColor: "var(--color-brand-400)",
    },
    {
      label: t.dashboard.clearedFunds,
      value: stats?.codCleared || 0,
      colorClass: "sf-text-success",
      barColor: "var(--color-accent-400)",
    },
    {
      label: t.dashboard.pendingCollection,
      value: stats?.codPendingCollection || 0,
      colorClass: "sf-text-warning",
      barColor: "var(--color-warn-400)",
    },
    {
      label: t.dashboard.atRisk,
      value: stats?.codAtRisk || 0,
      colorClass: "sf-text-danger",
      barColor: "var(--color-danger-400)",
    },
  ];

  const totalCod = (stats?.codInTransit || 0) + (stats?.codCleared || 0) + (stats?.codPendingCollection || 0) + (stats?.codAtRisk || 0);
  const getPercentage = (val: number) => {
    if (totalCod === 0) return 0;
    return Math.round((val / totalCod) * 100);
  };

  const statusColors: Record<string, string> = {
    pending: "sf-badge-warning",
    confirmed: "sf-badge-brand",
    shipped: "sf-badge-brand",
    delivered: "sf-badge-success",
    returned: "sf-badge-danger",
    refused: "sf-badge-danger",
    cancelled: "sf-badge-warning",
  };

  const total30DRevenue = revenueByDay.reduce((sum, d) => sum + d.revenue, 0);

  return (
    <PageTransition className="sf-flex-col sf-gap-xl">
      {/* AAA Greeting Hero */}
      <div className="sf-greeting-hero">
        <h1 className="sf-greeting-text">
          {getGreeting(locale)}, <span className="sf-gradient-text">{t.common.myStore}</span> 👋
        </h1>
        <p className="sf-greeting-meta">
          {new Date().toLocaleDateString(locale === "ar" ? "ar-DZ" : locale === "fr" ? "fr-FR" : "en-US", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>

      {/* H2 fix: Removed fake "Database capacity" warning. The thresholds (12,750/14,250/15,000
          orders) were hardcoded and not based on any real Supabase limit. Supabase free tier
          has 500MB, not 15K orders. If real capacity monitoring is needed, query
          pg_database_size() and display actual usage. */}

      {/* Getting Started */}
      <GettingStarted />

      {/* Stats Grid */}
      <StaggerContainer className="sf-grid-4" stagger={0.05}>
        {statCards.map((stat, index) => (
          <StaggerItem key={stat.label}>
            <AnimatedStatCard
              label={stat.label}
              value={stat.value}
              variant={stat.variant}
              icon={stat.icon}
              delay={index * 80}
            />
          </StaggerItem>
        ))}
      </StaggerContainer>

      {/* Interactive Sales Chart & Side Highlights */}
      <div className="sf-grid-2 sf-align-start sf-gap-xl">
        {/* Left Column: Revenue Trend Chart & Cash Flow Summary */}
        <div className="sf-flex-col sf-gap-lg sf-flex-1">
          <ChartContainer
            title={t.analytics.revenueLast7Days ? t.analytics.revenueLast7Days.replace("7", "30") : "Revenue Trend (30 Days)"}
            empty={revenueByDay.length === 0}
            emptyTitle={t.analytics.noDataYet}
            emptyDescription={t.analytics.noDataDesc}
            height={380}
          >
            <div style={{ marginBottom: "16px" }}>
              <span style={{ fontSize: "11px", color: "var(--color-content-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>
                {t.dashboard.revenue || "Total Revenue"} (30D)
              </span>
              <h2 style={{ fontSize: "28px", fontWeight: 700, color: "var(--color-content-primary)", letterSpacing: "-0.03em", marginTop: "4px" }}>
                {formatCurrency(total30DRevenue)}
              </h2>
            </div>
            <RevenueChart data={revenueByDay} locale={locale} />
          </ChartContainer>

          {/* Cash Flow Ledger */}
          <div className="sf-card sf-card-padded">
            <h2 className="sf-section-title sf-section-title--flush sf-mb-md">{t.dashboard.cashFlow}</h2>
            <div className="sf-cashflow-ledger">
              {cashFlowItems.map((item) => {
                const pct = getPercentage(item.value);
                return (
                  <div className="sf-cashflow-ledger-cell" key={item.label}>
                    <span className="sf-cashflow-ledger-label">{item.label}</span>
                    <span className={`sf-cashflow-ledger-value ${item.colorClass}`}>
                      {formatCurrency(item.value)}
                    </span>
                    <div className="sf-cashflow-ledger-bar">
                      <div
                        className="sf-cashflow-ledger-bar-fill"
                        style={{
                          background: item.barColor,
                          width: `${pct}%`,
                          "--bar-width": `${pct}%`,
                        } as React.CSSProperties}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Quick Actions */}
        <div className="sf-flex-col sf-gap-lg">
          <div className="sf-card sf-card-padded">
            <h2 className="sf-section-title sf-section-title--flush sf-mb-md">{t.dashboard.quickActions}</h2>
            <div className="sf-quick-grid">
              {quickActions.map((action) => (
                <Link
                  key={action.href}
                  href={action.href}
                  className="sf-quick-card"
                >
                  <div className="sf-quick-card-icon">
                    <action.icon size={16} strokeWidth={2} />
                  </div>
                  <span className="sf-quick-card-label">{action.label}</span>
                  <ArrowUpRight size={14} className="sf-quick-card-arrow" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Activity Feed + Recent Orders */}
      <div className="sf-grid-2 sf-align-start">
        {/* Left: Activity Feed */}
        <div className="sf-card sf-card-padded">
          <ActivityFeed />
        </div>

        {/* Right: Recent Orders */}
        <div className="sf-card sf-card-flat">
          <div className="sf-card-header">
            <h2 className="sf-section-title sf-section-title--flush">
              {t.dashboard.recentOrders}
            </h2>
            <Link href="/dashboard/orders" className="sf-card-view-all">
              {t.common.viewAll} <ArrowUpRight size={12} />
            </Link>
          </div>
          <div className="sf-table-scroll">
            <table className="sf-table">
              <thead>
                <tr>
                  <th>{t.dashboard.orderId}</th>
                  <th>{t.dashboard.customer}</th>
                  <th className="sf-hide-mobile">{t.dashboard.wilaya}</th>
                  <th>{t.common.status}</th>
                  <th className="sf-table-th-end">{t.dashboard.total}</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="sf-empty-cell">
                      {t.dashboard.noOrdersYet}{" "}
                      <Link href="/dashboard/orders" className="sf-link-brand">
                        {t.dashboard.goToOrders}
                      </Link>
                    </td>
                  </tr>
                ) : (
                  recentOrders.map((order) => (
                    <tr key={order.id}>
                      <td className="sf-order-number">
                        <div className="sf-flex-center-gap-sm" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                          <span>{order.order_number}</span>
                          <span className={`sf-source-badge sf-source-badge--${order.source || "manual"}`} style={{
                            fontSize: "10px",
                            padding: "2px 6px",
                            borderRadius: "4px",
                            fontWeight: 600,
                            textTransform: "uppercase",
                            letterSpacing: "0.02em",
                            background: order.source === "whatsapp" 
                              ? "rgba(37, 211, 102, 0.15)" 
                              : order.source === "store" 
                                ? "rgba(99, 102, 241, 0.15)" 
                                : "rgba(255, 255, 255, 0.08)",
                            color: order.source === "whatsapp" 
                              ? "#25D366" 
                              : order.source === "store" 
                                ? "#818cf8" 
                                : "var(--color-content-tertiary)",
                          }}>
                            {order.source || "manual"}
                          </span>
                        </div>
                      </td>
                      <td className="sf-text-muted">
                        {order.customer?.name || "—"}
                      </td>
                      <td className="sf-hide-mobile sf-text-tertiary">
                        {order.wilaya ? getWilayaName(order.wilaya, locale) : "—"}
                      </td>
                      <td>
                        <span
                          className={`sf-badge ${statusColors[order.status] || "sf-badge-brand"}`}
                        >
                          {t.status[order.status as keyof typeof t.status] ||
                            order.status}
                        </span>
                      </td>
                      <td className="sf-price-cell">
                        {formatCurrency(Number(order.total_price))}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}

