"use client";

import { AlertTriangle, CheckCircle2, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { OrderExtractionCopyKey } from "@/lib/i18n/order-extraction";
import { cn, formatDZD } from "@/lib/utils";

export interface CatalogOption {
  name: string;
  price: number;
}

export interface DraftItem {
  key: string;
  productName: string;
  quantity: number;
  /** What the customer wrote, when it differs from the chosen product. */
  written?: string;
  statedPrice?: number;
  /** "close" until the seller confirms the product by choosing it. */
  match?: "exact" | "close";
}

type Copy = (key: OrderExtractionCopyKey, params?: Record<string, string | number>) => string;

export function ExtractionItemRow({
  item,
  catalog,
  catalogByName,
  locale,
  copy,
  onChange,
  onRemove,
}: {
  item: DraftItem;
  catalog: readonly CatalogOption[];
  catalogByName: ReadonlyMap<string, CatalogOption>;
  locale: string;
  copy: Copy;
  onChange: (next: DraftItem) => void;
  onRemove: () => void;
}) {
  const product = catalogByName.get(item.productName);
  const needsChoice = catalog.length > 0 && !product;
  const check = product && item.match === "close";

  return (
    <li
      className="space-y-2 py-3 first:pt-0"
      data-extraction-item={needsChoice ? "unresolved" : check ? "check" : "resolved"}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {catalog.length > 0 ? (
            <Select
              value={product ? product.name : undefined}
              onValueChange={(value) => onChange({ ...item, productName: value, match: "exact" })}
            >
              <SelectTrigger
                aria-label={copy("product")}
                aria-invalid={needsChoice}
                className="h-9 w-full"
              >
                <SelectValue placeholder={copy("chooseProduct")} />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {catalog.map((option) => (
                  <SelectItem key={option.name} value={option.name}>
                    <span dir="auto">{option.name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              aria-label={copy("product")}
              dir="auto"
              value={item.productName}
              onChange={(event) => onChange({ ...item, productName: event.target.value })}
              className="h-9"
            />
          )}
        </div>
        <Input
          aria-label={copy("quantity")}
          type="number"
          inputMode="numeric"
          min={1}
          max={999}
          value={item.quantity}
          onChange={(event) => {
            const quantity = Math.trunc(Number(event.target.value));
            onChange({ ...item, quantity: Number.isFinite(quantity) ? Math.min(Math.max(quantity, 1), 999) : 1 });
          }}
          className="h-9 w-20 tabular-nums"
        />
        <button
          type="button"
          onClick={onRemove}
          aria-label={copy("removeItem", { name: item.productName || copy("product") })}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-control text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>

      <div className="space-y-1 text-caption text-muted-foreground">
        {item.written ? (
          <p dir="auto" data-sf-user-content="true">
            {copy("customerWrote", { text: item.written })}
          </p>
        ) : null}
        {needsChoice ? (
          <p className="flex items-center gap-1.5 text-warning">
            <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
            {copy("notInCatalog")}
          </p>
        ) : check ? (
          <p className="flex items-center gap-1.5 text-warning">
            <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
            {copy("matchedClose")}
          </p>
        ) : product ? (
          <p className="flex items-center gap-1.5 text-success">
            <CheckCircle2 className="size-3.5 shrink-0" aria-hidden="true" />
            {copy("catalogPrice", { price: formatDZD(product.price, locale) })}
          </p>
        ) : null}
        {item.statedPrice !== undefined && (!product || product.price !== item.statedPrice) ? (
          <p className={cn(product && "text-warning")}>
            {copy("statedPrice", { price: formatDZD(item.statedPrice, locale) })}
          </p>
        ) : null}
      </div>
    </li>
  );
}
