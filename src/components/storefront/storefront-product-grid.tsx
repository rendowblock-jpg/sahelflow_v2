"use client";

import { Package } from "lucide-react";

import { useStorefrontI18n } from "@/components/storefront/storefront-locale-provider";
import { radius } from "@/components/storefront/storefront-parts";
import type { StorefrontTheme } from "@/lib/storefront/presentation-types";
import { cn, formatDZD } from "@/lib/utils";
import type { StorefrontStudioProduct } from "./studio/studio-types";
import { studioImageUrl } from "./studio/studio-types";

const LOW_STOCK = 5;

/**
 * The catalog: two columns on phones, three on tablets, four on desktop.
 * Card style (minimal / elevated / outlined), image ratio and density come
 * from the theme; a product without a photo shows a branded placeholder with
 * its initial instead of an empty block.
 */
export function StorefrontProductGrid({
  products,
  theme,
  embedded,
  renderProductFooter,
}: {
  products: readonly StorefrontStudioProduct[];
  theme: StorefrontTheme;
  embedded: boolean;
  renderProductFooter?: (product: StorefrontStudioProduct) => React.ReactNode;
}) {
  const { t, locale } = useStorefrontI18n();
  const ratio =
    theme.catalog.imageRatio === "portrait"
      ? "aspect-[4/5]"
      : theme.catalog.imageRatio === "landscape"
        ? "aspect-[4/3]"
        : "aspect-square";
  const card = theme.catalog.cardStyle;
  const Title = embedded ? "h4" : "h3";

  return (
    <ul
      className={cn(
        "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4",
        theme.density === "compact" ? "gap-3" : "gap-x-4 gap-y-8 sm:gap-x-6",
      )}
    >
      {products.map((product) => {
        const image = studioImageUrl(product.images);
        const soldOut = product.stock <= 0;
        const low = !soldOut && product.stock <= LOW_STOCK;
        return (
          <li key={product.id}>
            <article
              data-storefront-product={product.id}
              className={cn(
                "group/product flex h-full flex-col overflow-hidden",
                radius(theme.radius),
                card === "outlined" && "border bg-card",
                card === "elevated" && "bg-card shadow-[0_1px_2px_rgb(0_0_0/0.06),0_8px_24px_-12px_rgb(0_0_0/0.18)]",
              )}
            >
              <div
                data-sf-media="true"
                className={cn(
                  "relative overflow-hidden",
                  ratio,
                  card === "minimal" && radius(theme.radius),
                )}
              >
                {image ? (
                  // eslint-disable-next-line @next/next/no-img-element -- seller media, bounded by storefront media authority
                  <img
                    src={image}
                    alt={product.name}
                    loading="lazy"
                    className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover/product:scale-[1.03]"
                  />
                ) : (
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 flex flex-col items-center justify-center gap-2"
                  >
                    <Package className="size-8" style={{ color: "var(--sf-placeholder-ink)" }} />
                    <span
                      className="text-2xl font-semibold"
                      style={{ color: "var(--sf-placeholder-ink)" }}
                    >
                      {product.name.trim().charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                {soldOut || (low && theme.showStock) ? (
                  <span
                    className="absolute start-2 top-2 rounded-full px-2.5 py-1 text-[11px] font-semibold shadow-sm"
                    style={
                      soldOut
                        ? { background: "var(--foreground)", color: "var(--background)" }
                        : { background: "var(--sf-accent)", color: "var(--sf-on-accent)" }
                    }
                  >
                    {soldOut
                      ? t("storefront.view.outOfStock")
                      : t("storefront.view.lowStock", { count: product.stock })}
                  </span>
                ) : null}
              </div>
              <div
                className={cn(
                  "flex flex-1 flex-col gap-1.5",
                  card === "minimal" ? "pt-3" : "p-3 sm:p-4",
                )}
              >
                <Title dir="auto" className="line-clamp-2 text-sm font-medium leading-5 sm:text-[15px]">
                  {product.name}
                </Title>
                {theme.catalog.showSku && product.sku ? (
                  <p dir="ltr" className="text-xs text-muted-foreground">{product.sku}</p>
                ) : null}
                {theme.showPrices ? (
                  <p
                    className="text-[15px] font-semibold tabular-nums"
                    style={{ color: card === "minimal" ? "var(--sf-brand-text)" : "var(--sf-brand-text-on-surface)" }}
                  >
                    {formatDZD(product.price, locale)}
                  </p>
                ) : null}
                {theme.showStock && !soldOut && !low ? (
                  <p className="text-xs text-muted-foreground">
                    {t("storefront.studio.stockCount", { count: product.stock })}
                  </p>
                ) : null}
                {renderProductFooter ? (
                  <div className="mt-auto pt-2">{renderProductFooter(product)}</div>
                ) : null}
              </div>
            </article>
          </li>
        );
      })}
    </ul>
  );
}
