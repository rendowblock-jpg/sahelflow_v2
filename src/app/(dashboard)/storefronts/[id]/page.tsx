import { notFound } from "next/navigation";
import { getI18n } from "@/lib/i18n-server";
import { storefrontService } from "@/lib/storefront/service";
import { StorefrontBuilder } from "@/components/storefront/storefront-builder";
import { db } from "@/lib/db";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Modifier la boutique — SahelFlow" };
export const dynamic = "force-dynamic";

export default async function EditStorefrontPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { t } = await getI18n();

  const config = await storefrontService.getById(id);
  if (!config) {
    notFound();
  }

  // Fetch all active products for the picker
  const products = await db.product.findMany({
    where: { isActive: true },
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
    <div className="space-y-6 p-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {t("storefronts.editTitle")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Modifiez les réglages de votre boutique. Les changements sont visibles
          immédiatement sur la page publique.
        </p>
      </div>
      <StorefrontBuilder config={config} products={products} mode="edit" />
    </div>
  );
}
