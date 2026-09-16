import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { cookies, headers } from "next/headers";

import { LandingPageView } from "@/components/storefront/landing-page-view";
import { db, shopContext } from "@/lib/db";
import type { Locale } from "@/lib/i18n";
import {
  resolveStorefrontLocale,
  STOREFRONT_LOCALE_COOKIE,
  STOREFRONT_LOCALE_QUERY_PARAM,
} from "@/lib/i18n/storefront-locale";
import { storefrontService } from "@/lib/storefront/service";
import {
  getPublicLandingPage,
  recordLandingPageView,
} from "@/lib/storefront/landing-page-service";
import { projectPublicStorefrontConfig } from "@/lib/storefront/public-projection";

export const dynamic = "force-dynamic";

type StorefrontSearchParams = Record<string, string | string[] | undefined>;

/**
 * Resolve the BUYER locale exactly as the storefront home does (R4-c):
 * `?lang=` > `sf-storefront-locale` cookie > Accept-Language > fr. The
 * seller dashboard cookie is deliberately never read here.
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
}: {
  params: Promise<{ slug: string; page: string }>;
}): Promise<Metadata> {
  const { slug, page: pageSlug } = await params;
  const page = await getPublicLandingPage(
    { prisma: db, shop: shopContext },
    { storefrontSlug: slug, slug: pageSlug },
  );
  if (!page) return { title: "SahelFlow" };
  return {
    title: page.metaTitle?.trim() || page.name,
    description: page.metaDescription?.trim() || undefined,
  };
}

/**
 * FD-061 EX-4: the public per-product landing page
 * (/storefront/<slug>/lp/<page>). Published pages only, product
 * live-validated against the storefront catalog. The views counter is a
 * failure-isolated side channel — recorded after the render source is
 * resolved, never able to break the page.
 */
export default async function LandingPageRoute({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; page: string }>;
  searchParams: Promise<StorefrontSearchParams>;
}) {
  const [{ slug, page: pageSlug }, resolvedSearchParams] = await Promise.all([
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

  const page = await getPublicLandingPage(
    { prisma: db, shop: shopContext },
    { storefrontSlug: slug, slug: pageSlug },
  );
  if (!page) notFound();

  // FD-061 EX-4: best-effort views counter (the research contract's views
  // stat). recordLandingPageView swallows its own failures, so awaiting it
  // costs milliseconds of local SQLite while keeping the write serialized
  // against the buyer's next action (the SQLite write-lock race rule).
  await recordLandingPageView({ prisma: db, shop: shopContext }, page.id);

  return (
    <LandingPageView
      config={projectPublicStorefrontConfig(config)}
      page={page}
      initialLocale={buyerLocale}
    />
  );
}
