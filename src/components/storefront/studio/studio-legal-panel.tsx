"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/hooks/use-i18n";
import type { StorefrontStudioDraft } from "@/lib/storefront/studio-draft";
import { isLegalReviewed, legalFieldErrors, markLegalReviewed, type LegalFields } from "@/lib/storefront/studio-legal";
import { LEGAL_KINDS, LEGAL_TITLE_KEY, legalSections } from "../../../../control-plane/storefront/web/shop/legal-text";
import type { PublicTranslator } from "../../../../control-plane/storefront/web/translator";
import { PanelHeader, SegmentedField, TextAreaField, TextField } from "./studio-controls";

export type LegalFormValues = {
  sellerName: string;
  registerNumber: string;
  returnsDays: string;
  returnShipping: "seller" | "buyer" | "none";
  extraReturns: string;
  extraTerms: string;
};

export type LegalPanelStatus = "loading" | "idle" | "saving" | "saved" | "failed";

/** The form starts empty: nothing is filled in for the seller, not even the days. */
export function legalValuesOf(legal: StorefrontStudioDraft["legal"]): LegalFormValues {
  if (!legal) return { sellerName: "", registerNumber: "", returnsDays: "", returnShipping: "none", extraReturns: "", extraTerms: "" };
  return {
    sellerName: legal.sellerName,
    registerNumber: legal.registerNumber,
    returnsDays: String(legal.returnsDays),
    returnShipping: legal.returnShipping,
    extraReturns: legal.extraReturns,
    extraTerms: legal.extraTerms,
  };
}

/** The draft's legal fields, or null while the form has an error (a half-typed form never reaches the draft). */
export function legalFieldsOf(values: LegalFormValues): LegalFields | null {
  const errors = legalFieldErrors(values);
  if (errors.sellerName || errors.returnsDays) return null;
  return { ...values, returnsDays: Number(values.returnsDays.trim()) };
}

type View = Readonly<{
  values: LegalFormValues;
  status?: LegalPanelStatus;
  read: boolean;
  changedAfterRead: boolean;
  showErrors: boolean;
  contact: Readonly<{ phone: string; whatsapp: string }>;
  onChange: (patch: Partial<LegalFormValues>) => void;
  onRead: () => void;
}>;

