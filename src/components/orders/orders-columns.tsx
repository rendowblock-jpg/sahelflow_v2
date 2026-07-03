"use client";

/**
 * Orders column definitions for DataTable v2 (Phase 1).
 *
 * Uses TanStack Table's ColumnDef pattern. The columns are defined separately
 * from the table component so they can be reused + customized.
 *
 * Includes: select checkbox, order number (sortable), customer, items, wilaya,
 * total (sortable), status badge, risk badge, date (sortable), actions dropdown.
 */
import { type ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { MoreVertical, Eye, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { formatDZD, formatDate } from "@/lib/utils";
import { selectColumn } from "@/components/data-table/data-table";
import { OrderStatusBadge } from "./order-status-badge";
import { RiskBadge } from "@/components/risk/risk-badge";
import type { RiskLevel } from "@/lib/risk-engine/types";
import type { OrderListItem } from "@/hooks/swr/use-orders";
import { useI18n } from "@/hooks/use-i18n";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";

interface UseOrdersColumnsOptions {
  locale: "ar" | "fr" | "en";
  /** Optional risk assessments: orderId → { level, score }. */
  riskData?: Record<string, { level: string; score: number }>;
  /** Called when user requests delete (shows confirm dialog). */
  onDelete?: (orderId: string) => void;
}

function SortIcon({ dir }: { dir: false | "asc" | "desc" }) {
  if (!dir) return <ArrowUpDown className="inline h-3 w-3 ms-1 opacity-40" />;
  return dir === "asc"
    ? <ArrowUp className="inline h-3 w-3 ms-1" />
    : <ArrowDown className="inline h-3 w-3 ms-1" />;
}

export function useOrdersColumns(opts: UseOrdersColumnsOptions): ColumnDef<OrderListItem, unknown>[] {
  const { t } = useI18n();
  const { locale, riskData, onDelete } = opts;

  const columns: ColumnDef<OrderListItem, unknown>[] = [
    selectColumn<OrderListItem>(),
    {
      accessorKey: "orderNumber",
      header: ({ column }) => (
        <span className="inline-flex items-center">
          {t("orders.orderNumber")}
          <SortIcon dir={column.getIsSorted() as false | "asc" | "desc"} />
        </span>
      ),
      cell: ({ row }) => (
        <span className="font-mono text-sm font-medium">{row.original.orderNumber}</span>
      ),
    },
    {
      id: "customer",
      accessorFn: (row) => row.customer?.name ?? "",
      header: ({ column }) => (
        <span className="inline-flex items-center">
          {t("orders.customer")}
          <SortIcon dir={column.getIsSorted() as false | "asc" | "desc"} />
        </span>
      ),
      cell: ({ row }) => (
        <div className="text-sm">
          <div className="font-medium truncate max-w-[150px]">
            {row.original.customer?.name ?? "—"}
          </div>
          <div className="text-xs text-muted-foreground font-mono">
            {row.original.customer?.phone ?? row.original.phone}
          </div>
        </div>
      ),
    },
    {
      id: "items",
      header: () => t("orders.items"),
      cell: ({ row }: { row: { original: OrderListItem } }) => {
        const count = row.original.items.length;
        return (
          <span className="text-sm text-muted-foreground">
            {count > 1
              ? t("orders.itemsCount", { n: String(count) })
              : t("orders.itemsCountSingular", { n: String(count) })}
          </span>
        );
      },
      meta: { hideOn: "md" },
      enableSorting: false,
    },
    {
      accessorKey: "wilaya",
      header: () => t("orders.wilaya"),
      cell: ({ row }) => <span className="text-sm">{row.original.wilaya}</span>,
      meta: { hideOn: "sm" },
      enableSorting: false,
    },
    {
      accessorKey: "totalPrice",
      header: ({ column }) => (
        <span className="inline-flex items-center">
          {t("orders.total")}
          <SortIcon dir={column.getIsSorted() as false | "asc" | "desc"} />
        </span>
      ),
      cell: ({ row }) => (
        <span className="font-medium text-sm tabular-nums">
          {formatDZD(row.original.totalPrice)}
        </span>
      ),
      meta: { align: "end" },
    },
    {
      accessorKey: "status",
      header: () => t("orders.status"),
      cell: ({ row }) => (
        <OrderStatusBadge
          orderId={row.original.id}
          status={row.original.status as never}
          size="sm"
        />
      ),
      enableSorting: false,
    },
    ...(riskData ? [{
      id: "risk" as const,
      header: () => t("risk.assessment.score"),
      cell: ({ row }: { row: { original: OrderListItem } }) => {
        const r = riskData[row.original.id];
        return r ? (
          <RiskBadge level={r.level as RiskLevel} score={r.score} href={`/orders/${row.original.id}`} />
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        );
      },
      meta: { hideOn: "md" as const },
      enableSorting: false,
    }] : []),
    {
      accessorKey: "createdAt",
      header: ({ column }) => (
        <span className="inline-flex items-center">
          {t("orders.date")}
          <SortIcon dir={column.getIsSorted() as false | "asc" | "desc"} />
        </span>
      ),
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          {formatDate(row.original.createdAt, locale)}
        </span>
      ),
      meta: { hideOn: "lg" },
    },
    {
      id: "actions",
      header: () => t("orders.action"),
      cell: ({ row }) => {
        const order = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
                <span className="sr-only">{t("orders.actions")}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="shadow-dropdown">
              <DropdownMenuItem asChild>
                <Link href={`/orders/${order.id}`}>
                  <Eye className="me-2 h-4 w-4" />
                  {t("orders.viewDetails")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/orders/${order.id}?edit=true`}>
                  <Pencil className="me-2 h-4 w-4" />
                  {t("orders.edit")}
                </Link>
              </DropdownMenuItem>
              {(order.status === "draft" || order.status === "cancelled") && onDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => onDelete(order.id)}
                  >
                    <Trash2 className="me-2 h-4 w-4" />
                    {t("orders.delete")}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
      meta: { align: "end", width: "w-12" },
      enableSorting: false,
    },
  ];

  return columns;
}
