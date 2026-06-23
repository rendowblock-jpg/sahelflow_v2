/**
 * Status → chart color mapping. References the semantic --status-* CSS
 * vars defined in globals.css so chart fills stay theme-aware (light/dark)
 * and consistent with the order status badges in src/lib/shared.ts.
 */
import type { OrderStatus } from "@/types/domain";

export const STATUS_CHART_COLORS: Record<OrderStatus, string> = {
  draft: "var(--status-draft)",
  pending: "var(--status-pending)",
  confirmed: "var(--status-confirmed)",
  shipped: "var(--status-shipped)",
  delivered: "var(--status-delivered)",
  returned: "var(--status-returned)",
  refused: "var(--status-refused)",
  cancelled: "var(--status-cancelled)",
};

/** Ordered pipeline of statuses for funnel-style visualizations. */
export const STATUS_PIPELINE: OrderStatus[] = [
  "pending",
  "confirmed",
  "shipped",
  "delivered",
  "returned",
  "cancelled",
];

/** i18n key for a given status label. */
export function statusI18nKey(status: string): string {
  return `orders.status.${status}`;
}
