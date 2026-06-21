"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Loader2 } from "lucide-react";

import { useI18n } from "@/hooks/use-i18n";
import {
  createProductSchema,
  nonEmptyString,
  nonNegInt,
  cuid,
} from "@/lib/validation";
import type { Category } from "@/types/domain";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

/**
 * Client-side form schema — mirrors createProductSchema but:
 *  - Allows empty strings for optional fields (sku, cost, categoryId) so users
 *    can leave them blank. Empty strings are stripped to `undefined` before
 *    posting to the API.
 *  - Numeric fields (price, cost, stock, lowStockThreshold) accept either a
 *    number or "" (empty input). Empty strings are normalized to `undefined`
 *    in onSubmit so the API's Zod schema (which has `.default(0)` / `.default(5)`
 *    for stock/threshold) applies its defaults.
 */
const formSchema = createProductSchema.extend({
  sku: z.union([nonEmptyString, z.literal("")]).optional(),
  price: z.union([nonNegInt, z.literal("")]),
  cost: z.union([nonNegInt, z.literal("")]).optional(),
  stock: z.union([z.number().int(), z.literal("")]).optional(),
  lowStockThreshold: z.union([nonNegInt, z.literal("")]).optional(),
  categoryId: z.union([cuid, z.literal("")]).optional(),
  isActive: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

interface ProductFormDialogProps {
  /** Categories to populate the category <Select>. */
  categories?: Category[];
}

export function ProductFormDialog({ categories = [] }: ProductFormDialogProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      sku: "",
      price: "",
      cost: "",
      stock: 0,
      lowStockThreshold: 5,
      categoryId: "",
      isActive: true,
    },
  });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    setSubmitting(true);

    // Normalize form values: strip empty strings → undefined so the API's
    // Zod schema (which expects null/undefined for optional fields, not "")
    // accepts the payload. Numeric fields that are "" become undefined and
    // rely on the schema's `.default()` values where applicable.
    const payload: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(values)) {
      payload[k] = v === "" ? undefined : v;
    }

    try {
      const res = await fetch("/api/products", {
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
          setServerError(
            first ? `${first.path.join(".")}: ${first.message}` : "Validation failed",
          );
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
      console.error("[ProductFormDialog] submit error:", err);
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
          {t("products.addProduct")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("products.newProduct")}</DialogTitle>
          <DialogDescription>{t("products.noProductsDesc")}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            id="product-create-form"
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-3"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("products.productName")}</FormLabel>
                  <FormControl>
                    <Input placeholder="T-shirt Cotton Bio" autoComplete="off" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="sku"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("products.sku")}</FormLabel>
                  <FormControl>
                    <Input placeholder="TSH-001" autoComplete="off" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="categoryId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("common.category")}</FormLabel>
                  <Select
                    value={field.value ?? ""}
                    onValueChange={field.onChange}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={t("products.noCategory")} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="">{t("products.noCategory")}</SelectItem>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("orders.price")}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        inputMode="numeric"
                        placeholder="1500"
                        value={field.value ?? ""}
                        onChange={(e) =>
                          field.onChange(
                            e.target.value === "" ? "" : Number(e.target.value),
                          )
                        }
                      />
                    </FormControl>
                    <FormDescription>{t("common.currency")}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="cost"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("products.cost")}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        inputMode="numeric"
                        placeholder="900"
                        value={field.value ?? ""}
                        onChange={(e) =>
                          field.onChange(
                            e.target.value === "" ? "" : Number(e.target.value),
                          )
                        }
                      />
                    </FormControl>
                    <FormDescription>{t("common.currency")}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="stock"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("products.stock")}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="1"
                        inputMode="numeric"
                        placeholder="0"
                        value={field.value ?? ""}
                        onChange={(e) =>
                          field.onChange(
                            e.target.value === "" ? "" : Number(e.target.value),
                          )
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="lowStockThreshold"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("products.lowStock")}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        inputMode="numeric"
                        placeholder="5"
                        value={field.value ?? ""}
                        onChange={(e) =>
                          field.onChange(
                            e.target.value === "" ? "" : Number(e.target.value),
                          )
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>{t("common.status")}</FormLabel>
                    <FormDescription>
                      {field.value ? t("common.active") : t("common.inactive")}
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
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
            form="product-create-form"
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
