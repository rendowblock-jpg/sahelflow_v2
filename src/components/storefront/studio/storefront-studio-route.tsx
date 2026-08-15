import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { StorefrontStudio } from "@/components/storefront/studio/storefront-studio";
import { db, shopContext } from "@/lib/db";
import { getI18n } from "@/lib/i18n-server";
import {
  assertTrustedAction,
  requireTrustedAction,
} from "@/lib/identity/authorization";
import { storefrontService } from "@/lib/storefront/service";

/**
 * Canonical server boundary for Storefront Studio.
 *
 * Both historical editor URLs converge here so authorization, draft loading and
 * product projection cannot drift between two independently maintained shells.
 */
export async function StorefrontStudioRoute({ id }: { id: string }) {
  const actor = await requireTrustedAction("storefront.manage");
  assertTrustedAction(actor, "storefront.publish");
  assertTrustedAction(actor, "products.read");
  const { t } = await getI18n();

  const config = await storefrontService.getStudioDraftById(
    { prisma: db, shop: shopContext },
    id,
  );
  if (!config) notFound();

  const products = await db.product.findMany({
    where: { isActive: true, deletedAt: null },
    select: {
      id: true,
      name: true,
      price: true,
      sku: true,
      stock: true,
      images: true,
    },
    orderBy: { name: "asc" },
  });

  return (
    <div className="app-workspace-content relative">
      <Link
        href="/storefronts"
        data-storefront-focus-exit="true"
        aria-label={t("storefront.builder.back")}
        title={t("storefront.builder.back")}
        className="absolute start-2 top-2 z-30 flex size-9 items-center justify-center rounded-lg border border-border/80 bg-background/92 text-muted-foreground shadow-sm backdrop-blur hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="size-4 icon-rtl-flip" aria-hidden="true" />
      </Link>
      <StorefrontStudio config={config} products={products} />
    </div>
  );
}
