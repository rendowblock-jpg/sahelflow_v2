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
import { toast } from "@/lib/toast";
import { useI18n } from "@/hooks/use-i18n";

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

  const handleDelete = async () => {
    setPending(true);
    try {
      const res = await fetch(`/api/orders/${orderId}`, { method: "DELETE" });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error ?? t("common.deleteFailed"));

      toast.success(t("orders.orderDeleted"));
      router.push("/orders");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.deleteFailed"));
    } finally {
      setPending(false);
      setOpen(false);
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
            onClick={handleDelete}
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
