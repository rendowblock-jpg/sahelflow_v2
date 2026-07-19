import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { getI18n } from "@/lib/i18n-server";
import { storefrontService } from "@/lib/storefront/service";
import { StorefrontBuilder } from "@/components/storefront/storefront-builder";
import { db, shopContext } from "@/lib/db";
import type { Metadata } from "next";

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
  const { id } = await params;
  const { t } = await getI18n();

  const config = await storefrontService.getById({ prisma: db, shop: shopContext }, id);
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
      <StorefrontBuilder config={config} products={products} mode="edit" />
    </div>
  );
}
