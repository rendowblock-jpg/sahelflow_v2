"use client";

import { BadgeCheck, Headphones, PackageCheck, PhoneCall } from "lucide-react";

import { useI18n } from "@/hooks/use-i18n";
import type { StorefrontSection, StorefrontSectionType } from "@/lib/storefront/studio-sections";
import { formatDZD } from "@/lib/utils";
import type { StorefrontPreviewProps, StorefrontStudioProduct } from "./studio/studio-types";
import { studioImageUrl } from "./studio/studio-types";

type InspectProps = React.HTMLAttributes<HTMLElement> & { "data-studio-section"?: string };

export interface StorefrontRendererProps extends StorefrontPreviewProps {
  selectedSectionId?: string | null;
  onInspectSection?: (id: string) => void;
  maxProducts?: number;
  renderProductFooter?: (product: StorefrontStudioProduct) => React.ReactNode;
  renderCheckout?: React.ReactNode;
  renderSupport?: React.ReactNode;
  emptyCatalog?: React.ReactNode;
}

/**
 * Canonical Storefront V2 renderer.
 *
 * Studio and customer routes share this exact composition/template renderer.
 * Authoring overlays are added only when onInspectSection is supplied, so
 * editor state and controls cannot leak into the public storefront.
 */
export function StorefrontRenderer({
  draft,
  products,
  selectedSectionId,
  onInspectSection,
  maxProducts,
  renderProductFooter,
  renderCheckout,
  renderSupport,
  emptyCatalog,
}: StorefrontRendererProps) {
  const { t } = useI18n();
  const theme = draft.theme;
  const productMap = new Map(products.map((product) => [product.id, product]));
  const selectedProducts = draft.selectedProductIds
    .map((id) => productMap.get(id))
    .filter((product): product is StorefrontStudioProduct => Boolean(product));
  const visibleProducts = typeof maxProducts === "number"
    ? selectedProducts.slice(0, maxProducts)
    : selectedProducts;

  function inspect(section: StorefrontSection): InspectProps {
    if (!onInspectSection) return {};
    return {
      "data-studio-section": section.id,
      onClick: (event: React.MouseEvent) => {
        event.stopPropagation();
        onInspectSection(section.id);
      },
      className: selectedSectionId === section.id
        ? "ring-2 ring-primary ring-offset-2"
        : undefined,
    };
  }

  function sectionClass(section: StorefrontSection, classes: string): string {
    return `${classes} ${inspect(section).className ?? ""}`.trim();
  }

  function renderSection(section: StorefrontSection): React.ReactNode {
    if (!section.enabled) return null;
    const props = inspect(section);
    switch (section.type) {
      case "announcement":
        if (!theme.announcement.enabled) return null;
        return (
          <div
            key={section.id}
            {...props}
            className={sectionClass(section, "mb-4 rounded-lg px-3 py-2 text-center text-[11px] font-medium text-white")}
            style={{ background: theme.template === "oasis" ? theme.accentColor : theme.primaryColor }}
          >
            {theme.announcement.text || t("storefront.studio.freePhoneConfirmation")}
          </div>
        );
      case "navbar":
        return (
          <header
            key={section.id}
            {...props}
            className={sectionClass(section, theme.template === "sahara"
              ? "text-xs font-semibold uppercase tracking-[.18em]"
              : "flex items-center justify-between border-b pb-4")}
          >
            <b>{draft.name || t("storefront.studio.storeFallback")}</b>
            {theme.template === "sahara" ? null : (
              <span className="text-xs font-normal opacity-50">{t("storefront.studio.catalogCod")}</span>
            )}
          </header>
        );
      case "hero":
        if (!theme.hero.enabled) return null;
        return (
          <section
            key={section.id}
            {...props}
            className={sectionClass(section, heroClass(theme.template, theme.radius))}
            style={theme.template === "oasis" ? { background: theme.primaryColor } : undefined}
          >
            <span
              className="text-[10px] font-bold uppercase tracking-widest"
              style={theme.template === "oasis" ? undefined : { color: theme.primaryColor }}
            >
              {theme.hero.eyebrow || (theme.template === "oasis"
                ? t("storefront.studio.payOnDelivery")
                : t("storefront.studio.algeriaCod"))}
            </span>
            <h1 className="mt-3 text-4xl font-semibold leading-none tracking-tight">
              {theme.hero.headline || draft.name}
            </h1>
            <p className="mt-4 text-sm leading-6 opacity-70">
              {theme.hero.body || draft.description}
            </p>
            <span
              className={`${radius(theme.radius)} mt-5 inline-flex px-4 py-2 text-xs font-semibold ${theme.template === "oasis" ? "bg-white" : "text-white"}`}
              style={theme.template === "oasis"
                ? { color: theme.primaryColor }
                : { background: theme.primaryColor }}
            >
              {theme.hero.ctaLabel || (theme.template === "oasis"
                ? t("storefront.studio.orderNow")
                : t("storefront.studio.shopNow"))}
            </span>
          </section>
        );
      case "trust":
        return (
          <section
            key={section.id}
            {...props}
            className={sectionClass(section, "grid grid-cols-2 gap-2 py-5 text-[10px] sm:grid-cols-4")}
          >
            {theme.trust.showCodBadge ? <Trust icon={<BadgeCheck />} label={t("storefront.studio.cashOnDelivery")} /> : null}
            {theme.trust.showPhoneConfirmationBadge ? <Trust icon={<PhoneCall />} label={t("storefront.studio.phoneConfirmation")} /> : null}
            {theme.trust.showDeliveryBadge ? <Trust icon={<PackageCheck />} label={t("storefront.studio.homeDeskDelivery")} /> : null}
            {theme.trust.showSupportBadge ? <Trust icon={<Headphones />} label={t("storefront.studio.sellerSupport")} /> : null}
          </section>
        );
      case "featured-products":
      case "product-grid": {
        const catalogProducts = section.type === "featured-products"
          ? visibleProducts.slice(0, 4)
          : visibleProducts;
        return (
          <section
            key={section.id}
            {...props}
            className={sectionClass(section, theme.template === "sahara" ? "mt-10" : "py-6")}
          >
            {catalogProducts.length === 0
              ? emptyCatalog ?? <p className="text-sm opacity-60">{t("storefront.view.noProducts")}</p>
              : <ProductGrid products={catalogProducts} draft={draft} renderProductFooter={renderProductFooter} />}
          </section>
        );
      }
      case "categories": {
        const collections = theme.builder.collections.filter((collection) => collection.enabled);
        if (collections.length === 0) return onInspectSection ? <EmptyStudioSection key={section.id} section={section} props={props} label={t("storefront.studio.section.categories")} /> : null;
        return (
          <nav key={section.id} {...props} className={sectionClass(section, "flex flex-wrap gap-2 py-4")}>
            {collections.map((collection) => (
              <span key={collection.id} className={`${radius(theme.radius)} border px-3 py-1.5 text-xs font-medium`}>
                {collection.title}
              </span>
            ))}
          </nav>
        );
      }
      case "cod-checkout":
        return (
          <section key={section.id} {...props} className={sectionClass(section, `${radius(theme.radius)} mt-5 space-y-5 border p-4`)}>
            {theme.checkout.showCodPromise ? (
              <p className="text-center text-xs font-semibold">
                {theme.checkout.codPromiseText || t("storefront.studio.defaultCodPromise")}
              </p>
            ) : null}
            {renderCheckout}
          </section>
        );
      case "support":
        return renderSupport ? (
          <section key={section.id} {...props} className={sectionClass(section, "py-5")}>
            {renderSupport}
          </section>
        ) : onInspectSection ? <EmptyStudioSection key={section.id} section={section} props={props} label={t("storefront.studio.section.support")} /> : null;
      case "footer":
        return (
          <footer key={section.id} {...props} className={sectionClass(section, "mt-6 border-t pt-5 text-center text-[11px] opacity-60")}>
            {draft.name} · SahelFlow
          </footer>
        );
      case "media":
      case "testimonials":
      case "faq":
        return onInspectSection ? <EmptyStudioSection key={section.id} section={section} props={props} label={t(sectionLabelKey(section.type))} /> : null;
    }
  }

  return (
    <div
      className={`min-h-full ${theme.template === "sahara" ? "p-7" : theme.template === "oasis" ? "p-5" : "p-6"}`}
      data-storefront-template={theme.template}
      style={{ background: theme.backgroundColor, color: theme.textColor }}
    >
      {theme.builder.composition.sections.map(renderSection)}
    </div>
  );
}

