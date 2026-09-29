"use client";

import { useMemo, useState } from "react";
import { AlertCircle, ArrowRight, CheckCircle2, Loader2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ExtractedOrder } from "@/lib/ai/extraction";
import type { OrderExtractionCopyKey } from "@/lib/i18n/order-extraction";
import { formatDZD } from "@/lib/utils";
import {
  DZ_PHONE_PLACEHOLDER,
  formatDZPhone,
  isValidDZMobilePhone,
  normalizeDZPhone,
} from "@/lib/validation/phone";
import wilayasData from "../../../../data/wilayas.json";
import { ExtractionItemRow, type CatalogOption, type DraftItem } from "./extraction-item-row";

const WILAYAS = wilayasData as Array<{ code: number; name: string; nameAr: string }>;

export interface ReviewedOrder {
  customer: { name: string; phone: string; wilaya: string; commune: string; address: string };
  items: Array<{ productName: string; quantity: number }>;
  notes?: string;
}

type Copy = (key: OrderExtractionCopyKey, params?: Record<string, string | number>) => string;

/** The delivery charge a reviewed WhatsApp order is created with (shown before creation). */
export const EXTRACTION_DELIVERY_COST = 600;

let draftKey = 0;
const nextKey = () => `item-${(draftKey += 1)}`;

function draftItems(order: ExtractedOrder | null): DraftItem[] {
  return (order?.items ?? []).map((item) => ({
    key: nextKey(),
    productName: item.productName,
    quantity: item.quantity,
    // The customer's words stay visible whenever the picker cannot show them.
    written: item.sourceText ?? (item.catalogMatch ? undefined : item.productName),
    statedPrice: item.unitPrice,
    match: item.catalogMatch,
  }));
}

