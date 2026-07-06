"use client";

/**
 * ProductVariantPicker — dropdown to select a product variant.
 *
 * Shows variant name + per-variant stock + price (if override).
 * Used on the product detail page (item 13) and the order form modal (item 4).
 */

import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatDZD } from "@/lib/utils";
import { useI18n } from "@/hooks/use-i18n";

export interface VariantOption {
  id: string;
  name: string;
  sku: string | null;
  price: number | null;
  stock: number;
  isActive: boolean;
}

interface ProductVariantPickerProps {
  variants: VariantOption[];
  /** Default product price (used when variant has no price override) */
  defaultPrice: number;
  /** Called when a variant is selected */
  onChange?: (variantId: string | null) => void;
  /** Selected variant ID */
  value?: string | null;
  /** Show labels above the dropdown */
  showLabel?: boolean;
  /** Required field marker */
  required?: boolean;
  /** Disable the picker */
  disabled?: boolean;
  /** Size variant */
  size?: "default" | "sm";
}

export function ProductVariantPicker({
  variants,
  defaultPrice,
  onChange,
  value,
  showLabel = true,
  required = false,
  disabled = false,
  size = "default",
}: ProductVariantPickerProps) {
  const { t } = useI18n();
  const [selectedId, setSelectedId] = useState<string | null>(value ?? null);

  const activeVariants = variants.filter((v) => v.isActive);
  const selected = variants.find((v) => v.id === selectedId);

  function handleChange(v: string) {
    setSelectedId(v);
    onChange?.(v);
  }

  // If no active variants, show a single "Default" option
  if (activeVariants.length === 0) {
    return (
      <div className="space-y-1.5">
        {showLabel && (
          <Label className="text-xs">
            {t("products.variant")}
            {required && <span className="text-destructive ms-0.5">*</span>}
          </Label>
        )}
        <Select disabled>
          <SelectTrigger className={size === "sm" ? "h-8" : ""}>
            <SelectValue placeholder={t("products.noVariants")} />
          </SelectTrigger>
        </Select>
      </div>
    );
  }

  const effectivePrice = selected?.price ?? selected?.price ?? defaultPrice;
  const effectiveStock = selected?.stock ?? 0;
  const isLowStock = effectiveStock <= 5;
  const isOutOfStock = effectiveStock <= 0;

  return (
    <div className="space-y-1.5">
      {showLabel && (
        <Label className="text-xs">
          {t("products.variant")}
          {required && <span className="text-destructive ms-0.5">*</span>}
        </Label>
      )}
      <Select
        value={selectedId ?? undefined}
        onValueChange={handleChange}
        disabled={disabled}
      >
        <SelectTrigger className={size === "sm" ? "h-8" : ""}>
          <SelectValue placeholder={t("products.selectVariant")} />
        </SelectTrigger>
        <SelectContent className="max-h-60">
          {activeVariants.map((v) => {
            const variantPrice = v.price ?? defaultPrice;
            return (
              <SelectItem key={v.id} value={v.id} disabled={v.stock <= 0}>
                <div className="flex items-center justify-between gap-3 w-full">
                  <span>{v.name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {formatDZD(variantPrice)} · {v.stock} {t("products.inStock")}
                  </span>
                </div>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
      {selected && (
        <div className="flex items-center gap-2 text-xs">
          {isOutOfStock ? (
            <Badge variant="destructive">{t("products.outOfStock")}</Badge>
          ) : isLowStock ? (
            <Badge variant="outline" className="text-warning dark:text-amber-400 border-amber-300">
              {t("products.lowStockCount", { count: effectiveStock })}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-success dark:text-emerald-400 border-emerald-300">
              {t("products.inStockCount", { count: effectiveStock })}
            </Badge>
          )}
          <span className="text-muted-foreground">
            {formatDZD(effectivePrice)}
          </span>
        </div>
      )}
    </div>
  );
}
