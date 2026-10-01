import { getI18n } from "@/lib/i18n-server";
import { storefrontService } from "@/lib/storefront/service";
import { getAbandonedCartRecoveryStats } from "@/lib/storefront/abandoned-cart-service";
import { listReviewsForModeration } from "@/lib/storefront/review-service";
import { listQuantityTierOffers } from "@/lib/storefront/quantity-tier-service";
import { listLandingPages } from "@/lib/storefront/landing-page-service";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatCard } from "@/components/shared/stat-card";
import { collectStorefrontPerformance } from "@/lib/storefront/storefront-performance";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { StorefrontsListClient } from "@/components/storefront/storefronts-list-client";
import { StorefrontReviewsModeration } from "@/components/storefront/storefront-reviews-moderation";
import { StorefrontOffersManager } from "@/components/storefront/storefront-offers-manager";
import { StorefrontLandingPagesManager } from "@/components/storefront/storefront-landing-pages-manager";
import { StorefrontGatesManager } from "@/components/storefront/storefront-gates-manager";
import { EmptyState } from "@/components/shared/empty-state";
import { formatDZD } from "@/lib/utils";
import { Banknote, Plus, ShoppingBag, ShoppingCart, Store } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";
import { db, shopContext } from "@/lib/db";
import {
  requireTrustedAction,
  trustedActionAllowed,
} from "@/lib/identity/authorization";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("metadata.title.storefronts") };
}
export const dynamic = "force-dynamic";

const STOREFRONT_TABS = ["stores", "landing", "offers", "reviews", "protection"] as const;
type StorefrontTab = (typeof STOREFRONT_TABS)[number];

