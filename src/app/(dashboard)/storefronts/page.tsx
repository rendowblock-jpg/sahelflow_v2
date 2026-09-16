import { getI18n } from "@/lib/i18n-server";
import { storefrontService } from "@/lib/storefront/service";
import { getAbandonedCartRecoveryStats } from "@/lib/storefront/abandoned-cart-service";
import { listReviewsForModeration } from "@/lib/storefront/review-service";
import { listQuantityTierOffers } from "@/lib/storefront/quantity-tier-service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { StorefrontsListClient } from "@/components/storefront/storefronts-list-client";
import { StorefrontReviewsModeration } from "@/components/storefront/storefront-reviews-moderation";
import { StorefrontOffersManager } from "@/components/storefront/storefront-offers-manager";
import { EmptyState } from "@/components/shared/empty-state";
import { formatDZD } from "@/lib/utils";
import { Plus, Store } from "lucide-react";
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

export default async function StorefrontsPage() {
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

  return (
    <div className="app-content page-sections">
      <PageHeader
        title={t("nav.storefrontBuilder")}
        description={t("storefronts.subtitle")}
        actions={canMutate ? (
          <Button asChild>
            <Link href="/storefronts/new">
              <Plus className="h-4 w-4 me-2" />
              {t("storefronts.newShop")}
            </Link>
          </Button>
        ) : undefined}
      />

      {configs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t("storefronts.recovery.title")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {(
                [
                  ["storefronts.recovery.pending", recovery.pending],
                  ["storefronts.recovery.abandoned", recovery.abandoned],
                  ["storefronts.recovery.converted", recovery.converted],
                  [
                    "storefronts.recovery.lostRevenue",
                    formatDZD(recovery.estimatedLostRevenue, locale),
                  ],
                ] as const
              ).map(([key, value]) => (
                <div key={key}>
                  <p className="text-sm text-muted-foreground">{t(key)}</p>
                  <p className="text-lg font-semibold tabular-nums">{value}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <StorefrontReviewsModeration reviews={reviews} canModerate={canManage} />

      <StorefrontOffersManager
        offers={offers}
        storefronts={configs.map((config) => ({ slug: config.slug, name: config.name }))}
        products={offerProducts}
        canManage={canManage}
      />

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
          canManage={canManage}
          canPublish={canPublish}
          canDelete={canDelete}
        />
      )}
    </div>
  );
}