export function ExtractionReview({
  order,
  knownPhone,
  catalog,
  locale,
  copy,
  fieldId,
  creating,
  onCreate,
  variant = "inline",
}: {
  /** `workspace` scrolls the sections and pins the summary + Create bar. */
  variant?: "inline" | "workspace";
  order: ExtractedOrder | null;
  knownPhone?: string;
  catalog: readonly CatalogOption[];
  locale: string;
  copy: Copy;
  fieldId: string;
  creating: boolean;
  onCreate: (reviewed: ReviewedOrder) => void;
}) {
  const catalogByName = useMemo(() => new Map(catalog.map((option) => [option.name, option])), [catalog]);
  const [items, setItems] = useState<DraftItem[]>(() => draftItems(order));
  const [name, setName] = useState(order?.customerName ?? "");
  const [phone, setPhone] = useState(formatDZPhone(order?.phone || knownPhone || ""));
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [wilaya, setWilaya] = useState(order?.wilaya ?? "");
  const [commune, setCommune] = useState(order?.commune ?? "");
  const [address, setAddress] = useState(order?.address ?? "");

  const phoneValid = isValidDZMobilePhone(phone);
  const itemsResolved =
    items.length > 0 &&
    items.every((item) => item.productName.trim() && (catalog.length === 0 || catalogByName.has(item.productName)));
  const missing = [
    ...(itemsResolved ? [] : [copy("fieldItems")]),
    ...(wilaya ? [] : [copy("fieldWilaya")]),
    ...(phoneValid ? [] : [copy("fieldPhone")]),
  ];
  const subtotal = items.reduce((sum, item) => sum + (catalogByName.get(item.productName)?.price ?? 0) * item.quantity, 0);
  const wilayaLabel = (entry: (typeof WILAYAS)[number]) =>
    `${String(entry.code).padStart(2, "0")} — ${locale === "ar" ? entry.nameAr : entry.name}`;

  return (
    <form
      className={
        variant === "workspace" ? "flex min-h-0 flex-1 flex-col" : "space-y-5"
      }
      onSubmit={(event) => {
        event.preventDefault();
        setPhoneTouched(true);
        if (missing.length > 0) return;
        onCreate({
          customer: {
            name: name.trim(),
            phone: normalizeDZPhone(phone),
            wilaya,
            commune: commune.trim(),
            address: address.trim(),
          },
          items: items.map((item) => ({ productName: item.productName.trim(), quantity: item.quantity })),
          notes: order?.notes,
        });
      }}
    >
      <div
        className={
          variant === "workspace"
            ? "min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5"
            : "space-y-5"
        }
      >
      <section aria-labelledby={`${fieldId}-items`} className="space-y-2">
        <h3 id={`${fieldId}-items`} className="text-caption font-medium text-muted-foreground">
          {copy("itemsTitle")}
        </h3>
        {items.length > 0 ? (
          <ul className="divide-y divide-border/70">
            {items.map((item) => (
              <ExtractionItemRow
                key={item.key}
                item={item}
                catalog={catalog}
                catalogByName={catalogByName}
                locale={locale}
                copy={copy}
                onChange={(next) => setItems((current) => current.map((entry) => (entry.key === item.key ? next : entry)))}
                onRemove={() => setItems((current) => current.filter((entry) => entry.key !== item.key))}
              />
            ))}
          </ul>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setItems((current) => [...current, { key: nextKey(), productName: "", quantity: 1 }])}
        >
          <Plus className="size-4" aria-hidden="true" />
          {copy("addItem")}
        </Button>
        {subtotal > 0 && variant !== "workspace" ? (
          <p className="flex justify-between text-sm">
            <span className="text-muted-foreground">{copy("subtotal")}</span>
            <span className="font-medium tabular-nums">{formatDZD(subtotal, locale)}</span>
          </p>
        ) : null}
      </section>

      <section aria-labelledby={`${fieldId}-customer`} className="space-y-3 border-t border-border/70 pt-4">
        <h3 id={`${fieldId}-customer`} className="text-caption font-medium text-muted-foreground">
          {copy("customerTitle")}
        </h3>
        <div className="space-y-1.5">
          <Label htmlFor={`${fieldId}-name`}>{copy("name")}</Label>
          <Input id={`${fieldId}-name`} dir="auto" value={name} onChange={(event) => setName(event.target.value)} className="h-9" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${fieldId}-phone`}>
            {copy("phone")} <span className="text-destructive">*</span>
          </Label>
          {/* Phone digits are technical LTR content — the groups must not
              reorder in the Arabic interface. */}
          <Input
            id={`${fieldId}-phone`}
            type="tel"
            inputMode="tel"
            dir="ltr"
            autoComplete="tel-national"
            value={phone}
            onChange={(event) => setPhone(formatDZPhone(event.target.value))}
            onBlur={() => setPhoneTouched(true)}
            placeholder={DZ_PHONE_PLACEHOLDER}
            aria-invalid={phoneTouched && !phoneValid}
            className="h-9 font-mono"
          />
        </div>
      </section>

      <section aria-labelledby={`${fieldId}-delivery`} className="space-y-3 border-t border-border/70 pt-4">
        <h3 id={`${fieldId}-delivery`} className="text-caption font-medium text-muted-foreground">
          {copy("deliveryTitle")}
        </h3>
        <div className="space-y-1.5">
          <Label htmlFor={`${fieldId}-wilaya`}>
            {copy("wilaya")} <span className="text-destructive">*</span>
          </Label>
          <Select value={wilaya || undefined} onValueChange={setWilaya}>
            <SelectTrigger id={`${fieldId}-wilaya`} aria-invalid={!wilaya} className="h-9 w-full">
              <SelectValue placeholder={copy("chooseWilaya")} />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {WILAYAS.map((entry) => (
                <SelectItem key={entry.code} value={entry.name}>
                  {wilayaLabel(entry)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${fieldId}-commune`}>{copy("commune")}</Label>
            <Input id={`${fieldId}-commune`} dir="auto" value={commune} onChange={(event) => setCommune(event.target.value)} className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${fieldId}-address`}>{copy("address")}</Label>
            <Input id={`${fieldId}-address`} dir="auto" value={address} onChange={(event) => setAddress(event.target.value)} className="h-9" />
          </div>
        </div>
        {order?.notes ? (
          <p className="text-caption text-muted-foreground" dir="auto" data-sf-user-content="true">
            {copy("notes")}: {order.notes}
          </p>
        ) : null}
      </section>

      </div>

      <div
        data-extraction-summary="true"
        className={
          variant === "workspace"
            ? "shrink-0 space-y-3 border-t border-border bg-card px-5 py-4"
            : "space-y-2 border-t border-border/70 pt-4"
        }
      >
        {variant === "workspace" ? (
          <dl className="space-y-1 text-body-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{copy("subtotal")}</dt>
              <dd className="tabular-nums">{formatDZD(subtotal, locale)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{copy("deliveryFee")}</dt>
              <dd className="tabular-nums">{formatDZD(EXTRACTION_DELIVERY_COST, locale)}</dd>
            </div>
            <div className="flex justify-between gap-3 text-title-3">
              <dt>{copy("total")}</dt>
              <dd className="tabular-nums">
                {formatDZD(subtotal + EXTRACTION_DELIVERY_COST, locale)}
              </dd>
            </div>
          </dl>
        ) : null}
        {missing.length > 0 ? (
          <p className="flex items-start gap-1.5 text-caption text-warning" role="status">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            {copy("stillNeeded", { fields: missing.join(" · ") })}
          </p>
        ) : null}
        {variant === "workspace" && missing.length === 0 ? (
          <p className="flex items-center gap-1.5 text-caption text-success" role="status">
            <CheckCircle2 className="size-3.5 shrink-0" aria-hidden="true" />
            {copy("ready")}
          </p>
        ) : null}
        <Button
          type="submit"
          size={variant === "workspace" ? "default" : "sm"}
          disabled={creating || missing.length > 0}
          className="w-full"
        >
          {creating ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              {copy("creating")}
            </>
          ) : (
            <>
              {copy("create")}
              <ArrowRight className="size-4 icon-rtl-flip" aria-hidden="true" />
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
