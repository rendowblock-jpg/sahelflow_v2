"use client";

import { BadgeCheck, Headphones, PackageCheck, PhoneCall } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
import { formatDZD } from "@/lib/utils";
import type { StorefrontSectionType } from "@/lib/storefront/studio-sections";
import type { StorefrontPreviewProps } from "./studio-types";
import { studioImageUrl } from "./studio-types";

type Props = StorefrontPreviewProps & {
  selectedSectionId?: string | null;
  onInspectSection?: (id: string) => void;
};
type InspectProps = React.HTMLAttributes<HTMLElement> & { "data-studio-section"?: string };

export function SaharaPreview({ draft, products, selectedSectionId, onInspectSection }: Props) {
  const { t } = useI18n();
  const theme = draft.theme;
  const sections = theme.builder.composition.sections;
  const section = (type: StorefrontSectionType) => sections.find((candidate) => candidate.type === type);
  const enabled = (type: StorefrontSectionType) => section(type)?.enabled ?? false;
  const shown = products.filter((product) => draft.selectedProductIds.includes(product.id)).slice(0, 8);
  const inspect = (type: StorefrontSectionType): InspectProps => {
    const candidate = section(type);
    return candidate ? {
      "data-studio-section": candidate.id,
      onClick: (event: React.MouseEvent) => {
        event.stopPropagation();
        onInspectSection?.(candidate.id);
      },
      className: selectedSectionId === candidate.id ? "ring-2 ring-primary ring-offset-2" : undefined,
    } : {};
  };

  const cards = (
    <div className={`grid grid-cols-2 ${theme.density === "compact" ? "gap-2" : "gap-4"}`}>
      {shown.map((product) => {
        const image = studioImageUrl(product.images);
        const ratio = theme.catalog.imageRatio === "portrait"
          ? "aspect-[4/5]"
          : theme.catalog.imageRatio === "landscape" ? "aspect-[4/3]" : "aspect-square";
        return (
          <article
            key={product.id}
            className={`overflow-hidden border ${radius(theme.radius)} ${
              theme.catalog.cardStyle === "elevated" ? "shadow-sm" : ""
            }`}
            style={{ background: theme.surfaceColor }}
          >
            {image ? (
              <img src={image} alt={product.name} className={`${ratio} w-full object-cover`} />
            ) : (
              <div className={`${ratio} opacity-20`} style={{ background: theme.accentColor }} />
            )}
            <div className="p-3">
              <div className="text-sm font-semibold">{product.name}</div>
              {theme.catalog.showSku && product.sku ? <div className="mt-1 text-[10px] opacity-50">{product.sku}</div> : null}
              {theme.showPrices ? <div className="mt-1 text-xs font-semibold" style={{ color: theme.primaryColor }}>{formatDZD(product.price)}</div> : null}
              {theme.showStock ? <div className="mt-1 text-[10px] opacity-60">{t("storefront.builder.stock")} {product.stock}</div> : null}
            </div>
          </article>
        );
      })}
    </div>
  );

  const trust = enabled("trust") ? (
    <section {...inspect("trust")} className={`grid grid-cols-2 gap-2 py-5 text-[10px] sm:grid-cols-4 ${inspect("trust").className ?? ""}`}>
      {theme.trust.showCodBadge ? <Trust icon={<BadgeCheck />} label={t("storefront.studio.cashOnDelivery")} /> : null}
      {theme.trust.showPhoneConfirmationBadge ? <Trust icon={<PhoneCall />} label={t("storefront.studio.phoneConfirmation")} /> : null}
      {theme.trust.showDeliveryBadge ? <Trust icon={<PackageCheck />} label={t("storefront.studio.homeDeskDelivery")} /> : null}
      {theme.trust.showSupportBadge ? <Trust icon={<Headphones />} label={t("storefront.studio.sellerSupport")} /> : null}
    </section>
  ) : null;

  if (theme.template === "atlas") {
    return (
      <div className="min-h-full p-6" style={{ background: theme.backgroundColor, color: theme.textColor }}>
        {enabled("announcement") && theme.announcement.enabled ? <Announcement {...inspect("announcement")} text={theme.announcement.text} color={theme.primaryColor} /> : null}
        {enabled("navbar") ? <header {...inspect("navbar")} className={`flex items-center justify-between border-b pb-4 ${inspect("navbar").className ?? ""}`}><b>{draft.name || t("storefront.studio.storeFallback")}</b><span className="text-xs opacity-50">{t("storefront.studio.catalogCod")}</span></header> : null}
        {enabled("hero") && theme.hero.enabled ? (
          <section {...inspect("hero")} className={`grid gap-8 py-10 md:grid-cols-2 ${inspect("hero").className ?? ""}`}>
            <HeroCopy draft={draft} />
            <div>{cards}</div>
          </section>
        ) : enabled("product-grid") ? <section {...inspect("product-grid")} className={`py-8 ${inspect("product-grid").className ?? ""}`}>{cards}</section> : null}
        {trust}
        {enabled("cod-checkout") ? <CodPromise draft={draft} sectionProps={inspect("cod-checkout")} /> : null}
      </div>
    );
  }

  if (theme.template === "oasis") {
    return (
      <div className="min-h-full p-5" style={{ background: theme.backgroundColor, color: theme.textColor }}>
        {enabled("announcement") && theme.announcement.enabled ? <Announcement {...inspect("announcement")} text={theme.announcement.text} color={theme.accentColor} /> : null}
        {enabled("hero") && theme.hero.enabled ? (
          <section {...inspect("hero")} className={`${radius(theme.radius)} p-7 text-center text-white ${inspect("hero").className ?? ""}`} style={{ background: theme.primaryColor }}>
            <span className="text-[10px] font-bold uppercase tracking-[.2em]">{theme.hero.eyebrow || t("storefront.studio.payOnDelivery")}</span>
            <h2 className="mx-auto mt-3 max-w-xl text-4xl font-black tracking-tight">{theme.hero.headline || draft.name}</h2>
            <p className="mx-auto mt-3 max-w-lg text-sm opacity-80">{theme.hero.body || draft.description}</p>
            <div className="mx-auto mt-5 inline-flex rounded-full bg-white px-5 py-2 text-xs font-bold" style={{ color: theme.primaryColor }}>{theme.hero.ctaLabel || t("storefront.studio.orderNow")}</div>
          </section>
        ) : null}
        {trust}
        {enabled("product-grid") ? <section {...inspect("product-grid")} className={`py-6 ${inspect("product-grid").className ?? ""}`}>{cards}</section> : null}
        {enabled("cod-checkout") ? <CodPromise draft={draft} sectionProps={inspect("cod-checkout")} /> : null}
      </div>
    );
  }

  return (
    <div className="min-h-full p-7" style={{ background: theme.backgroundColor, color: theme.textColor }}>
      {enabled("announcement") && theme.announcement.enabled ? <Announcement {...inspect("announcement")} text={theme.announcement.text} color={theme.primaryColor} /> : null}
      {enabled("navbar") ? <div {...inspect("navbar")} className={`text-xs font-semibold uppercase tracking-[.18em] ${inspect("navbar").className ?? ""}`}>{draft.name || "SahelFlow"}</div> : null}
      {enabled("hero") && theme.hero.enabled ? <section {...inspect("hero")} className={`mt-14 max-w-xl ${inspect("hero").className ?? ""}`}><HeroCopy draft={draft} /></section> : null}
      {enabled("product-grid") ? <section {...inspect("product-grid")} className={`mt-10 ${inspect("product-grid").className ?? ""}`}>{cards}</section> : null}
      {trust}
      {enabled("cod-checkout") ? <CodPromise draft={draft} sectionProps={inspect("cod-checkout")} /> : null}
    </div>
  );
}

