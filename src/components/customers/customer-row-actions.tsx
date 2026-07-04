"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useUndoableDelete } from "@/hooks/use-undoable-delete";
import { mutatePrefix } from "@/lib/swr/mutate";

import { useI18n } from "@/hooks/use-i18n";
import { RowActions } from "@/components/shared/row-actions";
import { CustomerFormDialog } from "@/components/customers/customer-form-dialog";
import type { CustomerFormDialogCustomer } from "@/components/customers/customer-form-dialog";
import { BlacklistToggle } from "@/components/customers/blacklist-toggle";
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

interface CustomerRowActionsProps {
  customer: CustomerFormDialogCustomer;
}

/**
 * Client-side per-row actions for the Customers table.
 *
 * Renders a presentational RowActions cluster (edit + delete icon buttons).
 * Edit opens a controlled CustomerFormDialog in PATCH mode; delete opens an
 * AlertDialog confirmation, then calls DELETE /api/customers/[id].
 *
 * This component is the bridge between the server-component list page (which
 * can't hold client state) and the interactive dialogs.
 */
export function CustomerRowActions({ customer }: CustomerRowActionsProps) {
  const { t } = useI18n();

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const deleteCustomer = useUndoableDelete({
    deleteUrl: (id) => `/api/customers/${id}`,
    restoreUrl: (id) => `/api/customers/${id}/restore`,
    entityLabel: t("customers.customer") || "Customer",
    onAfter: () => mutatePrefix("/api/customers"),
  });

  async function confirmDelete() {
    setDeleting(true);
    try {
      setDeleteOpen(false);
      await deleteCustomer(customer.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <BlacklistToggle
        customerId={customer.id}
        isBlacklisted={customer.isBlacklisted ?? false}
        variant="icon"
      />
      <RowActions
        onEdit={() => setEditOpen(true)}
        onDelete={() => setDeleteOpen(true)}
        editLabel={t("customers.edit")}
        deleteLabel={t("customers.delete")}
      />

      {/* Edit dialog (controlled — opened via the RowActions edit callback) */}
      <CustomerFormDialog
        customer={customer}
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
            <AlertDialogTitle>{t("customers.confirmDelete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("customers.deleteWarning")}
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
              {t("customers.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
