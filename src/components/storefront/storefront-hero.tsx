"use client";

import { ArrowRight, Package } from "lucide-react";

import { useStorefrontI18n } from "@/components/storefront/storefront-locale-provider";
import {
  Container,
  radius,
  type InspectProps,
} from "@/components/storefront/storefront-parts";
import type { StorefrontTheme } from "@/lib/storefront/presentation-types";
import { cn } from "@/lib/utils";
import type { StorefrontStudioProduct } from "./studio/studio-types";
import { studioImageUrl } from "./studio/studio-types";

/**
 * The store's opening statement. `hero.style` decides the layout:
 * - editorial: a large left-aligned statement beside a product mosaic;
 * - split: statement and one featured product side by side;
 * - centered: a full-width brand band.
 * Product photos come from the store's own selection; without photos the
 * media side becomes a quiet brand panel instead of an empty box.
 */
export function StorefrontHero({
  theme,
  name,
  description,
  products,
  embedded,
  inspectProps,
}: {
  theme: StorefrontTheme;
  name: string;
  description: string;
  products: readonly StorefrontStudioProduct[];
  embedded: boolean;
  inspectProps: InspectProps;
}) {
  const { t } = useStorefrontI18n();
  const style = theme.hero.style;
  const images = products
    .map((product) => ({ product, url: studioImageUrl(product.images) }))
    .filter((entry): entry is { product: StorefrontStudioProduct; url: string } =>
      Boolean(entry.url),
    );
  const eyebrow =
    theme.hero.eyebrow ||
    (style === "centered"
      ? t("storefront.studio.payOnDelivery")
      : t("storefront.studio.algeriaCod"));
  const headline = theme.hero.headline || name;
  const body = theme.hero.body || description;
  const cta =
    theme.hero.ctaLabel ||
    (style === "centered" ? t("storefront.studio.orderNow") : t("storefront.studio.shopNow"));
  const Heading = embedded ? "h2" : "h1";
  const button = cn(
    radius(theme.radius),
    "inline-flex min-h-11 items-center gap-2 px-6 text-sm font-semibold shadow-sm transition-transform hover:-translate-y-px",
  );

  if (style === "centered") {
    return (
      <section {...inspectProps} className={cn(inspectProps.className, "py-6 @min-[40rem]:py-8")}>
        <Container>
          <div
            className={cn(radius(theme.radius), "px-6 py-14 text-center @min-[40rem]:px-12 @min-[40rem]:py-20")}
            style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
          >
            <p dir="auto" className="text-xs font-semibold uppercase tracking-[0.16em] opacity-85">
              {eyebrow}
            </p>
            <Heading
              dir="auto"
              className="mx-auto mt-4 max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight @min-[40rem]:text-5xl @5xl:text-6xl"
              style={{ color: "inherit" }}
            >
              {headline}
            </Heading>
            {body ? (
              <p dir="auto" className="mx-auto mt-5 max-w-xl text-base leading-7 opacity-85 @min-[40rem]:text-lg">
                {body}
              </p>
            ) : null}
            <a
              href="#storefront-catalog"
              className={cn(button, "mt-8")}
              style={{ background: "var(--primary-foreground)", color: "var(--primary)" }}
            >
              {cta}
              <ArrowRight className="size-4 icon-rtl-flip" aria-hidden="true" />
            </a>
          </div>
        </Container>
      </section>
    );
  }

  const featured = images[0] ?? null;
  const mosaic = images.slice(0, 3);

  return (
    <section {...inspectProps} className={cn(inspectProps.className, "py-10 @min-[40rem]:py-16 @5xl:py-20")}>
      <Container className="grid items-center gap-10 @5xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] @5xl:gap-16">
        <div>
          <p
            dir="auto"
            className="text-xs font-semibold uppercase tracking-[0.16em]"
            style={{ color: "var(--sf-brand-text)" }}
          >
            {eyebrow}
          </p>
          <Heading
            dir="auto"
            className="mt-4 text-4xl font-semibold leading-[1.05] tracking-tight @min-[40rem]:text-5xl @5xl:text-6xl"
          >
            {headline}
          </Heading>
          {body ? (
            <p dir="auto" className="mt-5 max-w-xl text-base leading-7 text-muted-foreground @min-[40rem]:text-lg">
              {body}
            </p>
          ) : null}
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a
              href="#storefront-catalog"
              className={button}
              style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
            >
              {cta}
              <ArrowRight className="size-4 icon-rtl-flip" aria-hidden="true" />
            </a>
          </div>
        </div>

        {style === "split" ? (
          <HeroMedia
            radiusValue={theme.radius}
            url={featured?.url ?? null}
            alt={featured?.product.name ?? name}
            className="aspect-[4/5] @min-[40rem]:aspect-[5/4] @5xl:aspect-[4/5]"
          />
        ) : mosaic[0] && mosaic[1] ? (
          <div className="grid grid-cols-2 gap-3 @min-[40rem]:gap-4">
            <HeroMedia
              radiusValue={theme.radius}
              url={mosaic[0].url}
              alt={mosaic[0].product.name}
              className="row-span-2 aspect-[3/4] h-full"
            />
            <HeroMedia
              radiusValue={theme.radius}
              url={mosaic[1].url}
              alt={mosaic[1].product.name}
              className="aspect-square"
            />
            <HeroMedia
              radiusValue={theme.radius}
              url={mosaic[2]?.url ?? null}
              alt={mosaic[2]?.product.name ?? name}
              className="aspect-square"
            />
          </div>
        ) : (
          <HeroMedia
            radiusValue={theme.radius}
            url={featured?.url ?? null}
            alt={featured?.product.name ?? name}
            className="aspect-[5/4]"
          />
        )}
      </Container>
    </section>
  );
}

function HeroMedia({
  url,
  alt,
  radiusValue,
  className,
}: {
  url: string | null;
  alt: string;
  radiusValue: StorefrontTheme["radius"];
  className?: string;
}) {
  return (
    <div
      data-sf-media="true"
      className={cn(radius(radiusValue), "relative w-full overflow-hidden", className)}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- seller media, bounded by storefront media authority
        <img src={url} alt={alt} className="absolute inset-0 size-full object-cover" />
      ) : (
        <div
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center"
          style={{
            background:
              "radial-gradient(120% 90% at 20% 10%, color-mix(in srgb, var(--primary) 22%, transparent), transparent 60%), radial-gradient(90% 80% at 90% 90%, color-mix(in srgb, var(--sf-accent) 26%, transparent), transparent 55%)",
          }}
        >
          <Package className="size-14 opacity-40" style={{ color: "var(--sf-placeholder-ink)" }} />
        </div>
      )}
    </div>
  );
}
