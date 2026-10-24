"use client";

/**
 * The line editor of a pending order the seller typed in (S03a-03B): quantity and price of
 * each line, a remove button (never the last line), a variant choice for a line just added,
 * and the product picker of the order form to add a line. All rules live in order-lines-edit.ts.
 */

import { Trash2 } from "lucide-react";

import {
  OrderProductCombobox,
  type OrderFormProduct,
} from "@/components/orders/order-product-combobox";
import {
  addCatalogProduct,
  changeNewLineVariant,
  removeLine,
  setLinePrice,
  setLineQuantity,
  type EditableLine,
} from "@/components/orders/order-lines-edit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/hooks/use-i18n";
import { formatDZD } from "@/lib/utils";

interface OrderLinesEditorProps {
  lines: EditableLine[];
  onChange: (lines: EditableLine[]) => void;
  products: OrderFormProduct[];
  onProductsLoaded: (products: OrderFormProduct[]) => void;
  nextKey: () => string;
  disabled?: boolean;
}

export function OrderLinesEditor({
  lines,
  onChange,
  products,
  onProductsLoaded,
  nextKey,
  disabled = false,
}: OrderLinesEditorProps) {
  const { t, locale } = useI18n();
  const onlyOne = lines.length <= 1;

  return (
    <div className="space-y-3">
      <OrderProductCombobox
        id="order-edit-add-product"
        products={products}
        selectedFields={lines.flatMap((line) =>
          line.productId
            ? [{ productId: line.productId, productVariantId: line.productVariantId }]
            : [],
        )}
        onSelect={(product) => onChange(addCatalogProduct(lines, product, nextKey()))}
        onProductsLoaded={onProductsLoaded}
        disabled={disabled}
      />
      {lines.map((line) => {
        const variants = (line.product?.productVariants ?? []).filter((variant) => variant.isActive);
        return (
          <div
            key={line.id}
            data-line-id={line.id}
            className="flex flex-wrap items-center gap-3 border-b py-2 last:border-0"
          >
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="text-sm font-medium">{line.productName}</p>
              {line.isNew && variants.length > 0 ? (
                <select
                  aria-label={t("orders.detail.variantLabel")}
                  value={line.productVariantId ?? ""}
                  onChange={(event) => onChange(changeNewLineVariant(lines, line.id, event.target.value))}
                  disabled={disabled}
                  className="h-8 rounded-control border bg-background px-2 text-xs"
                >
                  {variants.map((variant) => (
                    <option key={variant.id} value={variant.id}>
                      {variant.name}
                    </option>
                  ))}
                </select>
              ) : line.productVariantName ? (
                <p className="text-xs text-muted-foreground">{line.productVariantName}</p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <div className="space-y-1">
                <Label htmlFor={`${line.id}-qty`} className="text-xs text-muted-foreground">
                  {t("orders.detail.qty")}
                </Label>
                <Input
                  id={`${line.id}-qty`}
                  type="number"
                  min="1"
                  value={line.quantity}
                  onChange={(event) =>
                    onChange(setLineQuantity(lines, line.id, parseInt(event.target.value, 10)))
                  }
                  disabled={disabled}
                  className="h-8 w-16 text-sm tabular-nums"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`${line.id}-price`} className="text-xs text-muted-foreground">
                  {t("orders.detail.price")}
                </Label>
                <Input
                  id={`${line.id}-price`}
                  type="number"
                  min="0"
                  value={line.unitPrice}
                  onChange={(event) =>
                    onChange(setLinePrice(lines, line.id, parseInt(event.target.value, 10)))
                  }
                  disabled={disabled}
                  className="h-8 w-24 text-sm tabular-nums"
                />
              </div>
              <div className="w-24 text-end text-sm font-medium tabular-nums">
                {formatDZD(line.quantity * line.unitPrice, locale)}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t("orders.detail.removeLine")}
                title={onlyOne ? t("orders.detail.lastLine") : t("orders.detail.removeLine")}
                disabled={disabled || onlyOne}
                onClick={() => onChange(removeLine(lines, line.id))}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
