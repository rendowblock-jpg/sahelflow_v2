"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
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

export function CustomerFormDialog() {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      phone: "",
      phone2: "",
      wilaya: "",
      commune: "",
      address: "",
      notes: "",
    },
  });

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
      const res = await fetch("/api/customers", {
        method: "POST",
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
          setServerError(first ? `${first.path.join(".")}: ${first.message}` : "Validation failed");
        } else {
          setServerError(data?.error ?? `Request failed (${res.status})`);
        }
        return;
      }

      // Success: close + reset + refresh server-component data
      form.reset();
      setOpen(false);
      router.refresh();
    } catch (err) {
      console.error("[CustomerFormDialog] submit error:", err);
      setServerError("Network error — please try again");
    } finally {
      setSubmitting(false);
    }
  }

  function handleOpenChange(next: boolean) {
    if (!next && submitting) return; // don't allow closing mid-submit
    setOpen(next);
    if (!next) {
      form.reset();
      setServerError(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" />
          {t("common.create")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("customers.title")}</DialogTitle>
          <DialogDescription>{t("customers.noCustomersDesc")}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            id="customer-create-form"
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

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="wilaya"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("publicForm.wilaya")}</FormLabel>
                    <FormControl>
                      <Input placeholder="Alger" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="commune"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("publicForm.commune")}</FormLabel>
                    <FormControl>
                      <Input placeholder="Bab Ezzouar" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

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
            form="customer-create-form"
            disabled={submitting}
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
