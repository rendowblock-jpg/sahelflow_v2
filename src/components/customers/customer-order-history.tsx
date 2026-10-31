import Link from "next/link";
import { ShoppingBag } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Locale } from "@/lib/i18n";
import { orderStatusStyles } from "@/lib/shared";
import { statusI18nKey } from "@/lib/shared/status-colors";
import { formatDZD, formatDate } from "@/lib/utils";
import type { OrderStatus } from "@/types/domain";

export interface CustomerOrderHistoryRow {
  id: string;
  orderNumber: string;
  status: string;
  /** Whole dinars; null when the viewer may not read financials. */
  totalPrice: number | null;
  createdAt: Date | string;
}

interface CustomerOrderHistoryProps {
  orders: ReadonlyArray<CustomerOrderHistoryRow>;
  locale: Locale;
  t: (key: string) => string;
}

function StatusChip({ status, t }: { status: string; t: (key: string) => string }) {
  const typed = status as OrderStatus;
  const style = orderStatusStyles[typed];
  return style ? (
    <span className={`inline-flex items-center gap-1.5 rounded-control border px-2 py-0.5 text-xs font-medium ${style.bg} ${style.text} ${style.border}`}>
      <span className={`size-1.5 rounded-full ${style.dot}`} />
      {t(style.i18nKey)}
    </span>
  ) : (
    <Badge variant="outline">{t(statusI18nKey(typed))}</Badge>
  );
}

/**
 * A customer's orders. A phone gets one card per order (no sideways-scrolling table); md and up gets the table.
 * Server-safe: no hooks, the page passes its own `t` and locale.
 */
export function CustomerOrderHistory({ orders, locale, t }: CustomerOrderHistoryProps) {
  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <ShoppingBag className="mb-2 size-8 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">{t("customers.noOrders")}</p>
      </div>
    );
  }
  const total = (row: CustomerOrderHistoryRow) =>
    row.totalPrice === null ? "—" : formatDZD(row.totalPrice, locale);
  return (
    <>
      <ul className="space-y-2 md:hidden" aria-label={t("customers.orderHistory")}>
        {orders.map((order) => (
          <li key={order.id} className="rounded-surface border border-border bg-card p-3">
            <div className="flex items-center justify-between gap-3">
              <Link
                href={`/orders/${order.id}`}
                className="inline-flex min-h-11 items-center font-mono text-sm font-medium text-primary hover:underline"
              >
                {order.orderNumber}
              </Link>
              <StatusChip status={order.status} t={t} />
            </div>
            <div className="mt-1 flex items-center justify-between gap-3 text-sm">
              <span className="font-medium tabular-nums">{total(order)}</span>
              <span className="text-muted-foreground">{formatDate(order.createdAt, locale)}</span>
            </div>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto md:block">
        <Table scrollLabel={t("customers.orderHistory")}>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>{t("orders.status")}</TableHead>
              <TableHead className="text-end">{t("orders.total")}</TableHead>
              <TableHead>{t("orders.date")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((order) => (
              <TableRow key={order.id}>
                <TableCell className="font-mono text-sm">
                  <Link href={`/orders/${order.id}`} className="font-medium text-primary hover:underline">
                    {order.orderNumber}
                  </Link>
                </TableCell>
                <TableCell>
                  <StatusChip status={order.status} t={t} />
                </TableCell>
                <TableCell className="text-end tabular-nums">{total(order)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDate(order.createdAt, locale)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
