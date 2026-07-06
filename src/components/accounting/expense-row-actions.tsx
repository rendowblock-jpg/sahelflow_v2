"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { useUndoableDelete } from "@/hooks/use-undoable-delete";
import { mutatePrefix } from "@/lib/swr/mutate";

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

  const deleteExpense = useUndoableDelete({
    deleteUrl: (id) => `/api/expenses/${id}`,
    restoreUrl: (id) => `/api/expenses/${id}/restore`,
    entityLabel: t("accounting.expense"),
    // The accounting page is a Server Component (no SWR). mutatePrefix is a
    // no-op, but router.refresh() revalidates the RSC tree so the deleted
    // row disappears and the stat cards update.
    onAfter: () => {
      void mutatePrefix("/api/expenses");
      router.refresh();
    },
  });

  async function confirmDelete() {
    setDeleting(true);
    try {
      setDeleteOpen(false);
      await deleteExpense(expense.id);
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
