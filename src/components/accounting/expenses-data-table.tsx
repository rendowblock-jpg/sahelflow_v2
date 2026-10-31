"use client";

import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";

import { ExpenseRowActions } from "@/components/accounting/expense-row-actions";
import { DataTable } from "@/components/data-table/data-table";
import { useI18n } from "@/hooks/use-i18n";
import { formatDate, formatDZD } from "@/lib/utils";
import type { ExpenseCategory } from "@/lib/validation";

/** One expense as the page hands it over: plain values, the date as an ISO string. */
export interface ExpenseRowView {
  id: string;
  category: ExpenseCategory;
  amount: number;
  date: string;
  notes: string | null;
}

/** Recent expenses: a table from md up, one card per expense on a phone. */
export function ExpensesDataTable({
  rows,
  canUpdate,
  layout = "auto",
}: {
  rows: ExpenseRowView[];
  canUpdate: boolean;
  layout?: "auto" | "table" | "cards";
}) {
  const { t, locale } = useI18n();
  const columns = useMemo<ColumnDef<ExpenseRowView, unknown>[]>(() => {
    const base: ColumnDef<ExpenseRowView, unknown>[] = [
      {
        id: "date",
        header: t("accounting.expenseDate"),
        cell: ({ row }) => (
          <span className="text-muted-foreground">{formatDate(new Date(row.original.date), locale)}</span>
        ),
        meta: { mobile: { slot: "time" } },
        enableSorting: false,
      },
      {
        id: "category",
        header: t("accounting.expenseCategory"),
        cell: ({ row }) => (
          <span className="font-medium">{t(`accounting.category.${row.original.category}`)}</span>
        ),
        meta: { mobile: { slot: "title" } },
        enableSorting: false,
      },
      {
        id: "amount",
        header: t("accounting.expenseAmount"),
        cell: ({ row }) => (
          // Isolate the signed amount so the minus glyph never marries the surrounding RTL label direction.
          <span dir="ltr" className="font-medium tabular-nums">
            −{formatDZD(row.original.amount, locale)}
          </span>
        ),
        meta: { align: "end", mobile: { slot: "amount" } },
        enableSorting: false,
      },
      {
        id: "notes",
        header: t("accounting.expenseNotes"),
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.notes ?? "—"}</span>,
        meta: { wrap: true, mobile: { slot: "field" } },
        enableSorting: false,
      },
    ];
    if (canUpdate) {
      base.push({
        id: "actions",
        header: t("common.actions"),
        cell: ({ row }) => <ExpenseRowActions expense={row.original} />,
        meta: { align: "end", mobile: { slot: "actions" } },
        enableSorting: false,
      });
    }
    return base;
  }, [canUpdate, locale, t]);

  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(row) => row.id}
      layout={layout}
      label={t("accounting.recentExpenses")}
    />
  );
}
