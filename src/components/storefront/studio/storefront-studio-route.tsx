import { notFound } from "next/navigation";

import { StorefrontStudio } from "@/components/storefront/studio/storefront-studio";
import { db, shopContext } from "@/lib/db";
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
    <div className="app-workspace-content">
      <StorefrontStudio config={config} products={products} />
    </div>
  );
}
