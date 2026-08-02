import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { StorefrontView } from "@/components/storefront/storefront-view";
import { db, shopContext } from "@/lib/db";
import { getI18n } from "@/lib/i18n-server";
import { storefrontService } from "@/lib/storefront/service";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const config = await storefrontService.getBySlug(
    { prisma: db, shop: shopContext },
    slug,
  );
  const { t } = await getI18n();
  if (!config) return { title: t("metadata.title.storefrontNotFound") };
  return { title: `${config.name} — SahelFlow` };
}

export default async function StorefrontPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const config = await storefrontService.getBySlug(
    { prisma: db, shop: shopContext },
    slug,
  );
  if (!config?.isActive) notFound();

  const products =
    config.productIds.length > 0
      ? await db.product.findMany({
          where: {
            id: { in: config.productIds },
            isActive: true,
            deletedAt: null,
          },
          select: {
            id: true,
            name: true,
            price: true,
            sku: true,
            images: true,
            stock: true,
            productVariants: {
              where: { isActive: true },
              orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
              select: {
                id: true,
                name: true,
                price: true,
                stock: true,
                isActive: true,
              },
            },
          },
        })
      : [];

  return <StorefrontView config={config} products={products} />;
}
