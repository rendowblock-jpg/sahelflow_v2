import { getI18n } from "@/lib/i18n-server";
import { storefrontService } from "@/lib/storefront/service";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { StorefrontsListClient } from "@/components/storefront/storefronts-list-client";
import { EmptyState } from "@/components/shared/empty-state";
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
  const canMutate = canManage && canPublish;
  const { t } = await getI18n();
  const configs = await storefrontService.list({ prisma: db, shop: shopContext });

  return (
    <div className="app-content page-sections">
      <PageHeader
        title={t("nav.storefronts")}
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
        />
      )}
    </div>
  );
}
