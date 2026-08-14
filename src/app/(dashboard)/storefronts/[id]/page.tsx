import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { StorefrontReleaseHistory } from "@/components/storefront/studio/storefront-release-history";
import { StorefrontStudio } from "@/components/storefront/studio/storefront-studio";
import { getI18n } from "@/lib/i18n-server";
import { storefrontService } from "@/lib/storefront/service";
import { db, shopContext } from "@/lib/db";
import type { Metadata } from "next";
import {
  assertTrustedAction,
  requireTrustedAction,
} from "@/lib/identity/authorization";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("metadata.title.storefrontEdit") };
}
export const dynamic = "force-dynamic";

export default async function EditStorefrontPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actorContext = await requireTrustedAction("storefront.manage");
  assertTrustedAction(actorContext, "storefront.publish");
  assertTrustedAction(actorContext, "products.read");
  const { id } = await params;
  const { t } = await getI18n();

  const config = await storefrontService.getStudioDraftById({ prisma: db, shop: shopContext }, id);
  if (!config) {
    notFound();
  }

  // Fetch all active, non-soft-deleted products for the picker (P-M6)
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
    <div className="app-content page-sections">
      <div>
        <PageHeader title={t("storefronts.editTitle")} />
        <p className="text-sm text-muted-foreground mt-1">
          {t("storefronts.editDesc")}
        </p>
      </div>
      <StorefrontReleaseHistory storefrontId={id} />
      <StorefrontStudio config={config} products={products} />
    </div>
  );
}
