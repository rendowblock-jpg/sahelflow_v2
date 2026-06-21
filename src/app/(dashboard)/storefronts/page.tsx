import { getI18n } from "@/lib/i18n-server";
import { storefrontService } from "@/lib/storefront/service";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StorefrontsListClient } from "@/components/storefront/storefronts-list-client";
import { Plus, Store } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Boutiques — SahelFlow" };
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
            Créez et gérez vos boutiques en ligne (COD). Chaque boutique a sa
            propre page publique avec votre sélection de produits.
          </p>
        </div>
        <Button asChild>
          <Link href="/storefronts/new">
            <Plus className="h-4 w-4 mr-2" />
            Nouvelle boutique
          </Link>
        </Button>
      </div>

      {configs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Store className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Aucune boutique</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-md">
              Créez votre première boutique en ligne. Vos clients pourront
              commander en cash à la livraison via une page publique simple.
            </p>
            <Button asChild>
              <Link href="/storefronts/new">
                <Plus className="h-4 w-4 mr-2" />
                Créer une boutique
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
