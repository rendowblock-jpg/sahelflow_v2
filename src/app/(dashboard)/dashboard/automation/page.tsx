"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Loader2,
  Phone,
  CheckCircle,
  XCircle,
  MessageCircle,
  CheckCheck,
} from "lucide-react";
import {
  getOrders,
  updateOrderStatus,
} from "@/lib/data/service";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/components/dashboard/ToastProvider";
import { PageTransition } from "@/components/ui/motion";

interface Order {
  id: string;
  order_number: string;
  status: string;
  total_price: number;
  wilaya?: string;
  customer?: { name?: string; phone?: string } | null;
  name?: string;
  phone?: string;
  created_at: string;
  items?: unknown[];
}

export default function ConfirmationPage() {
  const { t, formatCurrency } = useI18n();
  const { toast } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<Record<string, string>>(
    {},
  );
  const [batchLoading, setBatchLoading] = useState(false);
  const [confirmedCount, setConfirmedCount] = useState(0);
  const [refusedCount, setRefusedCount] = useState(0);
  const whatsappTemplate = "";

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const pendingOrdersResult = await getOrders({ status: "pending", limit: 200 });
      const pendingOrders = pendingOrdersResult.data;
      setOrders(pendingOrders as Order[]);
    } catch {
      toast({
        type: "error",
        title: t.automation?.loadFailed || t.common.error,
      });
    } finally {
      setLoading(false);
    }
  }, [toast, t.automation?.loadFailed, t.common.error]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleConfirm(order: Order) {
    setActionLoading((prev) => ({ ...prev, [order.id]: "confirm" }));
    try {
      await updateOrderStatus(order.id, "confirmed");
      setOrders((prev) => prev.filter((o) => o.id !== order.id));
      setConfirmedCount((prev) => prev + 1);
    } catch {
      toast({
        type: "error",
        title: t.automation?.confirmFailed || t.common.error,
      });
    } finally {
      setActionLoading((prev) => {
        const n = { ...prev };
        delete n[order.id];
        return n;
      });
    }
  }

  async function handleRefuse(order: Order) {
    setActionLoading((prev) => ({ ...prev, [order.id]: "refuse" }));
    try {
      await updateOrderStatus(order.id, "refused");
      setOrders((prev) => prev.filter((o) => o.id !== order.id));
      setRefusedCount((prev) => prev + 1);
    } catch {
      toast({
        type: "error",
        title: t.automation?.refuseFailed || t.common.error,
      });
    } finally {
      setActionLoading((prev) => {
        const n = { ...prev };
        delete n[order.id];
        return n;
      });
    }
  }

  function handleCall(order: Order) {
    const phone = order.customer?.phone || order.phone;
    if (phone) {
      window.open(`tel:${phone}`, "_self");
    }
  }

  function handleWhatsApp(order: Order) {
    const phone = order.customer?.phone || order.phone;
    if (!phone) return;

    let message = whatsappTemplate || t.automation?.confirmationMessage || "";
    message = message
      .replace(
        /\{\{customer_name\}\}/g,
        order.customer?.name || order.name || "",
      )
      .replace(/\{\{order_number\}\}/g, order.order_number)
      .replace(
        /\{\{total_price\}\}/g,
        formatCurrency(Number(order.total_price)),
      )
      .replace(/\{\{wilaya\}\}/g, order.wilaya || "");

    const cleanPhone = phone.replace(/[^0-9+]/g, "");
    const intlPhone = cleanPhone.startsWith("0")
      ? `213${cleanPhone.substring(1)}`
      : cleanPhone.startsWith("+")
        ? cleanPhone.substring(1)
        : cleanPhone;

    window.open(
      `https://wa.me/${intlPhone}?text=${encodeURIComponent(message)}`,
      "_blank",
    );
  }

  async function handleBatchConfirm() {
    if (orders.length === 0) return;
    setBatchLoading(true);
    const snapshot = [...orders];
    const results = await Promise.allSettled(
      snapshot.map((o) => updateOrderStatus(o.id, "confirmed")),
    );
    const failedIds = results
      .map((r, i) => (r.status === "rejected" ? snapshot[i].id : null))
      .filter(Boolean) as string[];
    const confirmedNow = results.filter((r) => r.status === "fulfilled").length;
    if (failedIds.length > 0) {
      toast({
        type: "error",
        title: t.automation?.batchConfirmFailed || t.common.error,
      });
    }
    setConfirmedCount((prev) => prev + confirmedNow);
    // Only remove orders that were successfully confirmed
    setOrders((prev) => prev.filter((o) => failedIds.includes(o.id)));
    setBatchLoading(false);
  }

  if (loading) {
    return (
      <div className="sf-flex-center sf-loading-page">
        <Loader2 size={24} className="sf-animate-spin sf-mr-sm" />
        {t.common.loading}
      </div>
    );
  }

  return (
    <PageTransition className="sf-flex-col sf-gap-xl">
      <div className="sf-flex-between sf-flex-wrap sf-gap-md">
        <div>
          <h1 className="sf-page-title">{t.automation.title}</h1>
          <p className="sf-page-subtitle">{t.automation.subtitle}</p>
        </div>
        {orders.length > 1 && (
          <button
            className="sf-btn sf-btn-primary sf-text-sm"
            onClick={handleBatchConfirm}
            disabled={batchLoading}
          >
            {batchLoading ? (
              <Loader2 size={14} className="sf-animate-spin" />
            ) : (
              <CheckCheck size={14} />
            )}
            {batchLoading
              ? t.common.loading
              : `${t.orders.confirmOrder} (${orders.length})`}
          </button>
        )}
      </div>

      <div className="sf-stats-grid">
        {[
          {
            label: t.status.pending,
            value: String(orders.length),
            variant: "warning" as const,
          },
          {
            label: t.status.confirmed,
            value: String(confirmedCount),
            variant: "success" as const,
          },
          {
            label: t.status.refused,
            value: String(refusedCount),
            variant: "danger" as const,
          },
        ].map((s) => (
          <div key={s.label} className={`sf-card sf-stat sf-stat-${s.variant}`}>
            <p className="sf-stat-label">{s.label}</p>
            <p className="sf-stat-value">{s.value}</p>
          </div>
        ))}
      </div>

      {orders.length === 0 ? (
        <div className="sf-card sf-flex-center sf-flex-col sf-empty-xl">
          <CheckCircle size={48} className="sf-auto-empty-icon" />
          <h3 className="sf-empty-title">
            {confirmedCount > 0 || refusedCount > 0
              ? `✅ ${(t.automation?.sessionSummary ?? "").replace("{confirmed}", String(confirmedCount)).replace("{refused}", String(refusedCount))}`
              : t.automation.allCaughtUp}
          </h3>
          <p className="sf-text-secondary">{t.automation.noPendingOrders}</p>
        </div>
      ) : (
        <div className="sf-flex-col sf-gap-md">
          {orders.map((o) => {
            const isLoading = actionLoading[o.id];
            const phone = o.customer?.phone || o.phone;
            return (
              <div
                key={o.id}
                className="sf-card sf-card-hover sf-auto-card-padded"
              >
                <div className="sf-flex-between sf-mb-sm">
                  <div className="sf-flex sf-gap-sm sf-items-center">
                    <span className="sf-td-mono sf-font-semibold">
                      {o.order_number}
                    </span>
                    <span className="sf-badge sf-badge-warning">
                      {t.status.pending}
                    </span>
                  </div>
                  <span className="sf-font-semibold">
                    {formatCurrency(Number(o.total_price))}
                  </span>
                </div>
                <div className="sf-flex sf-gap-lg sf-text-sm-secondary sf-flex-wrap">
                  <span>{o.customer?.name || o.name || "—"}</span>
                  <span dir="ltr">{phone || "—"}</span>
                  <span>{o.wilaya || "—"}</span>
                </div>
                <div className="sf-flex sf-gap-sm sf-mt-md sf-flex-wrap">
                  <button
                    className="sf-btn sf-btn-success sf-btn-xs"
                    onClick={() => handleConfirm(o)}
                    disabled={!!isLoading}
                  >
                    {isLoading === "confirm" ? (
                      <Loader2 size={14} className="sf-animate-spin" />
                    ) : (
                      <CheckCircle size={14} />
                    )}
                    {t.orders.confirmOrder}
                  </button>
                  {phone && (
                    <button
                      className="sf-btn sf-btn-ghost sf-btn-xs"
                      onClick={() => handleWhatsApp(o)}
                    >
                      <MessageCircle size={14} /> WhatsApp
                    </button>
                  )}
                  {phone && (
                    <button
                      className="sf-btn sf-btn-ghost sf-btn-xs"
                      onClick={() => handleCall(o)}
                    >
                      <Phone size={14} />
                    </button>
                  )}
                  <button
                    className="sf-btn sf-btn-danger sf-btn-xs"
                    onClick={() => handleRefuse(o)}
                    disabled={!!isLoading}
                  >
                    {isLoading === "refuse" ? (
                      <Loader2 size={14} className="sf-animate-spin" />
                    ) : (
                      <XCircle size={14} />
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </PageTransition>
  );
}
