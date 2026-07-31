import "server-only";

import type { BusinessPrincipalContext } from "@/lib/business-truth/principal";
import { ValidationError } from "@/types/errors";

export interface NamedSourceItem {
  productName: string;
  quantity: number;
}

export interface CanonicalNamedItem {
  productId: string;
  productVariantId: string | null;
  quantity: number;
}

interface CatalogVariant {
  id: string;
  productId: string;
  name: string;
  sku: string | null;
  isActive: boolean;
}

interface CatalogProduct {
  id: string;
  name: string;
  sku: string | null;
  productVariants: CatalogVariant[];
}

function normalized(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/[\s_-]+/g, " ")
    .toLocaleLowerCase("fr-DZ");
}

function variantAliases(product: CatalogProduct, variant: CatalogVariant): string[] {
  return [
    variant.sku,
    `${product.name} ${variant.name}`,
    `${product.name} - ${variant.name}`,
    `${product.name} / ${variant.name}`,
  ]
    .map(normalized)
    .filter(Boolean);
}

function resolveOne(
  products: CatalogProduct[],
  item: NamedSourceItem,
): CanonicalNamedItem {
  if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0 || item.quantity > 999) {
    throw new ValidationError(
      `Extracted quantity for '${item.productName}' must be between 1 and 999`,
      "items.quantity",
    );
  }
  const identity = normalized(item.productName);
  if (!identity) {
    throw new ValidationError("Extracted product identity is empty", "items.productName");
  }

  const productMatches = products.filter(
    (product) =>
      normalized(product.name) === identity || normalized(product.sku) === identity,
  );
  if (productMatches.length > 1) {
    throw new ValidationError(
      `Extracted product identity '${item.productName}' is ambiguous; select an exact catalog item`,
      "items.productName",
    );
  }
  if (productMatches.length === 1) {
    const product = productMatches[0]!;
    const activeVariants = product.productVariants.filter((variant) => variant.isActive);
    if (activeVariants.length > 0) {
      throw new ValidationError(
        `Product '${product.name}' requires an exact active variant name or SKU`,
        "items.productName",
      );
    }
    return {
      productId: product.id,
      productVariantId: null,
      quantity: item.quantity,
    };
  }

  const variantMatches = products.flatMap((product) =>
    product.productVariants
      .filter((variant) => variant.isActive)
      .filter((variant) => variantAliases(product, variant).includes(identity))
      .map((variant) => ({ product, variant })),
  );
  if (variantMatches.length === 0) {
    throw new ValidationError(
      `No exact active catalog product or variant matches '${item.productName}'`,
      "items.productName",
    );
  }
  if (variantMatches.length > 1) {
    throw new ValidationError(
      `Extracted variant identity '${item.productName}' is ambiguous; select an exact SKU`,
      "items.productName",
    );
  }
  const match = variantMatches[0]!;
  return {
    productId: match.product.id,
    productVariantId: match.variant.id,
    quantity: item.quantity,
  };
}

export async function resolveCanonicalNamedItems(
  context: Pick<BusinessPrincipalContext, "prisma">,
  items: readonly NamedSourceItem[],
): Promise<CanonicalNamedItem[]> {
  if (items.length === 0) {
    throw new ValidationError("At least one extracted item is required", "items");
  }
  const products = await context.prisma.product.findMany({
    where: { isActive: true, deletedAt: null },
    include: {
      productVariants: {
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      },
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });

  const grouped = new Map<string, CanonicalNamedItem>();
  for (const item of items) {
    const resolved = resolveOne(products, item);
    const key = `${resolved.productId}:${resolved.productVariantId ?? "base"}`;
    const prior = grouped.get(key);
    grouped.set(key, {
      ...resolved,
      quantity: (prior?.quantity ?? 0) + resolved.quantity,
    });
  }
  return [...grouped.values()];
}
