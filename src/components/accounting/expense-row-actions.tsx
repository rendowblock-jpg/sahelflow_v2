"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { useI18n } from "@/hooks/use-i18n";
import { RowActions } from "@/components/shared/row-actions";
import { ExpenseFormDialog } from "@/components/accounting/expense-form-dialog";
import type { ExpenseFormDialogExpense } from "@/components/accounting/expense-form-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ExpenseRowActionsProps {
  expense: ExpenseFormDialogExpense;
}

/**
 * Client-side per-row actions for the Expenses table on the accounting page.
 *
 * Mirrors CustomerRowActions: a presentational RowActions cluster (edit +
 * delete icon buttons). Edit opens a controlled ExpenseFormDialog in PATCH
 * mode; delete opens an AlertDialog confirmation, then calls
 * DELETE /api/expenses/[id].
 *
 * This component bridges the server-component accounting page (which can't
 * hold client state) and the interactive dialogs.
 */
export function ExpenseRowActions({ expense }: ExpenseRowActionsProps) {
  const { t } = useI18n();
  const router = useRouter();

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function confirmDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/expenses/${expense.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(data?.error ?? `Request failed (${res.status})`);
      }
      toast.success(t("accounting.expenseDeleted"));
      setDeleteOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <RowActions
        onEdit={() => setEditOpen(true)}
        onDelete={() => setDeleteOpen(true)}
        editLabel={t("accounting.editExpense")}
        deleteLabel={t("common.delete")}
      />

      {/* Edit dialog (controlled — opened via the RowActions edit callback) */}
      <ExpenseFormDialog
        expense={expense}
        open={editOpen}
        onOpenChange={setEditOpen}
      />

      {/* Delete confirmation */}
      <AlertDialog
        open={deleteOpen}
        onOpenChange={(o) => {
          if (deleting) return;
          setDeleteOpen(o);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("accounting.confirmDeleteExpense")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("accounting.deleteExpenseWarning")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
