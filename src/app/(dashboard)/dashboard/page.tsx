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
} from "lucide-react";
import { getDashboardStats, getOrders } from "@/lib/data/service";
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
import type { DashboardStats } from "@/types/database";

type DashboardData = DashboardStats;

interface RecentOrder {
  id: string;
  order_number: string;
  wilaya: string | null;
  status: string;
  total_price: number;
  created_at: string;
  customer?: { name: string | null } | null;
}

export default function DashboardPage() {
  const { t, formatCurrency } = useI18n();
  const { toast } = useToast();
  const [stats, setStats] = useState<DashboardData | null>(null);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [dashStats, ordersResult] = await Promise.all([
        getDashboardStats(),
        getOrders({ limit: 5 }),
      ]);
      setStats(dashStats as DashboardData);
      setRecentOrders(ordersResult.data as RecentOrder[]);
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
        <div>
          <div className="sf-skeleton sf-skeleton-title" />
          <div className="sf-skeleton sf-skeleton-subtitle" />
        </div>
        <div className="sf-stats-grid">
          {Array.from({ length: 6 }).map((_, i) => (
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
      label: t.dashboard.totalProducts,
      value: String(stats?.totalProducts || 0),
      icon: Package,
      variant: "success" as const,
    },
    {
      label: t.dashboard.revenue,
      value: formatCurrency(stats?.totalRevenue || 0),
      icon: DollarSign,
      variant: "warning" as const,
    },
    {
      label: t.dashboard.pending,
      value: String(stats?.pendingOrders || 0),
      icon: AlertTriangle,
      variant: "danger" as const,
    },
    {
      label: t.dashboard.customers,
      value: String(stats?.totalCustomers || 0),
      icon: Users,
      variant: "brand" as const,
    },
    {
      label: t.dashboard.deliveryRate,
      value: `${stats?.deliveryRate || 0}%`,
      icon: Truck,
      variant: "success" as const,
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
      label: t.dashboard.revenue,
      icon: TrendingUp,
      href: "/dashboard/analytics",
    },
  ];

  const cashFlowItems = [
    {
      label: t.dashboard.inTransit,
      value: stats?.codInTransit || 0,
      colorClass: "sf-cashflow-value--brand",
    },
    {
      label: t.dashboard.clearedFunds,
      value: stats?.codCleared || 0,
      colorClass: "sf-cashflow-value--accent",
    },
    {
      label: t.dashboard.pendingCollection,
      value: stats?.codPendingCollection || 0,
      colorClass: "sf-cashflow-value--warn",
    },
    {
      label: t.dashboard.atRisk,
      value: stats?.codAtRisk || 0,
      colorClass: "sf-cashflow-value--danger",
    },
  ];

  const statusColors: Record<string, string> = {
    pending: "sf-badge-warning",
    confirmed: "sf-badge-brand",
    shipped: "sf-badge-brand",
    delivered: "sf-badge-success",
    returned: "sf-badge-danger",
    refused: "sf-badge-danger",
    cancelled: "sf-badge-warning",
  };

  return (
    <PageTransition className="sf-flex-col sf-gap-xl">
      {/* Page Header */}
      <div>
        <h1 className="sf-page-title">{t.dashboard.title}</h1>
        <p className="sf-page-subtitle">
          {t.dashboard.welcomeBack} {t.dashboard.overview}
        </p>
      </div>

      {/* Getting Started */}
      <GettingStarted />

      {/* Stats Grid */}
      <StaggerContainer className="sf-stats-grid" stagger={0.05}>
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

      {/* Cash Flow */}
      <div>
        <h2 className="sf-section-title">{t.dashboard.cashFlow}</h2>
        <div className="sf-grid-4">
          {cashFlowItems.map((item) => (
            <div className="sf-card sf-cashflow-card" key={item.label}>
              <p className="sf-cashflow-label">{item.label}</p>
              <p className={`sf-cashflow-value ${item.colorClass}`}>
                {formatCurrency(item.value)}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="sf-section-title">{t.dashboard.quickActions}</h2>
        <div className="sf-card sf-action-list">
          {quickActions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="sf-action-row"
            >
              <div className="sf-action-icon sf-action-icon--brand">
                <action.icon size={15} strokeWidth={1.75} />
              </div>
              <span className="sf-action-label">{action.label}</span>
              <ArrowUpRight size={14} className="sf-action-arrow" />
            </Link>
          ))}
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
                      <td className="sf-order-number">{order.order_number}</td>
                      <td className="sf-text-muted">
                        {order.customer?.name || "—"}
                      </td>
                      <td className="sf-hide-mobile sf-text-tertiary">
                        {order.wilaya || "—"}
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