function HeroCopy({ draft }: { draft: StorefrontPreviewProps["draft"] }) {
  const { t } = useI18n();
  const theme = draft.theme;
  return (
    <div>
      <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: theme.primaryColor }}>{theme.hero.eyebrow || t("storefront.studio.algeriaCod")}</span>
      <h2 className="mt-3 text-4xl font-semibold leading-none tracking-tight">{theme.hero.headline || draft.name}</h2>
      <p className="mt-4 text-sm leading-6 opacity-65">{theme.hero.body || draft.description}</p>
      <button type="button" className={`${radius(theme.radius)} mt-5 px-4 py-2 text-xs font-semibold text-white`} style={{ background: theme.primaryColor }}>{theme.hero.ctaLabel || t("storefront.studio.shopNow")}</button>
    </div>
  );
}

function Announcement({ text, color, className, ...props }: { text: string; color: string; className?: string; onClick?: (event: React.MouseEvent) => void }) {
  const { t } = useI18n();
  return <div {...props} className={`mb-4 rounded-lg px-3 py-2 text-center text-[11px] font-medium text-white ${className ?? ""}`} style={{ background: color }}>{text || t("storefront.studio.freePhoneConfirmation")}</div>;
}

function Trust({ icon, label }: { icon: React.ReactNode; label: string }) {
  return <div className="flex items-center gap-1.5 rounded-lg border bg-white/40 px-2 py-2 [&_svg]:h-3.5 [&_svg]:w-3.5"><span aria-hidden="true">{icon}</span><span>{label}</span></div>;
}

function CodPromise({ draft, sectionProps }: { draft: StorefrontPreviewProps["draft"]; sectionProps: InspectProps }) {
  const { t } = useI18n();
  const theme = draft.theme;
  return theme.checkout.showCodPromise ? <section {...sectionProps} className={`${radius(theme.radius)} mt-5 border p-4 text-center text-xs font-semibold`}>{theme.checkout.codPromiseText || t("storefront.studio.defaultCodPromise")}</section> : null;
}

function radius(value: StorefrontPreviewProps["draft"]["theme"]["radius"]): string {
  return value === "sharp" ? "rounded-none" : value === "rounded" ? "rounded-2xl" : "rounded-xl";
}
