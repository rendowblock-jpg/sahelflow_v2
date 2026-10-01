"use client";

import { BadgeCheck, ChevronDown, Quote } from "lucide-react";

import { useStorefrontI18n } from "@/components/storefront/storefront-locale-provider";
import { StorefrontHero } from "@/components/storefront/storefront-hero";
import {
  Container,
  EmptyStudioSection,
  StorefrontFooter,
  StorefrontHeader,
  StorefrontTrustStrip,
  SectionHeading,
  StorefrontContactBlock,
  blockText,
  hasContact,
  radius,
  sectionSpace,
  textSetting,
  type InspectProps,
} from "@/components/storefront/storefront-parts";
import { StorefrontProductGrid } from "@/components/storefront/storefront-product-grid";
import type { StorefrontSection } from "@/lib/storefront/studio-sections";
import { storefrontScheme, storefrontThemeStyle } from "@/lib/storefront/storefront-tokens";
import { cn } from "@/lib/utils";
import type {
  StorefrontPreviewProps,
  StorefrontStudioProduct,
} from "./studio/studio-types";

export interface StorefrontRendererProps extends StorefrontPreviewProps {
  selectedSectionId?: string | null;
  onInspectSection?: (id: string) => void;
  maxProducts?: number;
  embeddedPreview?: boolean;
  renderProductFooter?: (product: StorefrontStudioProduct) => React.ReactNode;
  renderCheckout?: React.ReactNode;
  renderSupport?: React.ReactNode;
  /** FD-061 EX-4: approved order-verified reviews section (public route only). */
  renderReviews?: React.ReactNode;
  /** Header controls (the public cart button). */
  renderHeaderActions?: React.ReactNode;
  emptyCatalog?: React.ReactNode;
}

/**
 * Canonical Storefront V2 renderer shared by Studio and customer routes.
 *
 * The root is a storefront theme root: the seller's palette becomes the
 * design tokens for everything inside (see `storefront-tokens.ts`). Sections
 * render in the seller's composition order, full-bleed with a centred
 * container; a footer always closes the page.
 */
