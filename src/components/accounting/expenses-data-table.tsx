"use client";

import { AlertTriangle } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";

import { ExpenseRowActions } from "@/components/accounting/expense-row-actions";
import { DataTable } from "@/components/data-table/data-table";
import { StateSurface } from "@/components/shared/state-surface";
import { useExpenses } from "@/hooks/swr/use-expenses";
import { useI18n } from "@/hooks/use-i18n";
import type { Locale } from "@/lib/i18n";
import { formatDZD, formatDate } from "@/lib/utils";
import type { ExpenseCategory } from "@/lib/validation";
import type {
  ExpenseWorkbenchItem,
  ExpensesWorkbenchResponse,
} from "@/types/workbench";

export function ExpensesDataTable({
  fallback,
  locale,
}: {
  fallback: ExpensesWorkbenchResponse;
  locale: Locale;
}) {
  const { t } = useI18n();
  const { data, error, isLoading, pagination } = useExpenses({ fallback });
  const response = data ?? fallback;
  const columns: ColumnDef<ExpenseWorkbenchItem, unknown>[] = [
    {
      accessorKey: "date",
      header: () => t("accounting.expenseDate"),
      enableSorting: false,
      cell: ({ row }) => <span className="text-muted-foreground">{formatDate(row.original.date, locale)}</span>,
    },
    {
      accessorKey: "category",
      header: () => t("accounting.expenseCategory"),
      enableSorting: false,
      cell: ({ row }) => <span className="font-medium">{t(`accounting.category.${row.original.category}`)}</span>,
    },
    {
      accessorKey: "amount",
      header: () => t("accounting.expenseAmount"),
      enableSorting: false,
      cell: ({ row }) => <span className="font-medium tabular-nums">−{formatDZD(row.original.amount, locale)}</span>,
      meta: { align: "end" },
    },
    {
      accessorKey: "notes",
      header: () => t("accounting.expenseNotes"),
      enableSorting: false,
      cell: ({ row }) => <span className="block max-w-xs truncate text-muted-foreground">{row.original.notes ?? "—"}</span>,
      meta: { hideOn: "md" },
    },
    ...(response.fieldAccess.update
      ? [
          {
            id: "actions",
            header: () => t("common.actions"),
            enableSorting: false,
            cell: ({ row }: { row: { original: ExpenseWorkbenchItem } }) => (
              <ExpenseRowActions
                expense={{
                  id: row.original.id,
                  category: row.original.category as ExpenseCategory,
                  amount: row.original.amount,
                  date: new Date(row.original.date).toISOString(),
                  notes: row.original.notes,
                }}
              />
            ),
            meta: { align: "end" as const, width: "w-20" },
          } satisfies ColumnDef<ExpenseWorkbenchItem, unknown>,
        ]
      : []),
  ];
  if (error && !data) {
    return <StateSurface icon={AlertTriangle} title={t("error.requestFailed")} description={error.message} tone="danger" size="inline" role="alert" />;
  }
  return (
    <DataTable
      columns={columns}
      data={response.expenses}
      isLoading={isLoading}
      pagination={pagination}
      getRowId={(row) => row.id}
      emptyState={<span className="text-sm text-muted-foreground">{t("accounting.noExpenses")}</span>}
    />
  );
}
