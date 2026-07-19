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

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("metadata.title.storefronts") };
}
export const dynamic = "force-dynamic";

export default async function StorefrontsPage() {
  const { t } = await getI18n();
  const configs = await storefrontService.list({ prisma: db, shop: shopContext });

  return (
    <div className="app-content page-sections">
      <PageHeader
        title={t("nav.storefronts")}
        description={t("storefronts.subtitle")}
        actions={
          <Button asChild>
            <Link href="/storefronts/new">
              <Plus className="h-4 w-4 me-2" />
              {t("storefronts.newShop")}
            </Link>
          </Button>
        }
      />

      {configs.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={Store}
              title={t("storefronts.empty.title")}
              description={t("storefronts.empty.description")}
              actionLabel={t("storefronts.empty.action")}
              actionHref="/storefronts/new"
            />
          </CardContent>
        </Card>
      ) : (
        <StorefrontsListClient configs={configs} />
      )}
    </div>
  );
}
