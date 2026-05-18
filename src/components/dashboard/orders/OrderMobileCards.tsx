"use client";

import { MessageCircle } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { Order } from "./types";

const STATUS_COLOR: Record<string, string> = {
  draft: "sf-badge-draft",
  pending: "sf-badge-warning",
  confirmed: "sf-badge-brand",
  shipped: "sf-badge-brand",
  delivered: "sf-badge-success",
  returned: "sf-badge-danger",
  cancelled: "sf-badge-danger",
  refused: "sf-badge-danger",
};

interface Props {
  orders: Order[];
  onOpenDetail: (order: Order) => void;
  onStatusUpdate: (
    orderId: string,
    newStatus: import("@/types/database").OrderStatus,
  ) => void;
  onOpenWhatsApp: (order: Order) => void;
}

export default function OrderMobileCards({
  orders,
  onOpenDetail,
  onStatusUpdate,
  onOpenWhatsApp,
}: Props) {
  const { t, formatCurrency, formatTimeAgo } = useI18n();

  const translateStatus = (s: string) =>
    (t.status as Record<string, string>)[s] || s;

  return (
    <div className="sf-flex-col sf-gap-md">
      {orders.map((o) => (
        <div
          key={o.id}
          className="sf-card sf-card-hover sf-orders-mobile-card"
          onClick={() => onOpenDetail(o)}
        >
          <div className="sf-orders-mobile-card__top">
            <div>
              <span className="sf-orders-mobile-card__number">
                {o.order_number}
              </span>
              <p className="sf-orders-mobile-card__customer">
                {o.customer?.name || "—"}
              </p>
            </div>
            <span className={`sf-badge ${STATUS_COLOR[o.status] || ""}`}>
              {translateStatus(o.status)}
            </span>
          </div>
          <div className="sf-orders-mobile-card__meta">
            <span className="sf-orders-mobile-card__meta-text">
              {o.wilaya || "—"} • {formatTimeAgo(o.created_at)}
            </span>
            <span className="sf-orders-mobile-card__total">
              {formatCurrency(Number(o.total_price))}
            </span>
          </div>
          {(o.status === "draft" ||
            o.status === "pending" ||
            o.status === "confirmed") && (
            <div className="sf-orders-mobile-card__actions">
              {o.status === "draft" && (
                <>
                  <button
                    className="sf-btn sf-btn-primary sf-orders-mobile-card__btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onStatusUpdate(o.id, "pending");
                    }}
                  >
                    {t.orders.confirmOrder}
                  </button>
                  <button
                    className="sf-btn sf-btn-ghost sf-orders-mobile-card__btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onStatusUpdate(o.id, "cancelled");
                    }}
                  >
                    {t.orders.discard}
                  </button>
                </>
              )}
              {o.status === "pending" && (
                <button
                  className="sf-btn sf-btn-success sf-orders-mobile-card__btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onStatusUpdate(o.id, "confirmed");
                  }}
                >
                  {t.orders.confirmOrder}
                </button>
              )}
              {o.status === "confirmed" && (
                <button
                  className="sf-btn sf-btn-primary sf-orders-mobile-card__btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onStatusUpdate(o.id, "shipped");
                  }}
                >
                  {t.orders.shipOrder}
                </button>
              )}
              {o.customer?.phone && (
                <button
                  className="sf-btn sf-btn-ghost sf-orders-mobile-card__wa-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenWhatsApp(o);
                  }}
                >
                  <MessageCircle size={16} />
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
