import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { cookies, headers } from "next/headers";

import { StorefrontView } from "@/components/storefront/storefront-view";
import { db, shopContext } from "@/lib/db";
import type { Locale } from "@/lib/i18n";
import {
  createStorefrontTranslator,
  resolveStorefrontLocale,
  STOREFRONT_LOCALE_COOKIE,
  STOREFRONT_LOCALE_QUERY_PARAM,
} from "@/lib/i18n/storefront-locale";
import { storefrontService } from "@/lib/storefront/service";
import { projectPublicStorefrontConfig } from "@/lib/storefront/public-projection";

export const dynamic = "force-dynamic";

type StorefrontSearchParams = Record<string, string | string[] | undefined>;

/**
 * Resolve the BUYER locale for the public storefront (R4-c):
 * `?lang=` > `sf-storefront-locale` cookie > Accept-Language > fr.
 *
 * The seller dashboard cookie (`sahelflow-locale`) is deliberately never read
 * here — the buyer, not the seller session, owns this document's language.
 * Nothing is persisted on detection: the cookie is written only when the
 * buyer explicitly flips the storefront language switcher.
 */
async function resolveBuyerLocale(
  queryLang: string | string[] | undefined,
): Promise<Locale> {
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()]);
  const queryValue = Array.isArray(queryLang) ? queryLang[0] : queryLang;
  const { locale } = resolveStorefrontLocale({
    queryLang: queryValue ?? null,
    cookieLocale: cookieStore.get(STOREFRONT_LOCALE_COOKIE)?.value ?? null,
    acceptLanguage: headerList.get("accept-language"),
  });
  return locale;
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<StorefrontSearchParams>;
}): Promise<Metadata> {
  const [{ slug }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const config = await storefrontService.getBySlug(
    { prisma: db, shop: shopContext },
    slug,
  );
  const buyerLocale = await resolveBuyerLocale(
    resolvedSearchParams?.[STOREFRONT_LOCALE_QUERY_PARAM],
  );
  const t = createStorefrontTranslator(buyerLocale);
  if (!config) return { title: t("metadata.title.storefrontNotFound") };
  const seo = config.theme.builder.seo;
  return {
    title: seo.title.trim() || `${config.name} — SahelFlow`,
    description: seo.description.trim() || config.description || undefined,
    robots: seo.noIndex ? { index: false, follow: false } : undefined,
  };
}

export default async function StorefrontPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<StorefrontSearchParams>;
}) {
  const [{ slug }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const buyerLocale = await resolveBuyerLocale(
    resolvedSearchParams?.[STOREFRONT_LOCALE_QUERY_PARAM],
  );
  const config = await storefrontService.getBySlug(
    { prisma: db, shop: shopContext },
    slug,
  );
  if (!config?.isActive) notFound();

  const products =
    config.productIds.length > 0
      ? await db.product.findMany({
          where: {
            id: { in: config.productIds },
            isActive: true,
            deletedAt: null,
          },
          select: {
            id: true,
            name: true,
            price: true,
            sku: true,
            images: true,
            stock: true,
            productVariants: {
              where: { isActive: true },
              orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
              select: {
                id: true,
                name: true,
                price: true,
                stock: true,
                isActive: true,
              },
            },
          },
        })
      : [];

  return (
    <StorefrontView
      config={projectPublicStorefrontConfig(config)}
      products={products}
      initialLocale={buyerLocale}
    />
  );
}
