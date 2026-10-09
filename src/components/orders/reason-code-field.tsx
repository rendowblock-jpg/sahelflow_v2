"use client";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Reason picker for audited order, return, COD and courier actions.
 *
 * The server stores a reason *code* (`^[a-z0-9][a-z0-9._-]*$`, audited and
 * never shown raw), so sellers pick a reason in their own language instead of
 * typing a slug. Free text in Arabic or French could never pass that
 * contract; a list cannot fail it.
 */
export type ReasonCodeContext = "return" | "recovery" | "cod" | "codMatch" | "courier";

type Locale = "en" | "fr" | "ar";
type ReasonLabels = Record<Locale, string>;

const REASONS: Record<ReasonCodeContext, Array<[code: string, labels: ReasonLabels]>> = {
  return: [
    ["customer_changed_mind", { en: "Customer changed their mind", fr: "Le client a changé d’avis", ar: "غيّر العميل رأيه" }],
    ["wrong_size_or_color", { en: "Wrong size or colour", fr: "Mauvaise taille ou couleur", ar: "مقاس أو لون غير مناسب" }],
    ["damaged_item", { en: "Item arrived damaged", fr: "Article arrivé endommagé", ar: "وصل المنتج تالفًا" }],
    ["wrong_item_sent", { en: "Wrong item sent", fr: "Mauvais article envoyé", ar: "أُرسل منتج خاطئ" }],
    ["not_as_described", { en: "Not as described", fr: "Non conforme à la description", ar: "غير مطابق للوصف" }],
    ["late_delivery", { en: "Delivered too late", fr: "Livré trop tard", ar: "تأخر التوصيل" }],
    ["seller_goodwill", { en: "Goodwill gesture", fr: "Geste commercial", ar: "بادرة حسن نية" }],
    ["other", { en: "Other reason", fr: "Autre motif", ar: "سبب آخر" }],
  ],
  recovery: [
    ["customer_cancelled", { en: "Customer cancelled", fr: "Annulée par le client", ar: "ألغى العميل الطلبية" }],
    ["customer_unreachable", { en: "Customer unreachable", fr: "Client injoignable", ar: "تعذّر الوصول إلى العميل" }],
    ["customer_refused", { en: "Customer refused the parcel", fr: "Le client a refusé le colis", ar: "رفض العميل الطرد" }],
    ["wrong_address", { en: "Wrong or incomplete address", fr: "Adresse erronée ou incomplète", ar: "عنوان خاطئ أو ناقص" }],
    ["out_of_stock", { en: "Out of stock", fr: "Rupture de stock", ar: "نفاد المخزون" }],
    ["duplicate_order", { en: "Duplicate order", fr: "Commande en double", ar: "طلبية مكررة" }],
    ["courier_failed", { en: "Courier could not deliver", fr: "Le transporteur n’a pas pu livrer", ar: "تعذّر على شركة التوصيل التسليم" }],
    ["parcel_returned", { en: "Parcel came back", fr: "Colis revenu", ar: "عاد الطرد" }],
    ["other", { en: "Other reason", fr: "Autre motif", ar: "سبب آخر" }],
  ],
  cod: [
    ["courier_short_payment", { en: "Courier paid less than expected", fr: "Le transporteur a versé moins que prévu", ar: "حوّلت شركة التوصيل مبلغًا أقل من المتوقع" }],
    ["courier_fee_adjustment", { en: "Courier fee adjustment", fr: "Ajustement des frais transporteur", ar: "تعديل رسوم شركة التوصيل" }],
    ["entry_mistake", { en: "Correcting an entry mistake", fr: "Correction d’une erreur de saisie", ar: "تصحيح خطأ في الإدخال" }],
    ["duplicate_entry", { en: "Duplicate entry", fr: "Saisie en double", ar: "إدخال مكرر" }],
    ["other", { en: "Other reason", fr: "Autre motif", ar: "سبب آخر" }],
  ],
  codMatch: [
    ["reference_matches", { en: "Tracking or order reference matches", fr: "La référence de suivi ou de commande correspond", ar: "رقم التتبع أو مرجع الطلبية مطابق" }],
    ["amount_and_date_match", { en: "Amount and date match", fr: "Le montant et la date correspondent", ar: "المبلغ والتاريخ مطابقان" }],
    ["courier_statement", { en: "Confirmed on the courier statement", fr: "Confirmé sur le relevé du transporteur", ar: "مؤكَّد في كشف شركة التوصيل" }],
    ["other", { en: "Other reason", fr: "Autre motif", ar: "سبب آخر" }],
  ],
  courier: [
    ["provider_dashboard_checked", { en: "Checked in the courier dashboard", fr: "Vérifié dans l’espace transporteur", ar: "تم التحقق في لوحة شركة التوصيل" }],
    ["provider_support_confirmed", { en: "Confirmed by courier support", fr: "Confirmé par le support transporteur", ar: "أكّده دعم شركة التوصيل" }],
    ["other", { en: "Other reason", fr: "Autre motif", ar: "سبب آخر" }],
  ],
};

const PLACEHOLDER: ReasonLabels = {
  en: "Choose a reason",
  fr: "Choisir un motif",
  ar: "اختر سببًا",
};

const LABEL: ReasonLabels = { en: "Reason", fr: "Motif", ar: "السبب" };

export function reasonCodes(context: ReasonCodeContext): string[] {
  return REASONS[context].map(([code]) => code);
}

export function ReasonCodeField({
  id,
  context,
  locale,
  value,
  onChange,
  disabled,
  className,
}: {
  id: string;
  context: ReasonCodeContext;
  locale: string;
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const lang: Locale = locale === "ar" || locale === "fr" ? locale : "en";
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>{LABEL[lang]}</Label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="h-9 w-full rounded-control border bg-background px-3 text-sm"
      >
        <option value="">{PLACEHOLDER[lang]}</option>
        {REASONS[context].map(([code, labels]) => (
          <option key={code} value={code}>
            {labels[lang]}
          </option>
        ))}
      </select>
    </div>
  );
}