/** The panel as pure markup: every state of the brief is a prop, so each one is a render test. */
export function LegalPanelView({ values, status = "idle", read, changedAfterRead, showErrors, contact, onChange, onRead }: View) {
  const { t } = useI18n();
  if (status === "loading") {
    return (
      <div className="space-y-4" data-legal-panel="loading" aria-busy="true">
        <PanelHeader title={t("storefront.legalPanel.title")} />
        <p role="status" className="text-caption text-muted-foreground">{t("storefront.legalPanel.status.loading")}</p>
      </div>
    );
  }
  const errors = legalFieldErrors(values);
  const invalid = errors.sellerName || errors.returnsDays;
  const fields = legalFieldsOf(values);
  const translate: PublicTranslator = (key, params) => t(key, params as never);
  const preview = {
    sellerName: values.sellerName.trim() || "…",
    returnsDays: fields ? fields.returnsDays : 0,
    returnShipping: values.returnShipping,
    ...(values.extraReturns.trim() ? { extraReturns: values.extraReturns.trim() } : {}),
    ...(values.extraTerms.trim() ? { extraTerms: values.extraTerms.trim() } : {}),
    ...(values.registerNumber.trim() ? { registerNumber: values.registerNumber.trim() } : {}),
  };
  const line =
    status === "saving" ? { text: t("storefront.legalPanel.status.saving"), role: "status" as const }
    : status === "saved" ? { text: t("storefront.legalPanel.status.saved"), role: "status" as const }
    : status === "failed" ? { text: t("storefront.legalPanel.status.failed"), role: "alert" as const }
    : null;
  const readState = read ? "read" : changedAfterRead ? "changedAfterRead" : "notRead";
  return (
    <div className="space-y-4" data-legal-panel="form" data-legal-status={status}>
      <PanelHeader title={t("storefront.legalPanel.title")} description={t("storefront.legalPanel.description")} />
      <p role="note" data-legal-template="true" className="rounded-md border border-dashed border-border bg-muted/40 p-3 text-caption leading-5">
        {t("storefront.legalPanel.templateBanner")}
      </p>
      <TextField
        label={t("storefront.legalPanel.sellerName")}
        value={values.sellerName}
        maxLength={120}
        dir="auto"
        invalid={showErrors && errors.sellerName}
        describedBy={showErrors && errors.sellerName ? "legal-error-name" : undefined}
        onChange={(sellerName) => onChange({ sellerName })}
      />
      {showErrors && errors.sellerName ? <p id="legal-error-name" role="alert" className="text-caption text-destructive">{t("storefront.legalPanel.error.sellerName")}</p> : null}
      <TextField label={t("storefront.legalPanel.registerNumber")} value={values.registerNumber} maxLength={60} dir="auto" onChange={(registerNumber) => onChange({ registerNumber })} />
      <TextField
        label={t("storefront.legalPanel.returnsDays")}
        value={values.returnsDays}
        maxLength={2}
        dir="ltr"
        invalid={showErrors && errors.returnsDays}
        describedBy={showErrors && errors.returnsDays ? "legal-error-days" : undefined}
        onChange={(returnsDays) => onChange({ returnsDays })}
      />
      {showErrors && errors.returnsDays ? <p id="legal-error-days" role="alert" className="text-caption text-destructive">{t("storefront.legalPanel.error.returnsDays")}</p> : null}
      <SegmentedField
        label={t("storefront.legalPanel.returnShipping")}
        value={values.returnShipping}
        options={[
          { value: "seller", label: t("storefront.legalPanel.shipping.seller") },
          { value: "buyer", label: t("storefront.legalPanel.shipping.buyer") },
          { value: "none", label: t("storefront.legalPanel.shipping.none") },
        ]}
        onChange={(returnShipping) => onChange({ returnShipping })}
      />
      <TextAreaField label={t("storefront.legalPanel.extraReturns")} value={values.extraReturns} maxLength={600} onChange={(extraReturns) => onChange({ extraReturns })} />
      <TextAreaField label={t("storefront.legalPanel.extraTerms")} value={values.extraTerms} maxLength={1500} onChange={(extraTerms) => onChange({ extraTerms })} />
      {line ? <p role={line.role} className="text-caption text-muted-foreground">{line.text}</p> : null}
      <p id="legal-read-state" data-legal-read-state={readState} className="text-caption leading-5 text-muted-foreground">{t(`storefront.legalPanel.status.${readState}`)}</p>
      <Button type="button" size="sm" disabled={invalid || read} aria-describedby="legal-read-state" onClick={onRead}>
        {t("storefront.legalPanel.readButton")}
      </Button>
      <section aria-labelledby="legal-preview-heading" className="space-y-3 border-t pt-4">
        <h3 id="legal-preview-heading" className="text-body-sm font-semibold">{t("storefront.legalPanel.previewHeading")}</h3>
        {LEGAL_KINDS.map((kind) => (
          <article key={kind} data-legal-preview={kind} className="space-y-1">
            <h4 className="text-caption font-semibold">{t(LEGAL_TITLE_KEY[kind])}</h4>
            {kind === "returns" && errors.returnsDays ? (
              <p className="text-caption leading-5 text-muted-foreground">{t("storefront.legalPanel.error.returnsDays")}</p>
            ) : (
              legalSections(kind, preview, contact, translate).flatMap((section, sectionIndex) => [
                section.heading ? <h5 key={`h${sectionIndex}`} className="text-caption font-medium">{section.heading}</h5> : null,
                ...section.lines.map((entry, lineIndex) => (
                  <p key={`${sectionIndex}-${lineIndex}`} dir={entry.own ? "auto" : undefined} className="text-caption leading-5 text-muted-foreground">{entry.text}</p>
                )),
              ])
            )}
          </article>
        ))}
      </section>
    </div>
  );
}

/** The panel wired to the draft: valid edits go into the draft at once, an invalid form stays on screen and out of the draft. */
export function LegalPanel({ draft, commit, status }: { draft: StorefrontStudioDraft; commit: (draft: StorefrontStudioDraft) => void; status?: LegalPanelStatus }) {
  const [values, setValues] = useState<LegalFormValues>(() => legalValuesOf(draft.legal));
  const [touched, setTouched] = useState(false);
  const fields = legalFieldsOf(values);
  const read = fields !== null && isLegalReviewed(draft.legal);
  const changedAfterRead = !read && (draft.legal?.reviewedFingerprint ?? "") !== "";
  const onChange = (patch: Partial<LegalFormValues>) => {
    const next = { ...values, ...patch };
    setValues(next);
    setTouched(true);
    const valid = legalFieldsOf(next);
    if (valid) commit({ ...draft, legal: { ...valid, reviewedFingerprint: draft.legal?.reviewedFingerprint ?? "" } });
  };
  const onRead = () => {
    setTouched(true);
    if (fields) commit({ ...draft, legal: markLegalReviewed(fields) });
  };
  const contact = { phone: draft.theme.builder.contact.phone.trim(), whatsapp: draft.theme.builder.contact.whatsapp.trim() };
  return <LegalPanelView values={values} status={status ?? "idle"} read={read} changedAfterRead={changedAfterRead} showErrors={touched} contact={contact} onChange={onChange} onRead={onRead} />;
}