function ProductGrid({
  products,
  draft,
  renderProductFooter,
}: {
  products: readonly StorefrontStudioProduct[];
  draft: StorefrontPreviewProps["draft"];
  renderProductFooter?: (product: StorefrontStudioProduct) => React.ReactNode;
}) {
  const { t } = useI18n();
  const theme = draft.theme;
  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 ${theme.density === "compact" ? "gap-2" : "gap-4"}`}>
      {products.map((product) => {
        const image = studioImageUrl(product.images);
        const ratio = theme.catalog.imageRatio === "portrait"
          ? "aspect-[4/5]"
          : theme.catalog.imageRatio === "landscape" ? "aspect-[4/3]" : "aspect-square";
        return (
          <article
            key={product.id}
            className={`overflow-hidden border ${radius(theme.radius)} ${theme.catalog.cardStyle === "elevated" ? "shadow-sm" : ""}`}
            style={{ background: theme.surfaceColor }}
          >
            {image ? (
              <img src={image} alt={product.name} className={`${ratio} w-full object-cover`} loading="lazy" />
            ) : (
              <div className={`${ratio} opacity-20`} style={{ background: theme.accentColor }} />
            )}
            <div className="space-y-2 p-3">
              <div className="text-sm font-semibold">{product.name}</div>
              {theme.catalog.showSku && product.sku ? <div className="text-[10px] opacity-50">{product.sku}</div> : null}
              {theme.showPrices ? <div className="text-xs font-semibold" style={{ color: theme.primaryColor }}>{formatDZD(product.price)}</div> : null}
              {theme.showStock ? <div className="text-[10px] opacity-60">{t("storefront.studio.stockCount", { count: product.stock })}</div> : null}
              {renderProductFooter?.(product)}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function Trust({ icon, label }: { icon: React.ReactNode; label: string }) {
  return <div className="flex items-center gap-1.5 rounded-lg border bg-white/40 px-2 py-2 [&_svg]:h-3.5 [&_svg]:w-3.5"><span aria-hidden="true">{icon}</span><span>{label}</span></div>;
}

function EmptyStudioSection({ section, props, label }: { section: StorefrontSection; props: InspectProps; label: string }) {
  return <section key={section.id} {...props} className={`${props.className ?? ""} my-3 rounded-lg border border-dashed p-4 text-center text-xs opacity-60`}>{label}</section>;
}

function heroClass(template: StorefrontPreviewProps["draft"]["theme"]["template"], radiusValue: StorefrontPreviewProps["draft"]["theme"]["radius"]): string {
  if (template === "oasis") return `${radius(radiusValue)} p-7 text-center text-white`;
  if (template === "atlas") return "max-w-2xl py-10";
  return "mt-14 max-w-xl";
}

function sectionLabelKey(type: StorefrontSectionType): string {
  if (type === "testimonials") return "storefront.studio.section.testimonials";
  if (type === "faq") return "storefront.studio.section.faq";
  return "storefront.studio.section.media";
}

function radius(value: StorefrontPreviewProps["draft"]["theme"]["radius"]): string {
  return value === "sharp" ? "rounded-none" : value === "rounded" ? "rounded-2xl" : "rounded-xl";
}
