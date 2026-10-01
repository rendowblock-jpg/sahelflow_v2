"use client";

import { useMemo, useState } from "react";
import { Cloud, Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { useI18n } from "@/hooks/use-i18n";
import type {
  StorefrontDeliveryMode,
  StorefrontShippingRule,
} from "@/lib/storefront/presentation-types";
import type { StorefrontStudioDraft } from "@/lib/storefront/studio-draft";
import wilayasData from "../../../../data/wilayas.json";

import { PanelHeader, TextAreaField, TextField, ToggleRow } from "./studio-controls";

type Commit = (draft: StorefrontStudioDraft) => void;

const WILAYAS = wilayasData as Array<{ code: number; name: string; nameAr: string }>;
const MAX_FEE = 100000;

/** Public contact channels (shown in the store's contact section). */
export function ContactPanel({ draft, commit }: { draft: StorefrontStudioDraft; commit: Commit }) {
  const { t } = useI18n();
  const contact = draft.theme.builder.contact;
  const setContact = (patch: Partial<typeof contact>) =>
    commit({
      ...draft,
      theme: {
        ...draft.theme,
        builder: {
          ...draft.theme.builder,
          contact: { ...contact, ...patch },
        },
      },
    });

  return (
    <div className="space-y-4">
      <PanelHeader title={t("storefront.builder.contactInfo")} description={t("storefront.builder.contactInfoDesc")} />
      <TextField label={t("storefront.builder.phone")} type="tel" dir="ltr" value={contact.phone} maxLength={64} onChange={(phone) => setContact({ phone })} />
      <TextField label={t("storefront.builder.whatsapp")} type="tel" dir="ltr" value={contact.whatsapp} maxLength={64} onChange={(whatsapp) => setContact({ whatsapp })} />
      <TextField label={t("storefront.builder.email")} type="email" dir="ltr" value={contact.email} maxLength={254} onChange={(email) => setContact({ email })} />
      <TextField label={t("storefront.builder.address")} value={contact.address} maxLength={240} onChange={(address) => setContact({ address })} />
    </div>
  );
}

/** Search appearance, with a live search-result preview. */
export function SeoPanel({ draft, commit }: { draft: StorefrontStudioDraft; commit: Commit }) {
  const { t } = useI18n();
  const seo = draft.theme.builder.seo;
  const setSeo = (patch: Partial<typeof seo>) =>
    commit({
      ...draft,
      theme: { ...draft.theme, builder: { ...draft.theme.builder, seo: { ...seo, ...patch } } },
    });
  const title = seo.title.trim() || `${draft.name} — SahelFlow`;
  const description = seo.description.trim() || draft.description;

  return (
    <div className="space-y-4">
      <PanelHeader title={t("storefront.studio.panels.seo")} />
      <div className="rounded-surface border bg-background p-3" aria-label={t("storefront.studio.seoPreview")}>
        <p className="mb-2 text-caption font-medium text-muted-foreground">{t("storefront.studio.seoPreview")}</p>
        <p dir="ltr" className="truncate text-caption text-muted-foreground">
          {["sahelflow.app", "storefront", draft.slug].join(" › ")}
        </p>
        <p dir="auto" className="mt-0.5 line-clamp-1 text-body font-medium text-info">{title}</p>
        <p dir="auto" className="mt-0.5 line-clamp-2 text-caption leading-5 text-muted-foreground">{description}</p>
      </div>
      <TextField label={t("storefront.studio.seoTitle")} value={seo.title} maxLength={120} onChange={(value) => setSeo({ title: value })} />
      <TextAreaField label={t("storefront.studio.seoDescription")} value={seo.description} maxLength={320} rows={4} onChange={(value) => setSeo({ description: value })} />
      <ToggleRow label={t("storefront.studio.hideFromSearch")} checked={seo.noIndex} onChange={(noIndex) => setSeo({ noIndex })} />
      <p className="flex gap-2 rounded-surface border bg-muted/30 p-3 text-caption leading-5 text-muted-foreground">
        <Cloud className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        {t("storefront.studio.domainAuthority")}
      </p>
    </div>
  );
}

function feeKey(code: string, mode: StorefrontDeliveryMode): string {
  return `${code}:${mode}`;
}

/**
 * Delivery prices for all 58 wilayas, home and desk, in one table. An empty
 * price means the store does not deliver there with that mode. A bulk row
 * fills every empty price at once so sellers only adjust exceptions.
 */
export function CheckoutPanel({ draft, commit }: { draft: StorefrontStudioDraft; commit: Commit }) {
  const { t, locale } = useI18n();
  const rules = draft.theme.builder.shippingRules;
  const [query, setQuery] = useState("");
  const [bulkHome, setBulkHome] = useState("");
  const [bulkDesk, setBulkDesk] = useState("");
  const fees = useMemo(
    () => new Map(rules.map((rule) => [feeKey(rule.wilayaCode, rule.deliveryMode), rule.feeDzd])),
    [rules],
  );
  const setRules = (shippingRules: StorefrontShippingRule[]) =>
    commit({ ...draft, theme: { ...draft.theme, builder: { ...draft.theme.builder, shippingRules } } });

  function setFee(code: string, mode: StorefrontDeliveryMode, raw: string) {
    const others = rules.filter((rule) => !(rule.wilayaCode === code && rule.deliveryMode === mode));
    if (raw.trim() === "") {
      setRules(others);
      return;
    }
    const feeDzd = Math.max(0, Math.min(MAX_FEE, Math.round(Number(raw) || 0)));
    setRules([...others, { wilayaCode: code, deliveryMode: mode, feeDzd }]);
  }

  function applyBulk() {
    const next = [...rules];
    for (const wilaya of WILAYAS) {
      const code = String(wilaya.code).padStart(2, "0");
      for (const [mode, raw] of [["home", bulkHome], ["desk", bulkDesk]] as const) {
        if (raw.trim() === "" || fees.has(feeKey(code, mode))) continue;
        next.push({ wilayaCode: code, deliveryMode: mode, feeDzd: Math.max(0, Math.min(MAX_FEE, Math.round(Number(raw) || 0))) });
      }
    }
    setRules(next);
  }

  const needle = query.trim().toLocaleLowerCase();
  const visible = WILAYAS.filter(
    (wilaya) =>
      !needle ||
      wilaya.name.toLocaleLowerCase().includes(needle) ||
      wilaya.nameAr.includes(query.trim()) ||
      String(wilaya.code).padStart(2, "0").startsWith(needle),
  );

  return (
    <div className="space-y-4">
      <PanelHeader title={t("storefront.studio.shippingRules")} description={t("storefront.studio.checkoutGuidance")} />
      <p className="text-caption font-medium text-muted-foreground">
        {t("storefront.studio.deliveryRulesCount", { count: rules.length })}
      </p>

      <div className="space-y-2.5 rounded-surface border bg-muted/25 p-3">
        <p className="text-body-sm font-medium">{t("storefront.studio.bulkFeeTitle")}</p>
        <p className="text-caption leading-5 text-muted-foreground">{t("storefront.studio.bulkFeeHint")}</p>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1 text-caption font-medium">
            <span className="block truncate">{t("storefront.studio.option.home")}</span>
            <Input inputMode="numeric" dir="ltr" value={bulkHome} onChange={(event) => setBulkHome(event.target.value.replace(/\D/g, ""))} placeholder="DZD" />
          </label>
          <label className="space-y-1 text-caption font-medium">
            <span className="block truncate">{t("storefront.studio.option.desk")}</span>
            <Input inputMode="numeric" dir="ltr" value={bulkDesk} onChange={(event) => setBulkDesk(event.target.value.replace(/\D/g, ""))} placeholder="DZD" />
          </label>
        </div>
        <button
          type="button"
          onClick={applyBulk}
          disabled={!bulkHome && !bulkDesk}
          className="h-(--control-height) w-full rounded-control bg-primary px-3 text-body-sm font-semibold text-primary-foreground outline-none hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
        >
          {t("storefront.studio.apply")}
        </button>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("storefront.studio.wilaya")} aria-label={t("storefront.studio.wilaya")} className="ps-9" />
      </div>

      <table className="w-full text-body-sm" data-studio-shipping-table="true">
        <thead>
          <tr className="text-caption text-muted-foreground">
            <th className="pb-2 text-start font-medium">{t("storefront.studio.wilaya")}</th>
            <th className="w-20 pb-2 text-start font-medium">{t("storefront.studio.option.home")}</th>
            <th className="w-20 pb-2 text-start font-medium">{t("storefront.studio.option.desk")}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {visible.map((wilaya) => {
            const code = String(wilaya.code).padStart(2, "0");
            const name = locale.startsWith("ar") ? wilaya.nameAr : wilaya.name;
            return (
              <tr key={code}>
                <td className="py-1.5 pe-2">
                  <span className="me-1.5 font-mono text-caption tabular-nums text-muted-foreground">{code}</span>
                  <span dir="auto">{name}</span>
                </td>
                {(["home", "desk"] as const).map((mode) => {
                  const fee = fees.get(feeKey(code, mode));
                  return (
                    <td key={mode} className="py-1.5 pe-1">
                      <input
                        inputMode="numeric"
                        dir="ltr"
                        aria-label={`${name} · ${t(`storefront.studio.option.${mode}`)}`}
                        value={fee === undefined ? "" : String(fee)}
                        placeholder="—"
                        onChange={(event) => setFee(code, mode, event.target.value.replace(/\D/g, ""))}
                        className="h-8 w-full rounded-control border border-input bg-background px-2 text-body-sm tabular-nums outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25"
                      />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
