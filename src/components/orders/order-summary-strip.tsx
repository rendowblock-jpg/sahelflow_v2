import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { cn, formatDZD, type SupportedLocale } from "@/lib/utils";
import { displayWilaya } from "@/lib/wilaya-display";

/**
 * The first thing on the order page: who, how much, where, what next. ONE card with four cells (total, customer,
 * payment, delivery) separated by hairlines (2 x 2 on a phone, one row from 1280 px). A server component that
 * only shows what the page already loaded: it adds no query. The WhatsApp button comes in as a slot so the page keeps
 * owning it (offline gate, contract tests).
 */

type Translate = (key: string, params?: Record<string, string | number>) => string;

export interface OrderSummaryStripProps {
  t: Translate;
  locale: SupportedLocale;
  status: string;
  totalPrice: number;
  deliveryCost: number;
  itemCount: number;
  customerName: string | null;
  phone: string | null;
  wilaya: string | null;
  commune: string | null;
  address: string | null;
  codState: string | null;
  deliveryState: string | null;
  delivery: { provider: string; trackingNumber: string | null; status: string } | null;
  whatsapp?: ReactNode;
  className?: string;
}

/** COD states with nothing left to collect from the customer. */
const NOTHING_TO_COLLECT = new Set([
  "collected",
  "partially_remitted",
  "remitted",
  "settled",
  "not_expected",
]);
const NO_COLLECTION_STATUSES = new Set(["cancelled", "refused", "returned"]);

function stateLabel(t: Translate, value: string | null | undefined): string | null {
  if (!value) return null;
  const key = `orders.workspace.fulfillment.state.${value}`;
  const label = t(key);
  return label === key ? null : label;
}

function providerLabel(provider: string): string {
  const spaced = provider.replace(/[_-]+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function CellLabel({ children }: { children: ReactNode }) {
  return <p className="text-xs font-medium text-muted-foreground">{children}</p>;
}

export function OrderSummaryStrip({
  t,
  locale,
  status,
  totalPrice,
  deliveryCost,
  itemCount,
  customerName,
  phone,
  wilaya,
  commune,
  address,
  codState,
  deliveryState,
  delivery,
  whatsapp,
  className,
}: OrderSummaryStripProps) {
  const place = [commune, wilaya ? displayWilaya(wilaya, locale) : null].filter(Boolean).join(" · ");
  const collect = !NO_COLLECTION_STATUSES.has(status) && !(codState && NOTHING_TO_COLLECT.has(codState));
  const paymentLabel = stateLabel(t, codState) ?? t("orders.detail.summary.codPlain");
  const deliveryLabel = stateLabel(t, deliveryState) ?? stateLabel(t, delivery?.status);
  const cell = "min-w-0 bg-card p-4";

  return (
    <Card
      className={cn("gap-0 overflow-hidden border-foreground/20 py-0", className)}
      data-testid="order-summary-strip"
    >
      <div
        data-testid="order-summary-grid"
        className="grid grid-cols-2 gap-px bg-border xl:grid-cols-4"
      >
        <div data-testid="order-summary-total" className={cell}>
          <CellLabel>{t("orders.detail.summary.total")}</CellLabel>
          <p className="mt-1 break-words text-2xl font-semibold leading-tight tabular-nums">
            {formatDZD(totalPrice, locale)}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("orders.detail.itemsCount", { count: itemCount })}
            {" · "}
            {t("orders.detail.summary.shippingLine", {
              amount: deliveryCost > 0 ? formatDZD(deliveryCost, locale) : "—",
            })}
          </p>
        </div>

        <div data-testid="order-summary-customer" className={cell}>
          <CellLabel>{t("orders.detail.summary.customer")}</CellLabel>
          {customerName ? (
            <p className="mt-1 break-words text-base font-semibold leading-snug">
              <bdi dir="auto">{customerName}</bdi>
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">{t("orders.detail.customerNotFound")}</p>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
            {phone ? (
              <a
                href={`tel:${phone}`}
                dir="ltr"
                className="text-sm tabular-nums hover:underline"
              >
                {phone}
              </a>
            ) : null}
            {whatsapp}
          </div>
          {place ? <p className="mt-1 break-words text-sm text-muted-foreground">{place}</p> : null}
        </div>

        <div data-testid="order-summary-payment" className={cell}>
          <CellLabel>{t("orders.detail.summary.payment")}</CellLabel>
          <p className="mt-1 text-base font-semibold leading-snug">{paymentLabel}</p>
          {collect ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {t("orders.detail.summary.toCollect")}{" "}
              <span className="font-medium tabular-nums text-foreground">
                {formatDZD(totalPrice, locale)}
              </span>
            </p>
          ) : null}
        </div>

        <div data-testid="order-summary-delivery" className={cell}>
          <CellLabel>{t("orders.detail.summary.delivery")}</CellLabel>
          {delivery ? (
            <>
              <p className="mt-1 break-words text-base font-semibold leading-snug">
                {providerLabel(delivery.provider)}
              </p>
              {delivery.trackingNumber ? (
                <p className="text-sm text-muted-foreground">
                  <span dir="ltr" className="inline-block break-all font-mono tabular-nums">
                    {delivery.trackingNumber}
                  </span>
                </p>
              ) : null}
            </>
          ) : (
            <p className="mt-1 text-base font-semibold leading-snug">
              {t("orders.detail.summary.noShipment")}
            </p>
          )}
          {deliveryLabel ? <p className="text-sm">{deliveryLabel}</p> : null}
          {address ? (
            <p className="mt-1 line-clamp-2 break-words text-sm text-muted-foreground">{address}</p>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
