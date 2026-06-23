import { getI18n } from "@/lib/i18n-server";
import { storefrontService } from "@/lib/storefront/service";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StorefrontsListClient } from "@/components/storefront/storefronts-list-client";
import { Plus, Store } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Storefronts — SahelFlow" };
export const dynamic = "force-dynamic";

export default async function StorefrontsPage() {
  const { t } = await getI18n();
  const configs = await storefrontService.list();

  return (
    <div className="space-y-6 p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Store className="h-6 w-6" />
            {t("nav.storefronts")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("storefronts.subtitle")}
          </p>
        </div>
        <Button asChild>
          <Link href="/storefronts/new">
            <Plus className="h-4 w-4 mr-2" />
            {t("storefronts.newShop")}
          </Link>
        </Button>
      </div>

      {configs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Store className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">{t("storefronts.noShop")}</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-md">
              {t("storefronts.noShopDesc")}
            </p>
            <Button asChild>
              <Link href="/storefronts/new">
                <Plus className="h-4 w-4 mr-2" />
                {t("storefronts.createShop")}
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <StorefrontsListClient configs={configs} />
      )}
    </div>
  );
}
