import { notFound } from "next/navigation";
import { db, shopContext } from "@/lib/db";
import { storefrontService } from "@/lib/storefront/service";
import { assertTrustedAction, requireTrustedAction } from "@/lib/identity/authorization";
import { StorefrontStudio } from "@/components/storefront/studio/storefront-studio";

export const dynamic = "force-dynamic";

export default async function StorefrontStudioPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireTrustedAction("storefront.manage");
  assertTrustedAction(actor, "storefront.publish");
  assertTrustedAction(actor, "products.read");
  const { id } = await params;
  const config = await storefrontService.getById({ prisma: db, shop: shopContext }, id);
  if (!config) notFound();
  const products = await db.product.findMany({
    where: { isActive: true, deletedAt: null },
    select: { id: true, name: true, price: true, sku: true, stock: true, images: true },
    orderBy: { name: "asc" },
  });
  return <StorefrontStudio config={config} products={products} />;
}
