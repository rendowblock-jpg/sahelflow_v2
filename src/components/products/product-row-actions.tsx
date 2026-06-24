"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { useI18n } from "@/hooks/use-i18n";
import { RowActions } from "@/components/shared/row-actions";
import { ProductFormDialog } from "@/components/products/product-form-dialog";
import type { ProductFormDialogProduct } from "@/components/products/product-form-dialog";
import type { Category } from "@/types/domain";
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

interface ProductRowActionsProps {
  product: ProductFormDialogProduct;
  /** Categories to populate the edit dialog's category <Select>. */
  categories?: Category[];
}

/**
 * Client-side per-row actions for the Products table.
 *
 * Renders a presentational RowActions cluster (edit + delete icon buttons).
 * Edit opens a controlled ProductFormDialog in PATCH mode; delete opens an
 * AlertDialog confirmation, then calls DELETE /api/products/[id].
 *
 * This component is the bridge between the server-component list page (which
 * can't hold client state) and the interactive dialogs.
 */
export function ProductRowActions({
  product,
  categories = [],
}: ProductRowActionsProps) {
  const { t } = useI18n();
  const router = useRouter();

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function confirmDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/products/${product.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(data?.error ?? `Request failed (${res.status})`);
      }
      toast.success(t("products.productDeleted"));
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
        editLabel={t("products.edit")}
        deleteLabel={t("products.delete")}
      />

      {/* Edit dialog (controlled — opened via the RowActions edit callback) */}
      <ProductFormDialog
        product={product}
        categories={categories}
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
            <AlertDialogTitle>{t("products.confirmDelete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("products.deleteWarning")}
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
              {t("products.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
