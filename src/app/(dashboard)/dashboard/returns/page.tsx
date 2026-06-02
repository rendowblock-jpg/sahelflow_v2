"use client";
import { useToast } from "@/components/dashboard/ToastProvider";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  RotateCcw,
  Search,

  DollarSign,
  AlertCircle,
  Truck,

  Eye,
  Calendar,
} from "lucide-react";
import { getReturns } from "@/lib/data/returns-service";
import type { Return } from "@/types";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useLayout } from "@/components/providers/Providers";
import { PageTransition } from "@/components/ui/motion";
import { SkeletonCard, SkeletonTable } from "@/components/ui/Skeleton";

const STATUSES = [
  "all",
  "requested",
  "approved",
  "pickup",
  "received",
  "inspected",
  "refunded",
  "exchanged",
  "rejected",
  "closed",
];

export default function ReturnsDashboardPage() {
  const { t, formatCurrency, locale } = useI18n();
  const { isMobile } = useLayout();
  const PAGE_SIZE = 50;

  const { toast } = useToast();
  const [returns, setReturns] = useState<Return[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  // Return stats
  const [stats, setStats] = useState({
    total: 0,
    requested: 0,
    inProgress: 0,
    resolved: 0,
    refundsIssued: 0,
  });

  const loadStats = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from("returns")
        .select("status, refund_amount");

      if (data) {
        const aggregated = {
          total: data.length,
          requested: 0,
          inProgress: 0,
          resolved: 0,
          refundsIssued: 0,
        };

        data.forEach((r) => {
          if (r.status === "requested") aggregated.requested++;
          else if (["approved", "pickup", "received", "inspected"].includes(r.status)) {
            aggregated.inProgress++;
          } else if (["refunded", "exchanged", "closed"].includes(r.status)) {
            aggregated.resolved++;
          }

          if (r.status === "refunded") {
            aggregated.refundsIssued += Number(r.refund_amount || 0);
          }
        });
        setStats(aggregated);
      }
} catch {
      toast({ type: "error", title: "Operation failed" });
    }
}, [toast]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const statusOption = filter === "all" ? undefined : filter;
      const result = await getReturns({
        status: statusOption,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });

      if (page === 0) {
        setReturns(result.data as Return[]);
      } else {
        setReturns((prev) => [...prev, ...(result.data as Return[])]);
      }
      setTotalCount(result.total);
      setHasMore(result.data.length === PAGE_SIZE);
} catch {
      toast({ type: "error", title: "Operation failed" });
    } finally {
      setLoading(false);
    }
  }, [filter, page, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // Real-time subscription
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("returns-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "returns" },
        () => {
          loadData();
          loadStats();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadData, loadStats]);

  const handleFilterChange = (s: string) => {
    setFilter(s);
    setPage(0);
  };

  const statusColorMap: Record<string, string> = {
    requested: "sf-badge-return-requested",
    approved: "sf-badge-return-approved",
    pickup: "sf-badge-return-pickup",
    received: "sf-badge-return-received",
    inspected: "sf-badge-return-inspected",
    refunded: "sf-badge-return-refunded",
    exchanged: "sf-badge-return-exchanged",
    rejected: "sf-badge-return-rejected",
    closed: "sf-badge-return-closed",
  };

  const reasonLabelMap: Record<string, string> = {
    wrong_product: t.returnReasons.wrong_product,
    damaged: t.returnReasons.damaged,
    changed_mind: t.returnReasons.changed_mind,
    not_as_described: t.returnReasons.not_as_described,
    wrong_size: t.returnReasons.wrong_size,
    defective: t.returnReasons.defective,
    late_delivery: t.returnReasons.late_delivery,
    other: t.returnReasons.other,
  };

  const resolutionLabelMap: Record<string, string> = {
    refund: locale === "ar" ? "استرداد مالي" : locale === "fr" ? "Remboursement" : "Refund",
    exchange: locale === "ar" ? "استبدال" : locale === "fr" ? "Échange" : "Exchange",
    credit: locale === "ar" ? "رصيد متجر" : locale === "fr" ? "Crédit magasin" : "Store Credit",
  };

  const filteredReturns = returns.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.return_number?.toLowerCase().includes(q) ||
      r.order?.order_number?.toLowerCase().includes(q) ||
      r.order?.customer?.name?.toLowerCase().includes(q) ||
      r.order?.customer?.phone?.includes(q)
    );
  });

  if (loading && page === 0) {
    return (
      <div className="sf-flex-col sf-gap-xl sf-animate-fade">
        <div>
          <div className="sf-skeleton sf-orders-skeleton-title" />
          <div className="sf-skeleton sf-orders-skeleton-subtitle" />
        </div>
        <div className="sf-stats-grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
        <SkeletonTable rows={6} />
      </div>
    );
  }

  return (
    <PageTransition className="sf-flex-col sf-gap-xl">
      {/* Page Header */}
      <div className="sf-page-header">
        <div>
          <h1 className="sf-page-title" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <RotateCcw size={24} className="sf-text-brand" />
            {t.returns.title}
          </h1>
          <p className="sf-page-subtitle">
            {t.returns.subtitle}
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="sf-stats-grid">
        <div className="sf-card sf-p-md sf-flex sf-gap-md sf-items-center">
          <div className="sf-icon-box sf-icon-brand">
            <RotateCcw size={20} />
          </div>
          <div>
            <span className="sf-text-caps">{t.returns.totalReturns}</span>
            <h3 className="sf-text-xl sf-font-semibold sf-mt-sm">{stats.total}</h3>
          </div>
        </div>

        <div className="sf-card sf-p-md sf-flex sf-gap-md sf-items-center">
          <div className="sf-icon-box sf-icon-warning">
            <AlertCircle size={20} />
          </div>
          <div>
            <span className="sf-text-caps">{t.returns.requested}</span>
            <h3 className="sf-text-xl sf-font-semibold sf-mt-sm">{stats.requested}</h3>
          </div>
        </div>

        <div className="sf-card sf-p-md sf-flex sf-gap-md sf-items-center">
          <div className="sf-icon-box sf-icon-success" style={{ background: "rgba(139, 92, 246, 0.1)", color: "#8b5cf6" }}>
            <Truck size={20} />
          </div>
          <div>
            <span className="sf-text-caps">{t.returns.inProgress}</span>
            <h3 className="sf-text-xl sf-font-semibold sf-mt-sm">{stats.inProgress}</h3>
          </div>
        </div>

        <div className="sf-card sf-p-md sf-flex sf-gap-md sf-items-center">
          <div className="sf-icon-box sf-icon-success">
            <DollarSign size={20} />
          </div>
          <div>
            <span className="sf-text-caps">{t.returns.refundsIssued}</span>
            <h3 className="sf-text-xl sf-font-semibold sf-mt-sm">{formatCurrency(stats.refundsIssued)}</h3>
          </div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="sf-orders-filters">
        <div className={`sf-orders-search-wrap ${isMobile ? "sf-orders-search-wrap--mobile" : ""}`}>
          <Search size={16} className="sf-orders-search-icon" />
          <input
            className="sf-input sf-orders-search-input"
            placeholder={t.returns.searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="sf-orders-status-filters">
          {STATUSES.map((s) => (
            <button
              key={s}
              className={`sf-badge ${filter === s ? "sf-badge-brand" : ""} ${
                s !== "all" && filter !== s ? statusColorMap[s] || "" : ""
              }`}
              onClick={() => handleFilterChange(s)}
              type="button"
            >
              {s === "all" ? t.common.all : ((t.returns.statusMap as Record<string, string>)[s] || s.toUpperCase())}
            </button>
          ))}
        </div>
      </div>

      {/* Empty State */}
      {filteredReturns.length === 0 && (
        <div className="sf-card sf-orders-empty">
          <p className="sf-orders-empty__title">{t.returns.noReturns}</p>
          <p className="sf-orders-empty__desc">
            {t.returns.noReturnsDesc}
          </p>
          <Link href="/dashboard/orders" className="sf-btn sf-btn-primary">
            {t.returns.goToOrders}
          </Link>
        </div>
      )}

      {/* Data Table */}
      {filteredReturns.length > 0 && (
        <div className="sf-card-flush sf-overflow-hidden">
          {!isMobile ? (
            /* Desktop Table view */
            <table className="sf-table">
              <thead>
                <tr>
                  <th>{t.returns.returnNum}</th>
                  <th>{t.returns.orderNum}</th>
                  <th>{t.returns.customer}</th>
                  <th>{t.returns.reason}</th>
                  <th>{t.returns.resolution}</th>
                  <th>{t.returns.status}</th>
                  <th>{t.returns.date}</th>
                  <th className="sf-text-end">{t.returns.actions}</th>
                </tr>
              </thead>
              <tbody>
                {filteredReturns.map((ret) => (
                  <tr key={ret.id} className="sf-table-row">
                    <td className="sf-font-semibold sf-text-tabular">{ret.return_number}</td>
                    <td className="sf-text-secondary sf-text-tabular">#{ret.order?.order_number}</td>
                    <td>
                      <div className="sf-flex-col">
                        <span className="sf-font-medium">{ret.order?.customer?.name || "—"}</span>
                        <span className="sf-text-xs sf-text-tertiary">{ret.order?.customer?.phone}</span>
                      </div>
                    </td>
                    <td>
                      <span className="sf-chip-reason">
                        {reasonLabelMap[ret.reason] || ret.reason}
                      </span>
                    </td>
                    <td>
                      <span className="sf-font-medium" style={{ textTransform: "capitalize" }}>
                        {resolutionLabelMap[ret.resolution_type] || ret.resolution_type}
                      </span>
                      {ret.resolution_type === "refund" && ret.refund_amount > 0 && (
                        <div className="sf-text-xs sf-text-brand">
                          ({formatCurrency(ret.refund_amount)})
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={`sf-badge ${statusColorMap[ret.status] || ""}`}>
                        {(t.returns.statusMap as Record<string, string>)[ret.status] || ret.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="sf-text-secondary sf-text-tabular">
                      <div className="sf-flex sf-gap-sm sf-items-center">
                        <Calendar size={12} className="sf-text-tertiary" />
                        {new Date(ret.created_at).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="sf-text-end">
                      <Link
                        href={`/dashboard/returns/${ret.id}`}
                        className="sf-btn sf-btn-ghost sf-icon-box-sm"
                        style={{ display: "inline-flex" }}
                        title={t.returns.viewDetails}
                      >
                        <Eye size={14} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            /* Mobile Cards view */
            <div className="sf-flex-col" style={{ gap: 0 }}>
              {filteredReturns.map((ret) => (
                <div
                  key={ret.id}
                  className="sf-p-md sf-flex-col sf-gap-sm"
                  style={{ borderBottom: "1px solid var(--color-line-secondary)" }}
                >
                  <div className="sf-flex sf-items-center sf-gap-sm">
                    <span className="sf-font-semibold">{ret.return_number}</span>
                    <span className="sf-text-xs sf-text-tertiary">({ret.order?.order_number})</span>
                    <span className={`sf-badge ${statusColorMap[ret.status] || ""} sf-self-end`}>
                      {(t.returns.statusMap as Record<string, string>)[ret.status] || ret.status.toUpperCase()}
                    </span>
                  </div>

                  <div className="sf-flex-col sf-gap-1">
                    <span className="sf-text-sm sf-font-medium">{ret.order?.customer?.name}</span>
                    <span className="sf-text-xs sf-text-tertiary">{ret.order?.customer?.phone}</span>
                  </div>

                  <div className="sf-flex sf-items-center sf-gap-sm sf-flex-wrap">
                    <span className="sf-chip-reason">
                      {reasonLabelMap[ret.reason] || ret.reason}
                    </span>
                    <span className="sf-text-xs sf-text-secondary">
                      {t.returns.resolution}: <strong>{resolutionLabelMap[ret.resolution_type] || ret.resolution_type}</strong>
                    </span>
                  </div>

                  <div className="sf-flex sf-items-center sf-gap-sm sf-self-end sf-mt-sm">
                    <Link href={`/dashboard/returns/${ret.id}`} className="sf-btn sf-btn-ghost sf-btn-sm">
                      <Eye size={12} /> {t.returns.viewDetails}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Load More */}
      {hasMore && !loading && returns.length > 0 && (
        <div className="sf-orders-load-more-wrap">
          <button
            className="sf-btn sf-btn-ghost"
            onClick={() => setPage((p) => p + 1)}
          >
            {t.returns.loadMore} ({returns.length} / {totalCount})
          </button>
        </div>
      )}
    </PageTransition>
  );
}
