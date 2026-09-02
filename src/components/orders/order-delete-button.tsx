"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { mutatePrefix } from "@/lib/swr/mutate";
import { useI18n } from "@/hooks/use-i18n";
import { useUndoableDelete } from "@/hooks/use-undoable-delete";

interface OrderDeleteButtonProps {
  orderId: string;
  orderStatus: string;
}

export function OrderDeleteButton({ orderId, orderStatus }: OrderDeleteButtonProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [open, setOpen] = useState(false);

  const canDelete = ["draft", "cancelled"].includes(orderStatus);

  // Same contract as the orders list (orders-data-table.tsx): the endpoint is a
  // SOFT delete, so the dialog warns once and the undo toast does the mercy
  // pass — the copy no longer claims the delete is permanent.
  const deleteOrder = useUndoableDelete({
    deleteUrl: (id) => `/api/orders/${id}`,
    restoreUrl: (id) => `/api/orders/${id}/restore`,
    entityLabel: t("orders.workspace.entity"),
    contextualLabel: (record) => {
      const order = record as { orderNumber?: string };
      return order.orderNumber
        ? t("orders.workspace.entityNumber", { number: order.orderNumber })
        : t("orders.workspace.entity");
    },
    onAfter: () => mutatePrefix("/api/orders"),
    onSuccess: () => {
      setOpen(false);
      router.push("/orders");
      router.refresh();
    },
  });

  const handleDelete = async () => {
    setPending(true);
    try {
      // useUndoableDelete never throws — failures surface as a translated
      // toast and the dialog stays open; success closes it via onSuccess.
      await deleteOrder(orderId);
    } finally {
      setPending(false);
    }
  };

  if (!canDelete) {
    return (
      <Button variant="outline" size="sm" disabled className="gap-1.5 text-muted-foreground">
        <Trash2 className="h-4 w-4" />
        {t("orders.delete")}
      </Button>
    );
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 text-destructive hover:text-destructive">
          <Trash2 className="h-4 w-4" />
          {t("orders.delete")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("orders.confirmDelete")}</AlertDialogTitle>
          <AlertDialogDescription>{t("orders.deleteWarning")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              // Radix closes the dialog on click by default — keep it open
              // while the delete is in flight so the pending spinner is real.
              event.preventDefault();
              void handleDelete();
            }}
            disabled={pending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {pending ? <Loader2 className="h-4 w-4 me-1 animate-spin" /> : null}
            {t("orders.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
