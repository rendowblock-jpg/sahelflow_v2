"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Loader2 } from "lucide-react";

import { useI18n } from "@/hooks/use-i18n";
import {
  createProductSchema,
  productVariantSchema,
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
import {
  ProductImageUpload,
  MAX_PRODUCT_IMAGES,
} from "@/components/products/product-image-upload";
import { ProductVariantsManager } from "./product-variants-manager";

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
  // Override the parent's nullable/optional images field with a required
  // string[] — the form always has a concrete list (possibly empty) so the
  // upload component can be a controlled input.
  images: z.array(nonEmptyString),
  isActive: z.boolean(),
  // Variants: required array (empty if no variants) — ensures type stability
  // for react-hook-form's Control inference.
  variants: z.array(productVariantSchema).default([]),
});

type FormValues = z.input<typeof formSchema>;

/**
 * Shape accepted by ProductFormDialog in edit mode. Nullable fields accept
 * `null` (the domain type stores them nullable) — the dialog normalizes
 * null → "" / 0 for the form inputs.
 */
export interface ProductFormDialogProduct {
  id: string;
  name: string;
  sku?: string | null;
  price: number;
  cost?: number | null;
  stock: number;
  lowStockThreshold: number;
  categoryId?: string | null;
  /** List of image URLs (already uploaded). Stored as a JSON string in DB. */
  images?: string[] | null;
  isActive: boolean;
  /** Product variants (loaded from the ProductVariant relation). */
  productVariants?: Array<{
    id: string;
    name: string;
    sku: string | null;
    price: number | null;
    stock: number;
    isActive: boolean;
    sortOrder: number;
  }>;
}

interface ProductFormDialogProps {
  /** Categories to populate the category <Select>. */
  categories?: Category[];
  /** If provided, the dialog operates in EDIT mode (PATCH). */
  product?: ProductFormDialogProduct;
  /** Custom trigger element (e.g. an edit icon button). Defaults to "Add Product" in uncontrolled mode. */
  trigger?: ReactNode;
  /** Controlled open state. When provided, the dialog is controlled by the parent. */
  open?: boolean;
  /** Called when the dialog requests to open/close (controlled mode). */
  onOpenChange?: (open: boolean) => void;
}

export function ProductFormDialog({
  categories = [],
  product,
  trigger,
  open: openProp,
  onOpenChange,
}: ProductFormDialogProps) {
  const { t } = useI18n();
  const router = useRouter();
  const isEdit = !!product;
  const isControlled = openProp !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const setOpen = isControlled ? (onOpenChange ?? (() => {})) : setInternalOpen;

  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const buildDefaults = (p?: ProductFormDialogProduct): FormValues => ({
    name: p?.name ?? "",
    sku: p?.sku ?? "",
    price: p?.price ?? "",
    cost: p?.cost ?? "",
    stock: p?.stock ?? 0,
    lowStockThreshold: p?.lowStockThreshold ?? 5,
    categoryId: p?.categoryId ?? "",
    images: p?.images ?? [],
    isActive: p?.isActive ?? true,
    variants: (p?.productVariants ?? []).map((v) => ({
      id: v.id,
      name: v.name,
      sku: v.sku,
      price: v.price,
      stock: v.stock,
      isActive: v.isActive,
      sortOrder: v.sortOrder,
    })),
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: buildDefaults(product),
  });

  // Keep the form in sync if the `product` prop changes after a server
  // refresh (e.g. another agent edited the row, or we just saved).
  useEffect(() => {
    if (product) {
      form.reset(buildDefaults(product));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product]);

  async function onSubmit(values: FormValues) {
    setServerError(null);
    setSubmitting(true);

    // Normalize form values: strip empty strings → undefined so the API's
    // Zod schema (which expects null/undefined for optional fields, not "")
    // accepts the payload. Numeric fields that are "" become undefined and
    // rely on the schema's `.default()` values where applicable.
    //
    // For `images`: always send the array (even when empty) so PATCH can
    // clear existing images when the user removes all of them. The service
    // layer JSON-stringifies the array before persisting.
    const payload: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(values)) {
      if (v === "") {
        payload[k] = undefined;
      } else if (k === "images" && Array.isArray(v) && v.length === 0) {
        // Send an empty array rather than `undefined` so PATCH explicitly
        // clears the column (sending undefined would leave it untouched).
        payload[k] = [];
      } else {
        payload[k] = v;
      }
    }

    try {
      const url = product ? `/api/products/${product.id}` : "/api/products";
      const method = product ? "PATCH" : "POST";
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
          setServerError(
            first ? `${first.path.join(".")}: ${first.message}` : t("common.validationFailed"),
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
      form.reset(buildDefaults(product));
      setServerError(null);
    }
  }

  const formId = isEdit ? "product-edit-form" : "product-create-form";

  const triggerNode = trigger ?? (isControlled ? null : (
    <Button>
      <Plus className="h-4 w-4" />
      {t("products.addProduct")}
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
            {isEdit ? t("products.editProduct") : t("products.newProduct")}
          </DialogTitle>
          <DialogDescription>
            {isEdit ? t("products.editProductDesc") : t("products.noProductsDesc")}
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

            <FormField
              control={form.control}
              name="images"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("products.images")}</FormLabel>
                  <FormControl>
                    <ProductImageUpload
                      value={field.value}
                      onChange={field.onChange}
                      maxImages={MAX_PRODUCT_IMAGES}
                      disabled={submitting}
                    />
                  </FormControl>
                  <FormDescription>
                    {t("products.imagesHint", {
                      count: MAX_PRODUCT_IMAGES,
                    })}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <ProductVariantsManager disabled={submitting} />

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
