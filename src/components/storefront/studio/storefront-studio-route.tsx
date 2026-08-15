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
    <div className="app-workspace-content flex flex-col">
      <header
        data-storefront-focus-bar="true"
        className="flex h-11 shrink-0 items-center gap-3 border-b border-border/80 bg-background px-2.5"
      >
        <Link
          href="/storefronts"
          aria-label={t("storefront.builder.back")}
          title={t("storefront.builder.back")}
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="size-4 icon-rtl-flip" aria-hidden="true" />
        </Link>
        <div className="h-5 w-px shrink-0 bg-border" aria-hidden="true" />
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-foreground">
            {config.name}
          </p>
          <p className="truncate text-[10px] text-muted-foreground">
            {t("metadata.title.storefrontEdit")}
          </p>
        </div>
      </header>
      <div className="min-h-0 flex-1">
        <StorefrontStudio config={config} products={products} />
      </div>
    </div>
  );
}
