"use client";

/**
 * Bon de livraison (delivery slip / packing slip) — R3-b.
 *
 * Printing a slip for the courier run is a daily COD ritual the app was
 * missing entirely (audit d4: only the courier `labelUrl` external link
 * existed). This file owns:
 *
 *   - `DeliverySlipData`        serializable slip payload (RSC → client safe)
 *   - `DeliverySlip`            the print-optimized A5-ish monochrome slip
 *   - `useDeliverySlipPrinting` print choreography (portal + window.print)
 *   - `DeliverySlipPrintButton` ready-made trigger for the order detail page
 *   - `fetchDeliverySlipData` / `loadDeliverySlipsForOrders` batch loaders
 *     built on the existing GET /api/orders/[id] (+/[id]/courier) endpoints
 *
 * Print mechanics: slips render into a `hidden print:block` portal on
 * document.body (`.sf-print-root`). While printing, the body carries the
 * `sf-printing` class and ONE global rule (product-system.css) hides every
 * other direct child of <body>, so the slip is the only printed content.
 *
 * Authority: financials are projected server-side — a redacted order carries
 * null prices and the slip degrades to items + quantities with no totals.
 * Contact redaction nulls phone/address lines the same way.
 *
 * RTL: the slip inherits the document direction and mirrors via logical
 * utilities only; `dir` is also set explicitly on the portal root.
 */

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/hooks/use-i18n";
import { formatDate, formatDZD } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { formatDZPhone } from "@/lib/validation/phone";
import { useShopStore } from "@/stores/shop-store";

/** Body class toggled by the print choreography (see product-system.css). */
const PRINT_BODY_CLASS = "sf-printing";

export interface DeliverySlipItemData {
  name: string;
  variant: string | null;
  quantity: number;
  unitPrice: number | null;
  total: number | null;
}

/**
 * Serializable slip payload. Null financial fields mean "redacted for this
 * actor", not "unknown" — the slip omits price columns and totals entirely.
 */
export interface DeliverySlipData {
  orderNumber: string;
  /** ISO date string. */
  createdAt: string;
  customerName: string | null;
  phone: string | null;
  wilaya: string | null;
  commune: string | null;
  address: string | null;
  items: DeliverySlipItemData[];
  itemsTotal: number | null;
  deliveryCost: number | null;
  total: number | null;
  provider: string | null;
  trackingNumber: string | null;
  notes?: string | null;
}

/** Resolve the slip header name: explicit → active shop → localized default. */
function useSlipShopName(explicit?: string | null): string {
  const { t } = useI18n();
  const shops = useShopStore((state) => state.shops);
  const activeShopId = useShopStore((state) => state.activeShopId);
  if (explicit?.trim()) return explicit.trim();
  const active = shops.find((shop) => shop.id === activeShopId);
  if (active) {
    return active.id === "default" && active.name === "Ma Boutique"
      ? t("topbar.defaultShopName")
      : active.name;
  }
  return t("topbar.defaultShopName");
}

/**
 * One print-optimized slip. Monochrome by design (black on white regardless
 * of the active theme — dark-mode tokens would vanish on paper) and sized
 * for A5 paper while remaining comfortable on an A4 sheet.
 */
