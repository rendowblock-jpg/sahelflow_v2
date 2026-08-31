"use client";

import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Eye,
  MessageCircle,
  MoreVertical,
  Pencil,
  Printer,
  Trash2,
} from "lucide-react";

import { selectColumn } from "@/components/data-table/data-table";
import { TechnicalValue } from "@/components/i18n/technical-value";
import { RiskBadge } from "@/components/risk/risk-badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { OrderListItem } from "@/hooks/swr/use-orders";
import { useI18n } from "@/hooks/use-i18n";
import type { RiskLevel } from "@/lib/risk-engine/types";
import { formatDate, formatDZD } from "@/lib/utils";
import { buildOrderWhatsAppMessage } from "@/lib/i18n/order-actions-runtime";
import { buildWhatsAppLink } from "@/lib/whatsapp/deep-link";
import type { WorkbenchFieldAccess } from "@/types/workbench";
import { OrderStatusBadge } from "./order-status-badge";

interface UseOrdersColumnsOptions {
  locale: "ar" | "fr" | "en";
  fieldAccess: WorkbenchFieldAccess;
  riskData?: Record<string, { level: string; score: number }>;
  onDelete?: (orderId: string) => void;
  /** R3-b: print the bon de livraison for one order (detail is fetched lazily). */
  onPrintSlip?: (order: OrderListItem) => void;
}

function SortIcon({ dir }: { dir: false | "asc" | "desc" }) {
  if (!dir) {
    return <ArrowUpDown className="ms-1 inline size-3 opacity-40" aria-hidden="true" />;
  }
  return dir === "asc" ? (
    <ArrowUp className="ms-1 inline size-3" aria-hidden="true" />
  ) : (
    <ArrowDown className="ms-1 inline size-3" aria-hidden="true" />
  );
}

