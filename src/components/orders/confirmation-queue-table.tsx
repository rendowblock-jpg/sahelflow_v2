"use client";

import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Phone } from "lucide-react";

import { DataTable } from "@/components/data-table/data-table";
import { OrderStatusActions } from "@/components/orders/order-status-actions";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { StateSurface } from "@/components/shared/state-surface";
import { Button } from "@/components/ui/button";
import { useConfirmationQueue } from "@/hooks/swr/use-confirmation-queue";
import { useI18n } from "@/hooks/use-i18n";
import { formatDZD } from "@/lib/utils";
import type {
  ConfirmationQueueItem,
  ConfirmationQueueResponse,
} from "@/types/workbench";

interface ConfirmationQueueTableProps {
  fallback: ConfirmationQueueResponse;
  locale: "ar" | "fr" | "en";
}

export function ConfirmationQueueTable({
  fallback,
  locale,
}: ConfirmationQueueTableProps) {
  const { t } = useI18n();
  const router = useRouter();
  const { data, error, isLoading, pagination } = useConfirmationQueue({ fallback });
  const access = data?.fieldAccess ?? fallback.fieldAccess;

  const columns: ColumnDef<ConfirmationQueueItem, unknown>[] = [
    {
      accessorKey: "orderNumber",
      header: () => t("confirmationQueue.col.order"),
      cell: ({ row }) => (
        <Link
          href={`/orders/${row.original.id}`}
          className="font-mono text-sm font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          data-order-number
        >
          {row.original.orderNumber}
        </Link>
      ),
      enableSorting: false,
    },
    ...(access.contact
      ? [
          {
            accessorKey: "customerName",
            header: () => t("confirmationQueue.col.customer"),
            cell: ({ row }: { row: { original: ConfirmationQueueItem } }) => (
              <span className="block max-w-44 truncate text-sm">
                {row.original.customerName ?? "—"}
              </span>
            ),
            enableSorting: false,
          } satisfies ColumnDef<ConfirmationQueueItem, unknown>,
          {
            accessorKey: "phone",
            header: () => t("confirmationQueue.col.phone"),
            cell: ({ row }: { row: { original: ConfirmationQueueItem } }) =>
              row.original.phone ? (
                <a
                  href={`tel:${row.original.phone}`}
                  dir="ltr"
                  className="inline-flex items-center gap-1 font-mono text-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                  data-no-row-click
                >
                  <Phone className="size-3 text-muted-foreground" aria-hidden="true" />
                  {row.original.phone}
                </a>
              ) : (
                "—"
              ),
            meta: { hideOn: "sm" as const },
            enableSorting: false,
          } satisfies ColumnDef<ConfirmationQueueItem, unknown>,
          {
            accessorKey: "wilaya",
            header: () => t("confirmationQueue.col.wilaya"),
            cell: ({ row }: { row: { original: ConfirmationQueueItem } }) => (
              <span className="text-sm">{row.original.wilaya ?? "—"}</span>
            ),
            meta: { hideOn: "md" as const },
            enableSorting: false,
          } satisfies ColumnDef<ConfirmationQueueItem, unknown>,
        ]
      : []),
    ...(access.financials
      ? [
          {
            accessorKey: "totalPrice",
            header: () => t("confirmationQueue.col.total"),
            cell: ({ row }: { row: { original: ConfirmationQueueItem } }) => (
              <span className="font-medium tabular-nums" data-money>
                {row.original.totalPrice == null
                  ? "—"
                  : formatDZD(row.original.totalPrice, locale)}
              </span>
            ),
            meta: { align: "end" as const },
            enableSorting: false,
          } satisfies ColumnDef<ConfirmationQueueItem, unknown>,
        ]
      : []),
    {
      accessorKey: "ageMinutes",
      header: () => t("confirmationQueue.col.age"),
      cell: ({ row }) => (
        <span
          className={
            row.original.isStale
              ? "inline-flex items-center gap-1 font-medium text-warning"
              : "text-sm text-muted-foreground"
          }
        >
          {row.original.isStale ? (
            <AlertTriangle className="size-3" aria-hidden="true" />
          ) : null}
          {row.original.ageLabel}
        </span>
      ),
      enableSorting: false,
    },
    {
      id: "status",
      header: () => t("confirmationQueue.col.status"),
      cell: ({ row }) => (
        <OrderStatusBadge
          orderId={row.original.id}
          status="pending"
          size="sm"
          disabled={
            !row.original.canUpdate ||
            row.original.mutationAuthority !== "legacy_compatibility"
          }
        />
      ),
      enableSorting: false,
    },
    {
      id: "action",
      header: () => t("confirmationQueue.col.action"),
      cell: ({ row }) => {
        const order = row.original;
        if (!order.canUpdate) return null;
        return order.mutationAuthority === "legacy_compatibility" ? (
          <Button size="sm" variant="outline" asChild>
            <Link href={`/orders/${order.id}`}>{t("confirmationQueue.confirm")}</Link>
          </Button>
        ) : (
          <OrderStatusActions
            orderId={order.id}
            currentStatus="pending"
            currentVersion={order.version}
            mutationAuthority={order.mutationAuthority}
          />
        );
      },
      meta: { align: "end", width: "w-20" },
      enableSorting: false,
    },
  ];

  if (error && !data) {
    return (
      <StateSurface
        icon={AlertTriangle}
        title={t("error.requestFailed")}
        description={error.message}
        tone="danger"
        size="inline"
        role="alert"
      />
    );
  }

  return (
    <DataTable
      columns={columns}
      data={data?.queue ?? []}
      isLoading={isLoading}
      pagination={pagination}
      showDensityToggle
      getRowId={(row) => row.id}
      onRowClick={(row) => router.push(`/orders/${row.id}`)}
      emptyState={
        <StateSurface
          icon={CheckCircle2}
          title={t("confirmationQueue.allCaughtUp")}
          description={t("confirmationQueue.noPending")}
          tone="success"
          size="inline"
        />
      }
    />
  );
}