export function DeliverySlip({
  data,
  shopName,
}: {
  data: DeliverySlipData;
  shopName?: string | null;
}) {
  const { t, locale } = useI18n();
  const resolvedShopName = useSlipShopName(shopName);
  // Null total = financials redacted for this actor → quantities-only slip.
  const showPrices = data.total !== null;
  const location = [data.commune, data.wilaya].filter(Boolean).join(", ");

  return (
    <article
      data-testid="delivery-slip"
      className="mx-auto w-full max-w-[148mm] border-2 border-black bg-white p-5 text-black"
    >
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 border-b-2 border-black pb-3">
        <div className="min-w-0">
          <p className="text-base font-bold uppercase tracking-wide">
            {resolvedShopName}
          </p>
          {data.phone ? (
            <p className="mt-1 font-mono text-xs" dir="ltr">
              {formatDZPhone(data.phone)}
            </p>
          ) : null}
        </div>
        <div className="text-end">
          <p className="text-base font-bold uppercase tracking-wide">
            {t("orders.slip.title")}
          </p>
          <p className="mt-1 font-mono text-xs font-semibold" data-order-number>
            {data.orderNumber}
          </p>
          <p className="mt-0.5 text-xs">{formatDate(data.createdAt, locale)}</p>
        </div>
      </header>

      {(data.customerName || location || data.address || data.phone) && (
        <section className="mt-3 space-y-0.5">
          <p className="text-xs font-semibold uppercase tracking-wide">
            {t("orders.address")}
          </p>
          {data.customerName ? (
            <p className="text-sm font-bold">{data.customerName}</p>
          ) : null}
          {location ? <p className="text-xs">{location}</p> : null}
          {data.address ? <p className="text-xs">{data.address}</p> : null}
        </section>
      )}

      <table className="mt-3 w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-black">
            <th className="py-1.5 text-start font-semibold">
              {t("orders.slip.item")}
            </th>
            <th className="py-1.5 text-end font-semibold">
              {t("orders.quantity")}
            </th>
            {showPrices ? (
              <th className="py-1.5 text-end font-semibold">
                {t("orders.slip.unitPrice")}
              </th>
            ) : null}
            {showPrices ? (
              <th className="py-1.5 text-end font-semibold">
                {t("orders.total")}
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {data.items.map((item, index) => (
            <tr
              key={`${item.name}-${index}`}
              className="border-b border-black/40 align-top"
            >
              <td className="py-1.5 text-start">
                {item.name}
                {item.variant ? (
                  <span className="text-black/60"> — {item.variant}</span>
                ) : null}
              </td>
              <td className="py-1.5 text-end tabular-nums">{item.quantity}</td>
              {showPrices ? (
                <td className="py-1.5 text-end tabular-nums">
                  {item.unitPrice == null
                    ? "—"
                    : formatDZD(item.unitPrice, locale)}
                </td>
              ) : null}
              {showPrices ? (
                <td className="py-1.5 text-end tabular-nums">
                  {item.total == null ? "—" : formatDZD(item.total, locale)}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>

      {showPrices ? (
        <section className="mt-3 space-y-1 text-xs">
          <div className="flex items-center justify-between">
            <span>{t("orders.detail.subtotal")}</span>
            <span className="tabular-nums">
              {formatDZD(data.itemsTotal ?? 0, locale)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>{t("orders.detail.shipping")}</span>
            <span className="tabular-nums">
              {data.deliveryCost == null
                ? "—"
                : formatDZD(data.deliveryCost, locale)}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between border-t-2 border-black pt-1.5 text-sm font-bold">
            <span>{t("orders.slip.codTotal")}</span>
            <span className="tabular-nums">
              {formatDZD(data.total ?? 0, locale)}
            </span>
          </div>
        </section>
      ) : null}

      {data.provider || data.trackingNumber ? (
        <section className="mt-3 flex flex-wrap gap-x-8 gap-y-1 border-t border-black/40 pt-2 text-xs">
          {data.provider ? (
            <p>
              <span className="font-semibold">{t("orders.slip.courier")}: </span>
              {data.provider}
            </p>
          ) : null}
          {data.trackingNumber ? (
            <p>
              <span className="font-semibold">
                {t("orders.slip.trackingNumber")}:{" "}
              </span>
              <bdi className="font-mono">{data.trackingNumber}</bdi>
            </p>
          ) : null}
        </section>
      ) : null}

      {data.notes ? (
        <p className="mt-2 text-xs">
          <span className="font-semibold">{t("orders.notes")}: </span>
          {data.notes}
        </p>
      ) : null}

      <footer className="mt-10 flex items-end justify-between gap-8 text-xs">
        <div className="w-2/5 border-t border-black pt-1 ps-2 font-semibold">
          {t("orders.slip.signature")}
        </div>
        <div className="w-1/4 border-t border-black pt-1 ps-2">
          {t("orders.date")}
        </div>
      </footer>
    </article>
  );
}

/**
 * Print-only portal: rendered directly under <body> so the single global
 * print rule (product-system.css) can hide every other app chrome node.
 * Hidden on screen; one slip per printed page.
 */
export function DeliverySlipPrintRoot({
  slips,
}: {
  slips: DeliverySlipData[];
}) {
  const { dir } = useI18n();

  // The portal only mounts from a click handler (post-hydration), so the
  // SSR pass never reaches this render; the guard keeps direct renders safe.
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="sf-print-root hidden print:block" dir={dir} aria-hidden="true">
      {slips.map((slip, index) => (
        <section
          key={`${slip.orderNumber}-${index}`}
          className={index < slips.length - 1 ? "break-after-page" : undefined}
        >
          <DeliverySlip data={slip} />
        </section>
      ))}
    </div>,
    document.body,
  );
}

/**
 * Print choreography: resolve slips → portal mounts → body gains
 * `sf-printing` → window.print() → afterprint (or the print media query
 * flipping back) tears everything down. All steps are idempotent so a
 * mid-print navigation cannot leak the body class.
 */
export function useDeliverySlipPrinting() {
  const { t } = useI18n();
  const [activeSlips, setActiveSlips] = useState<DeliverySlipData[] | null>(
    null,
  );
  const [isPreparing, setIsPreparing] = useState(false);

  const print = useCallback(
    async (loadSlips: () => Promise<DeliverySlipData[]>) => {
      setIsPreparing(true);
      try {
        const slips = await loadSlips();
        if (slips.length === 0) {
          toast.error(t("orders.slip.printFailed"));
          return;
        }
        setActiveSlips(slips);
      } catch {
        toast.error(t("orders.slip.printFailed"));
      } finally {
        setIsPreparing(false);
      }
    },
    [t],
  );

  useEffect(() => {
    if (!activeSlips) return;
    document.body.classList.add(PRINT_BODY_CLASS);
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      document.body.classList.remove(PRINT_BODY_CLASS);
      setActiveSlips(null);
    };
    const onPrintMediaChange = (event: MediaQueryListEvent) => {
      if (!event.matches) finish();
    };
    const mediaQuery = window.matchMedia("print");
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.addEventListener("afterprint", finish, { once: true });
        mediaQuery.addEventListener("change", onPrintMediaChange);
        window.print();
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("afterprint", finish);
      mediaQuery.removeEventListener("change", onPrintMediaChange);
      finish();
    };
  }, [activeSlips]);

  const printRoot = activeSlips ? (
    <DeliverySlipPrintRoot slips={activeSlips} />
  ) : null;

  return { print, isPreparing, printRoot };
}

interface DeliverySlipPrintButtonProps {
  /** Pre-resolved slips (serializable — usable from Server Components). */
  slips?: DeliverySlipData[];
  /** Client-side loader (batch flows fetch order details on demand). */
  loadSlips?: () => Promise<DeliverySlipData[]>;
  label?: string;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm";
  iconOnly?: boolean;
  className?: string;
  disabled?: boolean;
}

/** Ready-made print trigger for surfaces that own the slip data up front. */
export function DeliverySlipPrintButton({
  slips,
  loadSlips,
  label,
  variant = "outline",
  size = "sm",
  iconOnly = false,
  className,
  disabled = false,
}: DeliverySlipPrintButtonProps) {
  const { t } = useI18n();
  const { print, isPreparing, printRoot } = useDeliverySlipPrinting();

  const handleClick = useCallback(async () => {
    if (slips && slips.length > 0) {
      await print(async () => slips);
    } else if (loadSlips) {
      await print(loadSlips);
    }
  }, [loadSlips, print, slips]);

  const resolvedLabel = label ?? t("orders.slip.print");
  return (
    <>
      <Button
        variant={variant}
        size={iconOnly ? "icon-sm" : size}
        className={className}
        disabled={disabled || isPreparing}
        onClick={() => void handleClick()}
        data-testid="print-delivery-slip"
      >
        {isPreparing ? (
          <Loader2
            className={iconOnly ? "size-4 animate-spin" : "me-1.5 size-4 animate-spin"}
            aria-hidden="true"
          />
        ) : (
          <Printer
            className={iconOnly ? "size-4" : "me-1.5 size-4"}
            aria-hidden="true"
          />
        )}
        {iconOnly ? (
          <span className="sr-only">{resolvedLabel}</span>
        ) : (
          resolvedLabel
        )}
      </Button>
      {printRoot}
    </>
  );
}

/** Narrow wire type for GET /api/orders/[id] (trusted-actor projection). */
interface OrderDetailWire {
  orderNumber: string;
  createdAt: string;
  phone: string | null;
  address: string | null;
  wilaya: string | null;
  commune: string | null;
  notes: string | null;
  totalPrice: number | null;
  deliveryCost: number | null;
  items: Array<{
    productName: string;
    productVariantName: string | null;
    quantity: number;
    unitPrice: number | null;
    total: number | null;
  }>;
  fieldAccess?: { contact: boolean; financials: boolean } | undefined;
}

/** Narrow wire type for GET /api/orders/[id]/courier (delivery position). */
interface CourierPositionWire {
  position?: {
    delivery?: {
      provider: string | null;
      trackingNumber: string | null;
    } | null;
  } | null;
}

/**
 * Fetch one order's slip data through the existing permission-governed
 * endpoints. Courier position (provider + tracking) is best-effort: an actor
 * without that route's authority simply prints the slip without it.
 */
export async function fetchDeliverySlipData(
  orderId: string,
  seed?: { customerName?: string | null },
): Promise<DeliverySlipData | null> {
  const [orderResult, courierResult] = await Promise.allSettled([
    fetch(`/api/orders/${encodeURIComponent(orderId)}`),
    fetch(`/api/orders/${encodeURIComponent(orderId)}/courier`),
  ]);

  if (orderResult.status !== "fulfilled" || !orderResult.value.ok) return null;
  const { order } = (await orderResult.value.json()) as { order: OrderDetailWire };

  let provider: string | null = null;
  let trackingNumber: string | null = null;
  if (courierResult.status === "fulfilled" && courierResult.value.ok) {
    const payload = (await courierResult.value.json()) as CourierPositionWire;
    provider = payload.position?.delivery?.provider ?? null;
    trackingNumber = payload.position?.delivery?.trackingNumber ?? null;
  }

  // Null prices are the projection's explicit financial redaction.
  const hasFinancials = order.fieldAccess?.financials ?? order.totalPrice !== null;
  const itemsTotal = hasFinancials
    ? order.items.reduce((sum, item) => sum + (item.total ?? 0), 0)
    : null;

  return {
    orderNumber: order.orderNumber,
    createdAt: order.createdAt,
    customerName: seed?.customerName ?? null,
    phone: order.phone,
    wilaya: order.wilaya,
    commune: order.commune,
    address: order.address,
    items: order.items.map((item) => ({
      name: item.productName,
      variant: item.productVariantName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      total: item.total,
    })),
    itemsTotal,
    deliveryCost: hasFinancials ? order.deliveryCost : null,
    total: hasFinancials ? order.totalPrice : null,
    provider,
    trackingNumber,
    notes: order.notes,
  };
}

/**
 * Batch loader for bulk printing: one slip per order, selection order
 * preserved, honest per-order failures (the caller decides how to surface
 * them). Never throws.
 */
export async function loadDeliverySlipsForOrders(
  orders: Array<{ id: string; customerName?: string | null }>,
): Promise<{ slips: DeliverySlipData[]; failed: string[] }> {
  const results = await Promise.allSettled(
    orders.map((order) =>
      fetchDeliverySlipData(order.id, { customerName: order.customerName }),
    ),
  );
  const slips: DeliverySlipData[] = [];
  const failed: string[] = [];
  results.forEach((result, index) => {
    if (result.status === "fulfilled" && result.value) {
      slips.push(result.value);
    } else {
      const failedOrder = orders[index];
      if (failedOrder) failed.push(failedOrder.id);
    }
  });
  return { slips, failed };
}
