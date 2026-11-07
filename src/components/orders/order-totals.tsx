import { Separator } from "@/components/ui/separator";
import { formatDZD, type SupportedLocale } from "@/lib/utils";

/**
 * The totals block of the order page: subtotal, optional discount, shipping, total. A server component that shows what the page
 * already loaded and works nothing out: the total is what the order stores (items - discount + delivery). The discount row
 * (item 2 money) exists only for an order that carries one; the amount is one bidi-isolated run so the minus stays attached to the
 * number in Arabic and French alike.
 */

type Translate = (key: string, params?: Record<string, string | number>) => string;

export interface OrderTotalsProps {
  t: Translate;
  locale: SupportedLocale;
  itemsTotal: number;
  deliveryCost: number;
  totalPrice: number;
  /** Whole dinars taken off the items; 0, null or absent = no row. */
  discountDzd?: number | null;
}

export function OrderTotals({ t, locale, itemsTotal, deliveryCost, totalPrice, discountDzd }: OrderTotalsProps) {
  return (
    <div className="ms-auto w-full max-w-xs space-y-2 border-t pt-4">
      <div className="flex justify-between gap-4 text-sm">
        <span className="text-muted-foreground">{t("orders.detail.subtotal")}</span>
        <span className="tabular-nums">{formatDZD(itemsTotal, locale)}</span>
      </div>
      {discountDzd != null && discountDzd > 0 ? (
        <div className="flex justify-between gap-4 text-sm">
          <span className="text-muted-foreground">{t("orders.detail.discount")}</span>
          <bdi className="tabular-nums">{`\u2212${formatDZD(discountDzd, locale)}`}</bdi>
        </div>
      ) : null}
      <div className="flex justify-between gap-4 text-sm">
        <span className="text-muted-foreground">{t("orders.detail.shipping")}</span>
        <span className="tabular-nums">{deliveryCost > 0 ? formatDZD(deliveryCost, locale) : "\u2014"}</span>
      </div>
      <Separator />
      <div className="flex items-baseline justify-between gap-4 text-lg font-semibold">
        <span>{t("orders.total")}</span>
        <span className="tabular-nums">{formatDZD(totalPrice, locale)}</span>
      </div>
    </div>
  );
}
