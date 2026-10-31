"use client";

/**
 * Shipping list print (liste d'expédition): the paper a seller hands the courier.
 *
 * Rows come from buildShippingList (pure). The order details (address, items, courier) are not on the orders
 * list row, so they are fetched with the SAME permission-governed loader the delivery slips use; no new route.
 * Print choreography mirrors delivery-slip.tsx: portal (`hidden print:block`) -> body class -> window.print()
 * -> afterprint tears it down. Customer text is rendered as React text nodes (escaped), never as HTML.
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Printer } from "lucide-react";

import type { BulkAction } from "@/components/data-table/data-table";
import { loadDeliverySlipsForOrders, type DeliverySlipData } from "@/components/orders/delivery-slip";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/hooks/use-i18n";
import {
  buildShippingList,
  selectShippingListRows,
  SHIPPING_LIST_READY_STATUS,
  type ShippingListOrderInput,
  type ShippingListResult,
} from "@/lib/orders/shipping-list";
import { toast } from "@/lib/toast";
import { formatDate, formatDZD, formatDZDBare } from "@/lib/utils";

import "./shipping-list-print.css";

const PRINT_BODY_CLASS = "sf-shipping-list-printing";
const COLUMNS = ["number", "customer", "phone", "area", "address", "items", "cod", "courier", "tracking", "notes"] as const;

export function ShippingListSheet({ list }: { list: ShippingListResult }) {
  const { t } = useI18n();
  const locale = list.locale;
  const date = formatDate(list.generatedAt, locale);
  const { totals } = list;
  return (
    <section className="sf-sl">
      <header className="sf-sl-head">
        <h1 className="sf-sl-title">{t("orders.shippingList.title")}</h1>
        <p className="sf-sl-meta">{t("orders.shippingList.printedOn", { date })}</p>
      </header>
      <table className="sf-sl-table">
        <thead>
          <tr>
            {COLUMNS.map((column) => (
              <th key={column} scope="col">{t(`orders.shippingList.col.${column}`)}</th>
            ))}
          </tr>
        </thead>
        <tbody className="sf-sl-rows">
          {list.rows.map((row) => (
            <tr key={row.number}>
              <td className="sf-sl-num">{row.number}</td>
              <td>{row.customer}</td>
              <td className="sf-sl-num" dir="ltr">{row.phone}</td>
              <td>{[row.wilaya, row.commune].filter(Boolean).join(" / ")}</td>
              <td>
                {row.addressMissing ? (
                  <span className="sf-sl-missing">{t("orders.shippingList.addressMissing")}</span>
                ) : (
                  row.address
                )}
              </td>
              <td>{row.items}</td>
              <td className="sf-sl-num">{row.cod}</td>
              <td>{row.courier}</td>
              <td className="sf-sl-num">{row.tracking}</td>
              <td className="sf-sl-notes" />
            </tr>
          ))}
        </tbody>
        <tbody className="sf-sl-totals">
          <tr className="sf-sl-total">
            <td colSpan={6}>
              {t("orders.shippingList.total")}: {t("orders.shippingList.parcels", { count: formatDZDBare(totals.parcels, locale) })}
              {" · "}
              {t("orders.shippingList.units", { count: formatDZDBare(totals.items, locale) })}
            </td>
            <td className="sf-sl-num">{formatDZD(totals.codDzd, locale)}</td>
            <td colSpan={3}>
              {totals.codUnknown > 0
                ? t("orders.shippingList.codUnknown", { count: formatDZDBare(totals.codUnknown, locale) })
                : null}
            </td>
          </tr>
        </tbody>
      </table>
      <footer className="sf-sl-foot">SahelFlow{" · "}{date}</footer>
    </section>
  );
}

export function ShippingListPrintRoot({ list }: { list: ShippingListResult }) {
  const { dir } = useI18n();
  return createPortal(
    <div className="sf-shipping-list-root hidden print:block" dir={dir} aria-hidden="true">
      <ShippingListSheet list={list} />
    </div>,
    document.body,
  );
}

export function ShippingListPrintButton({
  count,
  onPrint,
  busy = false,
}: {
  /** Orders that would go on the list. 0 disables the button and says why. */
  count: number;
  onPrint: () => void;
  busy?: boolean;
}) {
  const { t } = useI18n();
  const empty = count === 0;
  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={empty || busy}
        aria-describedby={empty ? "shipping-list-empty-reason" : undefined}
        onClick={onPrint}
      >
        <Printer className="size-4" aria-hidden="true" />
        {t("orders.shippingList.print")}
      </Button>
      {empty ? (
        <span id="shipping-list-empty-reason" className="text-xs text-muted-foreground">
          {t("orders.shippingList.emptyReason")}
        </span>
      ) : null}
    </div>
  );
}

