import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { storefrontService } from "@/lib/storefront/service";
import { StorefrontView } from "@/components/storefront/storefront-view";
import type { Metadata } from "next";
import { getI18n } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const config = await storefrontService.getBySlug(slug);
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
  const config = await storefrontService.getBySlug(slug);

  if (!config || !config.isActive) {
    notFound();
  }

  // Fetch the selected products
  const products = config.productIds.length > 0
    ? await db.product.findMany({
        where: { id: { in: config.productIds }, isActive: true },
        select: {
          id: true,
          name: true,
          price: true,
          sku: true,
          images: true,
          stock: true,
        },
      })
    : [];

  return <StorefrontView config={config} products={products} />;
}