export function StorefrontRenderer({
  draft,
  products,
  selectedSectionId,
  onInspectSection,
  maxProducts,
  embeddedPreview,
  renderProductFooter,
  renderCheckout,
  renderSupport,
  renderReviews,
  renderHeaderActions,
  emptyCatalog,
}: StorefrontRendererProps) {
  const { t } = useStorefrontI18n();
  const theme = draft.theme;
  const productMap = new Map(products.map((product) => [product.id, product]));
  const selectedProducts = draft.selectedProductIds
    .map((id) => productMap.get(id))
    .filter((product): product is StorefrontStudioProduct => Boolean(product));
  const visibleProducts =
    typeof maxProducts === "number"
      ? selectedProducts.slice(0, maxProducts)
      : selectedProducts;
  // Studio/bootstrap callers bound the preview with maxProducts while the
  // customer StorefrontView does not; `embeddedPreview` overrides explicitly so
  // a limited customer render never inherits preview heading semantics.
  const isEmbeddedPreview = embeddedPreview ?? typeof maxProducts === "number";
  const space = sectionSpace(theme.density);
  const bodySections = theme.builder.composition.sections.filter(
    (section) => section.type !== "footer",
  );
  const footerSections = theme.builder.composition.sections.filter(
    (section) => section.type === "footer",
  );
  const storeName = draft.name || t("storefront.studio.storeFallback");

  function inspect(section: StorefrontSection): InspectProps {
    if (!onInspectSection) return {};
    const selected = selectedSectionId === section.id;
    return {
      "data-studio-section": section.id,
      ...(selected ? { "data-studio-selected": "true" as const } : {}),
      onClick: (event: React.MouseEvent) => {
        event.stopPropagation();
        onInspectSection(section.id);
      },
      className: "relative cursor-pointer",
    };
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
            className={cn(props.className, "px-4 py-2.5 text-center text-[13px] font-medium")}
            style={
              theme.template === "oasis"
                ? { background: "var(--sf-accent)", color: "var(--sf-on-accent)" }
                : { background: "var(--primary)", color: "var(--primary-foreground)" }
            }
          >
            <span dir="auto">
              {theme.announcement.text || t("storefront.studio.freePhoneConfirmation")}
            </span>
          </div>
        );

      case "navbar":
        return (
          <StorefrontHeader
            key={section.id}
            inspectProps={props}
            theme={theme}
            storeName={storeName}
            sticky={!isEmbeddedPreview}
            actions={renderHeaderActions}
          />
        );
      case "hero":
        if (!theme.hero.enabled) return null;
        return (
          <StorefrontHero
            key={section.id}
            theme={theme}
            name={storeName}
            description={draft.description}
            products={visibleProducts}
            embedded={isEmbeddedPreview}
            inspectProps={props}
          />
        );

      case "trust":
        return <StorefrontTrustStrip key={section.id} inspectProps={props} theme={theme} />;
      case "featured-products":
      case "product-grid": {
        const catalogProducts =
          section.type === "featured-products" ? visibleProducts.slice(0, 4) : visibleProducts;
        const title = textSetting(section, "title");
        return (
          <section
            key={section.id}
            {...props}
            id={section.type === "product-grid" ? "storefront-catalog" : undefined}
            className={cn(props.className, space, "scroll-mt-20")}
          >
            <Container>
              <SectionHeading
                title={title || t("storefront.view.navProducts")}
                embedded={isEmbeddedPreview}
                aside={
                  catalogProducts.length > 0 ? (
                    <span className="text-sm text-muted-foreground">
                      {t("storefront.view.productsCount", { count: catalogProducts.length })}
                    </span>
                  ) : null
                }
              />
              {catalogProducts.length === 0 ? (
                emptyCatalog ?? (
                  <p className="text-sm text-muted-foreground">{t("storefront.view.noProducts")}</p>
                )
              ) : (
                <StorefrontProductGrid
                  products={catalogProducts}
                  theme={theme}
                  embedded={isEmbeddedPreview}
                  renderProductFooter={renderProductFooter}
                />
              )}
            </Container>
          </section>
        );
      }

      case "categories": {
        const title = textSetting(section, "title");
        const collections = theme.builder.collections.filter((collection) => collection.enabled);
        if (collections.length === 0) {
          return onInspectSection ? (
            <EmptyStudioSection key={section.id} section={section} props={props} label={t("storefront.studio.section.categories")} />
          ) : null;
        }
        return (
          <section key={section.id} {...props} className={cn(props.className, "py-6")}>
            <Container>
              {title ? <p dir="auto" className="mb-3 text-sm font-semibold">{title}</p> : null}
              <nav className="flex flex-wrap gap-2">
                {collections.map((collection) => (
                  <span key={collection.id} className="rounded-full border bg-card px-4 py-2 text-sm font-medium">
                    {collection.title}
                  </span>
                ))}
              </nav>
            </Container>
          </section>
        );
      }

      case "media": {
        const eyebrow = textSetting(section, "eyebrow");
        const title = textSetting(section, "title");
        const body = textSetting(section, "body");
        const imageUrl = textSetting(section, "imageUrl");
        const imageAlt = textSetting(section, "imageAlt");
        const align = textSetting(section, "align");
        const hasImage = /^https:\/\//i.test(imageUrl);
        if (!(eyebrow || title || body || hasImage)) {
          return onInspectSection ? (
            <EmptyStudioSection key={section.id} section={section} props={props} label={t("storefront.studio.section.media")} />
          ) : null;
        }
        return (
          <section key={section.id} {...props} className={cn(props.className, space)}>
            <Container>
              <div className={cn(radius(theme.radius), "grid items-stretch overflow-hidden border bg-card", hasImage && "@3xl:grid-cols-2")}>
                {hasImage ? (
                  <div data-sf-media="true" className={cn("relative min-h-64", align === "media-end" && "@3xl:order-2")}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- merchant-authored HTTPS media */}
                    <img src={imageUrl} alt={imageAlt || title || draft.name} className="absolute inset-0 size-full object-cover" loading="lazy" />
                  </div>
                ) : null}
                <div className="flex flex-col justify-center p-8 @min-[40rem]:p-12">
                  {eyebrow ? (
                    <p dir="auto" className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--sf-brand-text-on-surface)" }}>
                      {eyebrow}
                    </p>
                  ) : null}
                  {title ? (
                    <h2 dir="auto" className="mt-3 text-2xl font-semibold tracking-tight @min-[40rem]:text-3xl">{title}</h2>
                  ) : null}
                  {body ? (
                    <p dir="auto" className="mt-4 whitespace-pre-wrap text-base leading-7 text-muted-foreground">{body}</p>
                  ) : null}
                </div>
              </div>
            </Container>
          </section>
        );
      }

      case "testimonials": {
        const title = textSetting(section, "title");
        const entries = section.blocks.filter((block) => blockText(block, "quote"));
        if (entries.length === 0) {
          return onInspectSection ? (
            <EmptyStudioSection key={section.id} section={section} props={props} label={t("storefront.studio.section.testimonials")} />
          ) : null;
        }
        return (
          <section key={section.id} {...props} className={cn(props.className, space)}>
            <Container>
              <SectionHeading title={title || t("storefront.view.reviewsTitle")} embedded={isEmbeddedPreview} />
              <div className="grid gap-4 @3xl:grid-cols-2 @7xl:grid-cols-3">
                {entries.map((entry) => {
                  const name = blockText(entry, "name");
                  const role = blockText(entry, "role");
                  return (
                    <figure key={entry.id} className={cn(radius(theme.radius), "flex flex-col border bg-card p-6")}>
                      <Quote className="size-6" style={{ color: "var(--sf-brand-text-on-surface)" }} aria-hidden="true" />
                      <blockquote dir="auto" className="mt-3 flex-1 text-base leading-7">
                        “{blockText(entry, "quote")}”
                      </blockquote>
                      {name || role ? (
                        <figcaption className="mt-5 text-sm">
                          {name ? <strong dir="auto" className="block font-semibold">{name}</strong> : null}
                          {role ? <span dir="auto" className="text-muted-foreground">{role}</span> : null}
                        </figcaption>
                      ) : null}
                    </figure>
                  );
                })}
              </div>
            </Container>
          </section>
        );
      }

      case "faq": {
        const title = textSetting(section, "title");
        const entries = section.blocks.filter(
          (block) => blockText(block, "question") && blockText(block, "answer"),
        );
        if (entries.length === 0) {
          return onInspectSection ? (
            <EmptyStudioSection key={section.id} section={section} props={props} label={t("storefront.studio.section.faq")} />
          ) : null;
        }
        return (
          <section key={section.id} {...props} className={cn(props.className, space)}>
            <Container className="max-w-3xl">
              <SectionHeading title={title || t("storefront.view.faqTitle")} embedded={isEmbeddedPreview} />
              <div className={cn(radius(theme.radius), "divide-y overflow-hidden border bg-card")}>
                {entries.map((entry) => (
                  <details key={entry.id} className="group/faq px-5 py-4">
                    <summary dir="auto" className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-medium [&::-webkit-details-marker]:hidden">
                      {blockText(entry, "question")}
                      <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open/faq:rotate-180" aria-hidden="true" />
                    </summary>
                    <p dir="auto" className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                      {blockText(entry, "answer")}
                    </p>
                  </details>
                ))}
              </div>
            </Container>
          </section>
        );
      }

      case "cod-checkout":
        return (
          <section key={section.id} {...props} id="storefront-checkout" className={cn(props.className, space, "scroll-mt-20")}>
            <Container>
              <SectionHeading
                title={t("storefront.view.completeOrder")}
                embedded={isEmbeddedPreview}
                aside={
                  theme.checkout.showCodPromise ? (
                    <p dir="auto" className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                      <BadgeCheck className="size-4" style={{ color: "var(--sf-brand-text)" }} aria-hidden="true" />
                      {theme.checkout.codPromiseText || t("storefront.studio.defaultCodPromise")}
                    </p>
                  ) : null
                }
              />
              {renderCheckout ?? (
                <p className="text-sm text-muted-foreground">{t("storefront.view.completeOrderHint")}</p>
              )}
            </Container>
          </section>
        );

      case "support": {
        const authoredSupport = hasContact(theme.builder.contact) ? (
          <StorefrontContactBlock contact={theme.builder.contact} radiusValue={theme.radius} />
        ) : null;
        const support = authoredSupport ?? renderSupport;
        return support ? (
          <section key={section.id} {...props} id="storefront-contact" className={cn(props.className, space, "scroll-mt-20")}>
            <Container>
              <SectionHeading title={t("storefront.view.contactTitle")} embedded={isEmbeddedPreview} />
              {support}
            </Container>
          </section>
        ) : onInspectSection ? (
          <EmptyStudioSection key={section.id} section={section} props={props} label={t("storefront.studio.section.support")} />
        ) : null;
      }

      case "footer":
        return (
          <StorefrontFooter
            key={section.id}
            inspectProps={props}
            name={draft.name}
            tagline={textSetting(section, "tagline")}
          />
        );
    }
  }

  return (
    <div
      data-storefront-root="true"
      data-sf-scheme={storefrontScheme(theme)}
      data-storefront-template={theme.template}
      className="@container min-h-full"
      style={storefrontThemeStyle(theme)}
    >
      {bodySections.map(renderSection)}
      {/* FD-061 EX-4: approved order-verified reviews ride below the composed
          sections. Studio previews pass nothing, so the slot is invisible to
          the seller authoring surface. */}
      {renderReviews ? <Container className={space}>{renderReviews}</Container> : null}
      {footerSections.map(renderSection)}
    </div>
  );
}
