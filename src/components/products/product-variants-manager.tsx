"use client";

/**
 * ProductVariantsManager — inline UI for managing a product's variants.
 *
 * Used inside the ProductFormDialog. Lets the user:
 *   - Add/remove variants
 *   - Edit each variant's name, SKU, price (override), stock, active status
 *   - Reorder variants (sortOrder)
 *
 * If no variants are added, the product gets a single "Default" variant on save
 * (handled by the product service).
 *
 * Pattern: react-hook-form useFieldArray + shadcn v4 inputs.
 */

import { useFieldArray, useFormContext } from "react-hook-form";
import { useI18n } from "@/hooks/use-i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2 } from "lucide-react";

interface ProductVariantsManagerProps {
  /** Disable all inputs (e.g. while submitting) */
  disabled?: boolean;
}

export function ProductVariantsManager({ disabled }: ProductVariantsManagerProps) {
  const { t, locale } = useI18n();
  const { control } = useFormContext();

  const { fields, append, remove } = useFieldArray({
    control,
    name: "variants",
  });

  function addVariant() {
    append({
      name: "",
      sku: "",
      price: null,
      stock: 0,
      isActive: true,
      sortOrder: fields.length,
    });
  }

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm font-medium">
            {t("products.variants")}
          </Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("products.variantsHint")}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addVariant}
          disabled={disabled}
        >
          <Plus className="h-3.5 w-3.5" />
          {t("products.addVariant")}
        </Button>
      </div>

      {fields.length === 0 ? (
        <p className="text-xs text-muted-foreground py-3 text-center">
          {t("products.noVariants")}
        </p>
      ) : (
        <div className="space-y-3">
          {fields.map((field, index) => (
            <div key={field.id} className="space-y-2 rounded-md border bg-muted/30 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  {t("products.variantNumber", { n: index + 1 })}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => remove(index)}
                  disabled={disabled}
                  aria-label={t("common.delete")}
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">{t("products.variantName")}</Label>
                  <Input
                    {...control.register(`variants.${index}.name`)}
                    placeholder={locale === "ar" ? "حجم L" : locale === "fr" ? "Taille L" : "Size L"}
                    disabled={disabled}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">SKU</Label>
                  <Input
                    {...control.register(`variants.${index}.sku`)}
                    placeholder="ELEC-001-L"
                    disabled={disabled}
                    className="h-8 text-sm font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("products.variantPrice")}</Label>
                  <Input
                    type="number"
                    {...control.register(`variants.${index}.price`, { valueAsNumber: true })}
                    placeholder={t("products.variantPriceHint")}
                    disabled={disabled}
                    className="h-8 text-sm tabular-nums"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("products.variantStock")}</Label>
                  <Input
                    type="number"
                    {...control.register(`variants.${index}.stock`, { valueAsNumber: true })}
                    placeholder="0"
                    disabled={disabled}
                    className="h-8 text-sm tabular-nums"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between pt-1">
                <Label className="text-xs flex items-center gap-2">
                  <Switch
                    {...control.register(`variants.${index}.isActive`)}
                    disabled={disabled}
                  />
                  {t("common.active")}
                </Label>
                <input
                  type="hidden"
                  {...control.register(`variants.${index}.sortOrder`)}
                  value={index}
                />
                {field.id && (
                  <input
                    type="hidden"
                    {...control.register(`variants.${index}.id`)}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