export default async function StorefrontsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const actorContext = await requireTrustedAction("storefront.read");
  const resource = { shopId: actorContext.shop.shopId };
  const canManage = trustedActionAllowed(
    actorContext,
    "storefront.manage",
    resource,
  );
  const canPublish = trustedActionAllowed(
    actorContext,
    "storefront.publish",
    resource,
  );
  const canApprove = trustedActionAllowed(
    actorContext,
    "approvals.approve",
    resource,
  );
  const canMutate = canManage && canPublish;
  const canDelete = canMutate && canApprove;
  const { t, locale } = await getI18n();
  const configs = await storefrontService.list({ prisma: db, shop: shopContext });
  const recovery = await getAbandonedCartRecoveryStats({
    prisma: db,
    shop: shopContext,
  });
  // FD-061 EX-4: the seller's review-moderation queue (pending first).
  const reviews = await listReviewsForModeration({ prisma: db, shop: shopContext });
  // FD-061 EX-4: quantity-tier offer configuration + the pickers it needs.
  const offers = await listQuantityTierOffers({ prisma: db, shop: shopContext });
  const offerProducts = await db.product.findMany({
    where: { isActive: true, deletedAt: null },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    take: 200,
  });
  // FD-061 EX-4: per-product landing pages with their live stats.
  const landingPages = await listLandingPages({ prisma: db, shop: shopContext });

  // Live miniatures on the store cards render the real store with its products.
  const previewProductIds = [...new Set(configs.flatMap((config) => config.productIds))];
  const previewProducts =
    previewProductIds.length > 0
      ? await db.product.findMany({
          where: { id: { in: previewProductIds }, isActive: true, deletedAt: null },
          select: { id: true, name: true, price: true, sku: true, stock: true, images: true },
        })
      : [];
  // Per-store sales over the last 30 days, attributed by the canonical order
  // authority (the store slug recorded at checkout).
  const performance = await collectStorefrontPerformance(
    { prisma: db, shop: shopContext },
    configs.map((config) => config.slug),
  );
  const performanceBySlug = Object.fromEntries(performance);
  const totals = [...performance.values()].reduce(
    (sum, entry) => ({
      orders: sum.orders + entry.orders,
      revenue: sum.revenue + entry.revenue,
    }),
    { orders: 0, revenue: 0 },
  );
  const trend = [...performance.values()].reduce<Array<{ date: string; value: number }>>(
    (sum, entry) =>
      entry.trend.map((point, index) => ({
        date: point.date,
        value: (sum[index]?.value ?? 0) + point.value,
      })),
    [],
  );
  const liveCount = configs.filter((config) => config.isActive).length;
  const params = await searchParams;
  const tab = STOREFRONT_TABS.includes(params.tab as StorefrontTab)
    ? (params.tab as StorefrontTab)
    : "stores";
  const storefronts = configs.map((config) => ({ slug: config.slug, name: config.name }));

  return (
    <div className="app-content page-sections" data-storefronts-hub="true">
      <PageHeader
        title={t("nav.storefrontBuilder")}
        description={t("storefronts.subtitle")}
        actions={canMutate ? (
          <Button asChild>
            <Link href="/storefronts/new">
              <Plus className="size-4" aria-hidden="true" />
              {t("storefronts.newShop")}
            </Link>
          </Button>
        ) : undefined}
      />

      {configs.length > 0 ? (
        <div className="card-grid-4" data-storefronts-kpis="true">
          <StatCard
            label={t("storefronts.kpi.liveStores")}
            value={String(liveCount)}
            icon={<Store />}
            subtitle={t("storefronts.kpi.liveOf", { live: liveCount, total: configs.length })}
          />
          <StatCard
            label={t("storefronts.kpi.orders")}
            value={String(totals.orders)}
            icon={<ShoppingBag />}
            subtitle={t("storefronts.kpi.last30")}
            spark={trend.some((point) => point.value > 0) ? trend : undefined}
            sparkZeroBaseline
          />
          <StatCard
            label={t("storefronts.kpi.revenue")}
            value={formatDZD(totals.revenue, locale)}
            icon={<Banknote />}
            subtitle={t("storefronts.kpi.last30")}
          />
          <StatCard
            label={t("storefronts.kpi.abandoned")}
            value={String(recovery.abandoned + recovery.pending)}
            icon={<ShoppingCart />}
            subtitle={t("storefronts.kpi.abandonedHint", {
              amount: formatDZD(recovery.estimatedLostRevenue, locale),
              converted: recovery.converted,
            })}
          />
        </div>
      ) : null}

      <Tabs defaultValue={tab} className="gap-5">
        <TabsList variant="line" className="w-full justify-start gap-1 overflow-x-auto border-b [&>[data-slot=tabs-trigger]]:flex-none [&>[data-slot=tabs-trigger]]:px-3">
          <TabsTrigger value="stores">
            {t("storefronts.tabs.stores")}
            <span className="ms-1 tabular-nums text-muted-foreground">{configs.length}</span>
          </TabsTrigger>
          <TabsTrigger value="landing">{t("storefronts.tabs.landing")}</TabsTrigger>
          <TabsTrigger value="offers">{t("storefronts.tabs.offers")}</TabsTrigger>
          <TabsTrigger value="reviews">{t("storefronts.tabs.reviews")}</TabsTrigger>
          <TabsTrigger value="protection">{t("storefronts.tabs.protection")}</TabsTrigger>
        </TabsList>

        <TabsContent value="stores">
          {configs.length === 0 ? (
            <Card>
              <CardContent>
                <EmptyState
                  icon={Store}
                  title={t("storefronts.empty.title")}
                  description={t("storefronts.empty.description")}
                  actionLabel={canMutate ? t("storefronts.empty.action") : undefined}
                  actionHref={canMutate ? "/storefronts/new" : undefined}
                />
              </CardContent>
            </Card>
          ) : (
            <StorefrontsListClient
              configs={configs}
              products={previewProducts}
              performance={performanceBySlug}
              canManage={canManage}
              canPublish={canPublish}
              canDelete={canDelete}
            />
          )}
        </TabsContent>

        <TabsContent value="landing">
          <StorefrontLandingPagesManager
            pages={landingPages}
            storefronts={storefronts}
            products={offerProducts}
            canManage={canManage}
          />
        </TabsContent>

        <TabsContent value="offers">
          <StorefrontOffersManager
            offers={offers}
            storefronts={storefronts}
            products={offerProducts}
            canManage={canManage}
          />
        </TabsContent>

        <TabsContent value="reviews">
          <StorefrontReviewsModeration reviews={reviews} canModerate={canManage} />
        </TabsContent>

        <TabsContent value="protection">
          <StorefrontGatesManager storefronts={storefronts} canManage={canManage} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
