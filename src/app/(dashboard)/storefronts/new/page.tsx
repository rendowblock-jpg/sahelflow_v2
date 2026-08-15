import type { Metadata } from "next";

import { StorefrontStudioBootstrap } from "@/components/storefront/studio/storefront-studio-bootstrap";
import { db } from "@/lib/db";
import { getI18n } from "@/lib/i18n-server";
import {
  assertTrustedAction,
  requireTrustedAction,
} from "@/lib/identity/authorization";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("metadata.title.storefrontNew") };
}
export const dynamic = "force-dynamic";

/**
 * First-run Storefront V2 entry. The old settings-form builder is intentionally
 * not used here: sellers start from the shared live renderer and continue into
 * the same Studio that owns section composition, inspector, autosave and publish.
 */
export default async function NewStorefrontPage() {
  const actorContext = await requireTrustedAction("storefront.manage");
  assertTrustedAction(actorContext, "storefront.publish");
  assertTrustedAction(actorContext, "products.read");

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
    <div className="app-workspace-content">
      <StorefrontStudioBootstrap products={products} />
    </div>
  );
}
