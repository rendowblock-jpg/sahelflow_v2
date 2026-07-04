"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { mutatePrefix } from "@/lib/swr/mutate";
import { useForm, useWatch } from "react-hook-form";
import { useDirtyGuard } from "@/hooks/form/use-dirty-guard";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Loader2 } from "lucide-react";

import { useI18n } from "@/hooks/use-i18n";
import {
  createCustomerSchema,
  dzPhone,
  nonEmptyString,
} from "@/lib/validation";
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { WilayaCommuneSelect } from "@/components/shared/wilaya-commune-select";

/**
 * Client-side form schema — mirrors createCustomerSchema but allows empty
 * strings (so users can leave optional fields blank). Empty strings are
 * stripped to `undefined` before posting to the API.
 */
const formSchema = createCustomerSchema.extend({
  phone2: z.union([dzPhone, z.literal("")]).optional(),
  wilaya: z.union([nonEmptyString, z.literal("")]).optional(),
  commune: z.union([nonEmptyString, z.literal("")]).optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

/**
 * Shape accepted by CustomerFormDialog in edit mode. Optional fields accept
 * `null` (the domain type stores them nullable) — the dialog normalizes
 * null → "" for the form inputs.
 */
export interface CustomerFormDialogCustomer {
  id: string;
  name: string;
  phone: string;
  phone2?: string | null;
  wilaya?: string | null;
  commune?: string | null;
  address?: string | null;
  notes?: string | null;
  isBlacklisted?: boolean;
}

interface CustomerFormDialogProps {
  /** If provided, the dialog operates in EDIT mode (PATCH). */
  customer?: CustomerFormDialogCustomer;
  /** Custom trigger element (e.g. an edit icon button). Defaults to "Add Customer" in uncontrolled mode. */
  trigger?: ReactNode;
  /** Controlled open state. When provided, the dialog is controlled by the parent (no default trigger is rendered unless `trigger` is also given). */
  open?: boolean;
  /** Called when the dialog requests to open/close (controlled mode). */
  onOpenChange?: (open: boolean) => void;
}

export function CustomerFormDialog({
  customer,
  trigger,
  open: openProp,
  onOpenChange,
}: CustomerFormDialogProps) {
  const { t } = useI18n();
  const isEdit = !!customer;
  const isControlled = openProp !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const setOpen = isControlled ? (onOpenChange ?? (() => {})) : setInternalOpen;

  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const buildDefaults = (c?: CustomerFormDialogCustomer): FormValues => ({
    name: c?.name ?? "",
    phone: c?.phone ?? "",
    phone2: c?.phone2 ?? "",
    wilaya: c?.wilaya ?? "",
    commune: c?.commune ?? "",
    address: c?.address ?? "",
    notes: c?.notes ?? "",
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: buildDefaults(customer),
  });
  useDirtyGuard(form);

  // Subscribe to wilaya/commune changes without re-rendering the whole form on every keystroke.
  const watchedWilaya = useWatch({ control: form.control, name: "wilaya" });
  const watchedCommune = useWatch({ control: form.control, name: "commune" });

  // Keep the form in sync if the `customer` prop changes after a server
  // refresh (e.g. another agent edited the row, or we just saved).
  useEffect(() => {
    if (customer) {
      form.reset(buildDefaults(customer));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer]);

  async function onSubmit(values: FormValues) {
    setServerError(null);
    setSubmitting(true);

    // Strip empty strings → undefined so the API's Zod schema (which expects
    // null/undefined for optional fields, not "") accepts the payload.
    const payload: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(values)) {
      payload[k] = v === "" ? undefined : v;
    }

    try {
      const url = customer ? `/api/customers/${customer.id}` : "/api/customers";
      const method = customer ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string; details?: unknown }
          | null;
        if (data?.details) {
          // Zod validation error from the server — surface the first issue
          const issues = data.details as { message: string; path: string[] }[];
          const first = issues[0];
          setServerError(first ? `${first.path.join(".")}: ${first.message}` : t("common.validationFailed"));
        } else {
          setServerError(data?.error ?? `Request failed (${res.status})`);
        }
        return;
      }

      // Success: close + reset + refresh server-component data
      form.reset();
      setOpen(false);
      mutatePrefix("/api/customers");
    } catch (err) {
      console.error("[CustomerFormDialog] submit error:", err);
      setServerError(t("error.networkFailure"));
    } finally {
      setSubmitting(false);
    }
  }

  function handleOpenChange(next: boolean) {
    if (!next && submitting) return; // don't allow closing mid-submit
    setOpen(next);
    if (!next) {
      form.reset(buildDefaults(customer));
      setServerError(null);
    }
  }

  const formId = isEdit ? "customer-edit-form" : "customer-create-form";

  // In controlled mode without an explicit trigger, no trigger is rendered —
  // the parent opens the dialog via `open`. In uncontrolled mode, fall back
  // to the default "Add Customer" button when no trigger is supplied.
  const triggerNode = trigger ?? (isControlled ? null : (
    <Button>
      <Plus className="h-4 w-4" />
      {t("common.create")}
    </Button>
  ));

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {triggerNode && (
        <DialogTrigger asChild>{triggerNode}</DialogTrigger>
      )}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t("customers.editCustomer") : t("customers.title")}
          </DialogTitle>
          <DialogDescription>
            {isEdit ? t("customers.editCustomerDesc") : t("customers.noCustomersDesc")}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            id={formId}
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-3"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("customers.name")}</FormLabel>
                  <FormControl>
                    <Input placeholder="Ahmed Benali" autoComplete="name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("customers.phone")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="0555 000 000"
                      inputMode="tel"
                      autoComplete="tel"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    {t("publicForm.phoneInvalid")}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="phone2"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("customers.phone")} 2</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="0660 000 000"
                      inputMode="tel"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <WilayaCommuneSelect
              wilaya={watchedWilaya ?? ""}
              commune={watchedCommune ?? ""}
              onWilayaChange={(v) => form.setValue("wilaya", v, { shouldValidate: true })}
              onCommuneChange={(v) => form.setValue("commune", v, { shouldValidate: true })}
              wilayaLabel={t("publicForm.wilaya")}
              communeLabel={t("publicForm.commune")}
            />

            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("customers.address")}</FormLabel>
                  <FormControl>
                    <Input placeholder={t("publicForm.addressPlaceholder")} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("publicForm.notes")}</FormLabel>
                  <FormControl>
                    <Input placeholder={t("publicForm.notesPlaceholder")} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {serverError && (
              <p className="text-sm text-destructive" role="alert">
                {serverError}
              </p>
            )}
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
          <Button
            type="submit"
            form={formId}
            disabled={submitting}
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEdit ? t("common.saveChanges") : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