/** Build, mount, print, tear down. Idempotent: a mid-print navigation cannot leak the body class. */
export function useShippingListPrinting() {
  const { t, locale } = useI18n();
  const [list, setList] = useState<ShippingListResult | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);

  const print = useCallback(
    async (load: () => Promise<ShippingListOrderInput[]>) => {
      setIsPreparing(true);
      try {
        const built = buildShippingList(await load(), { locale });
        if (built.rows.length === 0) {
          toast.error(t("orders.shippingList.nothingToPrint"));
          return;
        }
        setList(built);
      } catch {
        toast.error(t("orders.shippingList.loadFailed"));
      } finally {
        setIsPreparing(false);
      }
    },
    [locale, t],
  );

  useEffect(() => {
    if (!list) return;
    document.body.classList.add(PRINT_BODY_CLASS);
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      document.body.classList.remove(PRINT_BODY_CLASS);
      setList(null);
    };
    const mediaQuery = typeof window.matchMedia === "function" ? window.matchMedia("print") : null;
    const onMediaChange = (event: MediaQueryListEvent) => {
      if (!event.matches) finish();
    };
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.addEventListener("afterprint", finish, { once: true });
        mediaQuery?.addEventListener("change", onMediaChange);
        window.print();
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("afterprint", finish);
      mediaQuery?.removeEventListener("change", onMediaChange);
      finish();
    };
  }, [list]);

  const printRoot: ReactNode = list ? <ShippingListPrintRoot list={list} /> : null;
  return { print, isPreparing, printRoot };
}

function slipToInput(slip: DeliverySlipData, status: string): ShippingListOrderInput {
  return {
    orderNumber: slip.orderNumber,
    status,
    customerName: slip.customerName,
    phone: slip.phone,
    wilaya: slip.wilaya,
    commune: slip.commune,
    address: slip.address,
    items: slip.items.map((item) => ({
      name: item.variant ? `${item.name} (${item.variant})` : item.name,
      quantity: item.quantity,
    })),
    total: slip.total,
    provider: slip.provider,
    trackingNumber: slip.trackingNumber,
  };
}

interface ShippingListRowRef {
  id: string;
  orderNumber: string;
  status: string;
  customer?: { name: string | null } | null;
}

/** The orders page entry points: a toolbar button (ready rows) and a bulk-bar action (selected rows). */
export function useOrdersShippingList(rows: readonly ShippingListRowRef[], online: boolean) {
  const { t } = useI18n();
  const { print, isPreparing, printRoot } = useShippingListPrinting();

  const printIds = useCallback(
    (ids: string[]) => {
      const chosen = selectShippingListRows(rows, ids);
      if (chosen.length === 0) return;
      const statusByNumber = new Map(chosen.map((row) => [row.orderNumber, row.status] as const));
      void print(async () => {
        const { slips, failed } = await loadDeliverySlipsForOrders(
          chosen.map((row) => ({ id: row.id, customerName: row.customer?.name ?? null })),
        );
        if (failed.length > 0) {
          toast.warning(
            t("orders.shippingList.partialLoad", { ok: String(slips.length), total: String(chosen.length) }),
          );
        }
        return slips.flatMap((slip) => {
          const status = statusByNumber.get(slip.orderNumber);
          return status === undefined ? [] : [slipToInput(slip, status)];
        });
      });
    },
    [print, rows, t],
  );

  const readyCount = rows.filter((row) => row.status === SHIPPING_LIST_READY_STATUS).length;
  const bulkAction: BulkAction = {
    label: t("orders.shippingList.print"),
    onClick: (ids) => printIds(ids),
    icon: Printer,
    disabled: isPreparing || !online,
  };
  const button = (
    <ShippingListPrintButton count={readyCount} busy={isPreparing || !online} onPrint={() => printIds([])} />
  );
  return { bulkAction, button, printRoot };
}
