"use client";

import { useEffect, useState, type ReactNode } from "react";
import { mutatePrefix } from "@/lib/swr/mutate";
import { useForm } from "react-hook-form";
import { useDirtyGuard } from "@/hooks/form/use-dirty-guard";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Plus } from "lucide-react";
import { toast } from "@/lib/toast";
import { translateServerError } from "@/lib/i18n/translate-server-error";

import { useI18n } from "@/hooks/use-i18n";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// itemCount is a string in the form (number inputs produce strings) and
// converted to a number on submit. Using a string here keeps the zod input
// and output types aligned, which react-hook-form's Resolver requires.
const formSchema = z.object({
  orderId: z.string().min(1),
  reason: z.string().min(1).max(2000),
  itemCount: z
    .string()
    .min(1)
    .refine((v) => /^\d+$/.test(v) && Number(v) >= 1, "At least 1"),
});

type FormValues = z.infer<typeof formSchema>;

interface DeliveredOrder {
  id: string;
  orderNumber: string;
  mutationAuthority?:
    | "canonical_v1"
    | "confirmation_blocked"
    | "legacy_compatibility";
}

interface ReturnFormDialogProps {
  /** Custom trigger element. Defaults to a "Create return" button in uncontrolled mode. */
  trigger?: ReactNode;
  /** Controlled open state. */
  open?: boolean;
  /** Called when the dialog requests to open/close (controlled mode). */
  onOpenChange?: (open: boolean) => void;
}

/**
 * ReturnFormDialog — client dialog for creating a return / exchange request.
 *
 * Loads delivered orders into a Select, collects a reason + item count, and
 * POSTs to /api/returns. On success it shows a toast, closes, and refreshes
 * the server-component list. Mirrors the CustomerFormDialog pattern.
 */
export function ReturnFormDialog({
  trigger,
  open: openProp,
  onOpenChange,
}: ReturnFormDialogProps) {
  const { t } = useI18n();
  const isControlled = openProp !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const setOpen = isControlled ? (onOpenChange ?? (() => {})) : setInternalOpen;

  const [orders, setOrders] = useState<DeliveredOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { orderId: "", reason: "", itemCount: "1" },
  });
  useDirtyGuard(form);

  // Fetch delivered orders when the dialog opens (so the dropdown is fresh).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate: set loading before async fetch
    setLoadingOrders(true);
    fetch("/api/orders?status=delivered&pageSize=100")
      .then((r) => r.json())
      .then((data: { orders?: DeliveredOrder[] }) => {
        if (!cancelled) {
          setOrders(
            (data.orders ?? []).filter(
              (order) => order.mutationAuthority !== "canonical_v1",
            ),
          );
        }
      })
      .catch(() => {
        if (!cancelled) setOrders([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingOrders(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    try {
      const res = await fetch("/api/returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: values.orderId,
          reason: values.reason,
          itemCount: Number(values.itemCount),
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string; details?: unknown }
          | null;
        const msg = translateServerError(data?.error, t, t("error.requestFailed"));
        toast.error(msg);
        return;
      }

      toast.success(t("returns.returnCreated"));
      form.reset({ orderId: "", reason: "", itemCount: "1" });
      setOpen(false);
      mutatePrefix("/api/returns");
    } catch {
      toast.error(t("common.error"));
    } finally {
      setSubmitting(false);
    }
  }

  function handleOpenChange(next: boolean) {
    if (!next && submitting) return; // don't allow closing mid-submit
    setOpen(next);
    if (!next) {
      form.reset({ orderId: "", reason: "", itemCount: "1" });
    }
  }

  const triggerNode = trigger ?? (isControlled ? null : (
    <Button>
      <Plus className="h-4 w-4" />
      {t("returns.createReturn")}
    </Button>
  ));

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {triggerNode && <DialogTrigger asChild>{triggerNode}</DialogTrigger>}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("returns.createReturn")}</DialogTitle>
          <DialogDescription>{t("returns.createDesc")}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            id="return-create-form"
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="orderId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("returns.selectOrder")}</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={loadingOrders || submitting}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            loadingOrders ? "…" : t("returns.selectOrder")
                          }
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {orders.length === 0 && !loadingOrders ? (
                        <SelectItem value="__none" disabled>
                          —
                        </SelectItem>
                      ) : (
                        orders.map((o) => (
                          <SelectItem key={o.id} value={o.id}>
                            #{o.orderNumber}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("returns.reason")}</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={t("returns.reasonPlaceholder")}
                      rows={4}
                      disabled={submitting}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="itemCount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("returns.itemCount")}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      inputMode="numeric"
                      disabled={submitting}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={submitting}
          >
            {t("common.cancel")}
          </Button>
          <Button type="submit" form="return-create-form" disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("returns.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
