import { getI18n } from "@/lib/i18n-server";
import { DEFAULT_THEME } from "@/lib/storefront/service";
import { StorefrontBuilder } from "@/components/storefront/storefront-builder";
import { db } from "@/lib/db";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("metadata.title.storefrontNew") };
}
export const dynamic = "force-dynamic";

export default async function NewStorefrontPage() {
  const { t } = await getI18n();

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

  // Build an empty config shape for the builder
  const emptyConfig = {
    id: "",
    slug: "",
    name: "",
    description: null,
    theme: DEFAULT_THEME,
    productIds: [],
    contact: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  return (
    <div className="app-content page-sections">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {t("storefronts.newTitle")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("storefronts.newDesc")}
        </p>
      </div>
      <StorefrontBuilder config={emptyConfig} products={products} mode="create" />
    </div>
  );
}
