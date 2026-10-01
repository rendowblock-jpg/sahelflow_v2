"use client";

import { MousePointerClick, Plus, Trash2 } from "lucide-react";

import { useI18n } from "@/hooks/use-i18n";
import type { StorefrontSection } from "@/lib/storefront/studio-sections";
import {
  addStorefrontBlock,
  deleteStorefrontBlock,
  patchStorefrontBlockSettings,
  patchStorefrontSectionSettings,
  type StorefrontStudioDraft,
} from "@/lib/storefront/studio-draft";

import { SECTION_LABEL_KEYS } from "./section-tree";
import { ContactPanel } from "./studio-settings-panels";
import { blockString, useStorefrontContentCopy } from "./studio-copy";
import {
  InspectorGroup,
  SegmentedField,
  TextAreaField,
  TextField,
  ToggleRow,
} from "./studio-controls";

type Commit = (draft: StorefrontStudioDraft) => void;

/** Settings of the selected section (the Studio's right-hand inspector). */
export function SectionInspector({
  draft,
  selectedSection,
  commit,
  createId,
}: {
  draft: StorefrontStudioDraft;
  selectedSection: StorefrontSection | null;
  commit: Commit;
  createId: (type?: string) => string;
}) {
  const { t, locale } = useI18n();
  const c = useStorefrontContentCopy(locale);
  const theme = draft.theme;

  if (!selectedSection) {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
        <MousePointerClick className="size-6" aria-hidden="true" />
        <p className="max-w-56 text-body-sm leading-5">{t("storefront.studio.noSelection")}</p>
      </div>
    );
  }

  const section = selectedSection;
  const setting = (key: string) => {
    const value = section.settings[key];
    return typeof value === "string" ? value : "";
  };
  const patchSection = (patch: StorefrontSection["settings"]) =>
    commit(patchStorefrontSectionSettings(draft, section.id, patch));
  const patchTheme = (patch: Partial<StorefrontStudioDraft["theme"]>) =>
    commit({ ...draft, theme: { ...theme, ...patch } });
  const option = (value: string) => ({ value, label: t(`storefront.studio.option.${value}`) });

  return (
    <div className="space-y-5" data-studio-inspector-section={section.type}>
      <div className="border-b pb-4">
        <p className="text-caption font-semibold uppercase tracking-wider text-muted-foreground">
          {t("storefront.studio.inspector")}
        </p>
        <h2 className="mt-1 text-title-3 font-semibold">{t(SECTION_LABEL_KEYS[section.type])}</h2>
      </div>

      {section.type === "announcement" ? (
        <InspectorGroup title={t(SECTION_LABEL_KEYS.announcement)}>
          <ToggleRow
            label={t("storefront.studio.section.announcement")}
            checked={theme.announcement.enabled}
            onChange={(enabled) => patchTheme({ announcement: { ...theme.announcement, enabled } })}
          />
          <TextField
            label={c("announcementText")}
            value={theme.announcement.text}
            maxLength={160}
            onChange={(text) => patchTheme({ announcement: { ...theme.announcement, text } })}
          />
        </InspectorGroup>
      ) : null}

      {section.type === "hero" ? (
        <InspectorGroup title={t("storefront.studio.section.hero")}>
          <SegmentedField
            label={t("storefront.studio.heroLayout")}
            value={theme.hero.style}
            options={["editorial", "split", "centered"].map(option) as Array<{ value: typeof theme.hero.style; label: string }>}
            onChange={(style) => patchTheme({ hero: { ...theme.hero, style } })}
          />
          <TextField label={t("storefront.studio.eyebrow")} value={theme.hero.eyebrow} maxLength={80} onChange={(eyebrow) => patchTheme({ hero: { ...theme.hero, eyebrow } })} />
          <TextField label={t("storefront.studio.headline")} value={theme.hero.headline} maxLength={140} onChange={(headline) => patchTheme({ hero: { ...theme.hero, headline } })} />
          <TextAreaField label={t("storefront.studio.body")} value={theme.hero.body} maxLength={320} rows={4} onChange={(body) => patchTheme({ hero: { ...theme.hero, body } })} />
          <TextField label={t("storefront.studio.ctaLabel")} value={theme.hero.ctaLabel} maxLength={60} onChange={(ctaLabel) => patchTheme({ hero: { ...theme.hero, ctaLabel } })} />
        </InspectorGroup>
      ) : null}

      {section.type === "featured-products" || section.type === "product-grid" || section.type === "categories" ? (
        <InspectorGroup title={t(SECTION_LABEL_KEYS[section.type])}>
          <TextField label={c("sectionTitle")} value={setting("title")} maxLength={120} onChange={(title) => patchSection({ title })} />
          {section.type !== "categories" ? (
            <>
              <ToggleRow label={t("storefront.builder.showPrices")} checked={theme.showPrices} onChange={(showPrices) => patchTheme({ showPrices })} />
              <ToggleRow label={t("storefront.builder.showStock")} checked={theme.showStock} onChange={(showStock) => patchTheme({ showStock })} />
            </>
          ) : null}
        </InspectorGroup>
      ) : null}

      {section.type === "media" ? (
        <InspectorGroup title={t(SECTION_LABEL_KEYS.media)}>
          <TextField label={c("mediaEyebrow")} value={setting("eyebrow")} maxLength={80} onChange={(eyebrow) => patchSection({ eyebrow })} />
          <TextField label={c("mediaTitle")} value={setting("title")} maxLength={140} onChange={(title) => patchSection({ title })} />
          <TextAreaField label={c("mediaBody")} value={setting("body")} maxLength={1000} rows={5} onChange={(body) => patchSection({ body })} />
          <TextField label={c("mediaImageUrl")} type="url" dir="ltr" value={setting("imageUrl")} maxLength={2000} placeholder="https://" onChange={(imageUrl) => patchSection({ imageUrl })} />
          <TextField label={c("mediaImageAlt")} value={setting("imageAlt")} maxLength={240} onChange={(imageAlt) => patchSection({ imageAlt })} />
          <SegmentedField
            label={c("mediaAlignment")}
            value={(setting("align") || "split") as "split" | "media-end"}
            options={[
              { value: "split", label: c("mediaStart") },
              { value: "media-end", label: c("mediaEnd") },
            ]}
            onChange={(align) => patchSection({ align })}
          />
        </InspectorGroup>
      ) : null}

      {section.type === "testimonials" || section.type === "faq" ? (
        <InspectorGroup title={t(SECTION_LABEL_KEYS[section.type])}>
          <TextField label={c("sectionTitle")} value={setting("title")} maxLength={120} onChange={(title) => patchSection({ title })} />
          <ol className="space-y-3">
            {section.blocks.map((block, index) => {
              const patchBlock = (patch: Record<string, string>) =>
                commit(patchStorefrontBlockSettings(draft, section.id, block.id, patch));
              return (
                <li key={block.id} className="space-y-3 rounded-surface border bg-muted/20 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex size-6 items-center justify-center rounded-full bg-muted text-caption font-semibold tabular-nums text-muted-foreground">
                      {index + 1}
                    </span>
                    <button
                      type="button"
                      aria-label={c("removeItem")}
                      title={c("removeItem")}
                      onClick={() => commit(deleteStorefrontBlock(draft, section.id, block.id))}
                      className="flex size-7 items-center justify-center rounded-control text-muted-foreground outline-none hover:bg-destructive-soft hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Trash2 className="size-3.5" aria-hidden="true" />
                    </button>
                  </div>
                  {section.type === "testimonials" ? (
                    <>
                      <TextAreaField label={c("testimonialQuote")} value={blockString(block.settings.quote)} maxLength={1000} onChange={(quote) => patchBlock({ quote })} />
                      <TextField label={c("testimonialName")} value={blockString(block.settings.name)} maxLength={120} onChange={(name) => patchBlock({ name })} />
                      <TextField label={c("testimonialRole")} value={blockString(block.settings.role)} maxLength={160} onChange={(role) => patchBlock({ role })} />
                    </>
                  ) : (
                    <>
                      <TextField label={c("faqQuestion")} value={blockString(block.settings.question)} maxLength={240} onChange={(question) => patchBlock({ question })} />
                      <TextAreaField label={c("faqAnswer")} value={blockString(block.settings.answer)} maxLength={1600} rows={4} onChange={(answer) => patchBlock({ answer })} />
                    </>
                  )}
                </li>
              );
            })}
          </ol>
          <button
            type="button"
            disabled={section.blocks.length >= 50}
            onClick={() =>
              commit(
                addStorefrontBlock(
                  draft,
                  section.id,
                  section.type === "testimonials"
                    ? { id: createId("testimonial"), type: "testimonial", settings: { quote: "", name: "", role: "" } }
                    : { id: createId("faq"), type: "faq", settings: { question: "", answer: "" } },
                ),
              )
            }
            className="flex min-h-9 w-full items-center justify-center gap-2 rounded-surface border border-dashed text-body-sm font-medium text-muted-foreground outline-none hover:border-primary/40 hover:bg-primary-subtle hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
          >
            <Plus className="size-4" aria-hidden="true" />
            {section.type === "testimonials" ? c("addTestimonial") : c("addFaq")}
          </button>
        </InspectorGroup>
      ) : null}

      {section.type === "cod-checkout" ? (
        <InspectorGroup title={t("storefront.studio.section.codCheckout")}>
          <SegmentedField
            label={t("storefront.studio.checkoutLayout")}
            value={theme.checkout.layout}
            options={["inline", "sticky", "drawer"].map(option) as Array<{ value: typeof theme.checkout.layout; label: string }>}
            onChange={(layout) => patchTheme({ checkout: { ...theme.checkout, layout } })}
          />
          <ToggleRow label={t("storefront.studio.showCodPromise")} checked={theme.checkout.showCodPromise} onChange={(showCodPromise) => patchTheme({ checkout: { ...theme.checkout, showCodPromise } })} />
          <TextAreaField label={t("storefront.studio.codPromise")} value={theme.checkout.codPromiseText} maxLength={180} onChange={(codPromiseText) => patchTheme({ checkout: { ...theme.checkout, codPromiseText } })} />
          <ToggleRow label={t("storefront.studio.orderNotes")} checked={theme.checkout.showOrderNotes} onChange={(showOrderNotes) => patchTheme({ checkout: { ...theme.checkout, showOrderNotes } })} />
        </InspectorGroup>
      ) : null}

      {section.type === "trust" ? (
        <InspectorGroup title={t("storefront.studio.section.trust")}>
          <ToggleRow label={t("storefront.studio.cashOnDelivery")} checked={theme.trust.showCodBadge} onChange={(showCodBadge) => patchTheme({ trust: { ...theme.trust, showCodBadge } })} />
          <ToggleRow label={t("storefront.studio.phoneConfirmation")} checked={theme.trust.showPhoneConfirmationBadge} onChange={(showPhoneConfirmationBadge) => patchTheme({ trust: { ...theme.trust, showPhoneConfirmationBadge } })} />
          <ToggleRow label={t("storefront.studio.delivery")} checked={theme.trust.showDeliveryBadge} onChange={(showDeliveryBadge) => patchTheme({ trust: { ...theme.trust, showDeliveryBadge } })} />
          <ToggleRow label={t("storefront.studio.support")} checked={theme.trust.showSupportBadge} onChange={(showSupportBadge) => patchTheme({ trust: { ...theme.trust, showSupportBadge } })} />
        </InspectorGroup>
      ) : null}

      {section.type === "support" ? <ContactPanel draft={draft} commit={commit} /> : null}

      {section.type === "footer" ? (
        <InspectorGroup title={t(SECTION_LABEL_KEYS.footer)}>
          <TextField label={c("footerTagline")} value={setting("tagline")} maxLength={240} onChange={(tagline) => patchSection({ tagline })} />
        </InspectorGroup>
      ) : null}

      {section.type === "navbar" ? (
        <p className="rounded-surface border border-dashed p-3 text-body-sm leading-5 text-muted-foreground">
          {c("contentHint")}
        </p>
      ) : null}
    </div>
  );
}