export function useOrdersColumns(
  opts: UseOrdersColumnsOptions,
): ColumnDef<OrderListItem, unknown>[] {
  const { t } = useI18n();
  const { locale, fieldAccess, riskData, onDelete, onPrintSlip } = opts;
  const canOpenDetail = fieldAccess.contact && fieldAccess.financials;

  const columns: ColumnDef<OrderListItem, unknown>[] = [
    ...(fieldAccess.update ? [selectColumn<OrderListItem>()] : []),
    {
      accessorKey: "orderNumber",
      header: ({ column }) => (
        <span className="inline-flex items-center">
          {t("orders.orderNumber")}
          <SortIcon dir={column.getIsSorted() as false | "asc" | "desc"} />
        </span>
      ),
      cell: ({ row }) =>
        canOpenDetail ? (
          <Link
            href={`/orders/${row.original.id}`}
            className="text-sm font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            <TechnicalValue data-order-number>
              {row.original.orderNumber}
            </TechnicalValue>
          </Link>
        ) : (
          <TechnicalValue className="text-sm font-medium" data-order-number>
            {row.original.orderNumber}
          </TechnicalValue>
        ),
    },
    ...(fieldAccess.contact
      ? [
          {
            id: "customer",
            accessorFn: (row: OrderListItem) => row.customer?.name ?? "",
            header: () => t("orders.customer"),
            cell: ({ row }: { row: { original: OrderListItem } }) => (
              <div className="max-w-[170px] text-sm">
                <div className="truncate font-medium">{row.original.customer?.name ?? "—"}</div>
                <TechnicalValue className="block truncate text-xs text-muted-foreground">
                  {row.original.customer?.phone ?? row.original.phone ?? "—"}
                </TechnicalValue>
              </div>
            ),
            enableSorting: false,
          } satisfies ColumnDef<OrderListItem, unknown>,
        ]
      : []),
    {
      id: "items",
      header: () => t("orders.items"),
      cell: ({ row }) => {
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
    ...(fieldAccess.contact
      ? [
          {
            accessorKey: "wilaya",
            header: () => t("orders.wilaya"),
            cell: ({ row }: { row: { original: OrderListItem } }) => (
              <span className="text-sm">{row.original.wilaya ?? "—"}</span>
            ),
            meta: { hideOn: "sm" as const },
            enableSorting: false,
          } satisfies ColumnDef<OrderListItem, unknown>,
        ]
      : []),
    ...(fieldAccess.financials
      ? [
          {
            accessorKey: "totalPrice",
            header: ({ column }) => (
              <span className="inline-flex items-center">
                {t("orders.total")}
                <SortIcon dir={column.getIsSorted() as false | "asc" | "desc"} />
              </span>
            ),
            cell: ({ row }: { row: { original: OrderListItem } }) => (
              <span className="text-sm font-medium tabular-nums" data-money>
                {row.original.totalPrice == null ? "—" : formatDZD(row.original.totalPrice, locale)}
              </span>
            ),
            meta: { align: "end" as const },
          } satisfies ColumnDef<OrderListItem, unknown>,
        ]
      : []),
    {
      accessorKey: "status",
      header: () => t("orders.status"),
      cell: ({ row }) => (
        <OrderStatusBadge
          orderId={row.original.id}
          status={row.original.status as never}
          size="sm"
          disabled={
            !fieldAccess.update ||
            row.original.mutationAuthority === "canonical_v1" ||
            row.original.mutationAuthority === "confirmation_blocked"
          }
        />
      ),
      enableSorting: false,
    },
    ...(fieldAccess.risk
      ? [
          {
            id: "risk",
            header: () => t("risk.assessment.score"),
            cell: ({ row }: { row: { original: OrderListItem } }) => {
              const risk = riskData?.[row.original.id];
              return risk ? (
                <RiskBadge
                  level={risk.level as RiskLevel}
                  score={risk.score}
                  href={canOpenDetail ? `/orders/${row.original.id}` : undefined}
                />
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              );
            },
            meta: { hideOn: "md" as const },
            enableSorting: false,
          } satisfies ColumnDef<OrderListItem, unknown>,
        ]
      : []),
    {
      accessorKey: "createdAt",
      header: ({ column }) => (
        <span className="inline-flex items-center">
          {t("orders.date")}
          <SortIcon dir={column.getIsSorted() as false | "asc" | "desc"} />
        </span>
      ),
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-sm text-muted-foreground">
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
        const canDelete =
          fieldAccess.delete &&
          order.mutationAuthority !== "canonical_v1" &&
          (order.status === "draft" || order.status === "cancelled") &&
          Boolean(onDelete);
        const canEdit =
          canOpenDetail &&
          fieldAccess.update &&
          order.mutationAuthority !== "canonical_v1";
        const canPrintSlip = fieldAccess.contact && Boolean(onPrintSlip);
        // WhatsApp confirmation deep link — contact-gated, financials decide
        // whether the COD amount rides along in the prefilled message.
        const waPhone = fieldAccess.contact
          ? (order.customer?.phone ?? order.phone)
          : null;
        const waLink = waPhone
          ? buildWhatsAppLink(
              waPhone,
              buildOrderWhatsAppMessage(locale, {
                name: order.customer?.name ?? null,
                fallbackName: t("orders.customer"),
                orderNumber: order.orderNumber,
                totalLabel:
                  fieldAccess.financials && order.totalPrice != null
                    ? formatDZD(order.totalPrice, locale)
                    : null,
              }),
            )
          : null;
        if (!canOpenDetail && !canDelete && !waLink && !canPrintSlip) {
          return <span className="text-muted-foreground">—</span>;
        }
        return (
          <div className="flex items-center justify-end gap-1">
            {waLink ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="size-8 text-success hover:text-success"
                    asChild
                  >
                    <a
                      href={waLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-no-row-click
                      aria-label={t("orders.whatsapp.confirm")}
                      data-testid="orders-row-whatsapp"
                    >
                      <MessageCircle className="size-4" aria-hidden="true" />
                    </a>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("orders.whatsapp.confirm")}</TooltipContent>
              </Tooltip>
            ) : null}
            {canOpenDetail || canDelete ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" className="size-8">
                    <MoreVertical className="size-4" aria-hidden="true" />
                    <span className="sr-only">{t("orders.actions")}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="shadow-dropdown">
              {canOpenDetail ? (
                <DropdownMenuItem asChild>
                  <Link href={`/orders/${order.id}`}>
                    <Eye className="me-2 size-4" aria-hidden="true" />
                    {t("orders.viewDetails")}
                  </Link>
                </DropdownMenuItem>
              ) : null}
              {canEdit ? (
                <DropdownMenuItem asChild>
                  <Link href={`/orders/${order.id}`}>
                    <Pencil className="me-2 size-4" aria-hidden="true" />
                    {t("orders.edit")}
                  </Link>
                </DropdownMenuItem>
              ) : null}
              {canPrintSlip ? (
                <DropdownMenuItem
                  onClick={() => onPrintSlip?.(order)}
                  data-testid="orders-row-print-slip"
                >
                  <Printer className="me-2 size-4" aria-hidden="true" />
                  {t("orders.slip.print")}
                </DropdownMenuItem>
              ) : null}
              {canDelete && onDelete ? (
                <>
                  {(canOpenDetail || canEdit || canPrintSlip) ? (
                    <DropdownMenuSeparator />
                  ) : null}
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => onDelete(order.id)}
                  >
                    <Trash2 className="me-2 size-4" aria-hidden="true" />
                    {t("orders.delete")}
                  </DropdownMenuItem>
                </>
              ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        );
      },
      meta: { align: "end", width: "w-12" },
      enableSorting: false,
    },
  ];

  return columns;
}
