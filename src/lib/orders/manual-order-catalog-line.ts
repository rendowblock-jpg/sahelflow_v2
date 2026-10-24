import { ValidationError } from "@/types/errors";

/**
 * How one selection (a product, maybe one variant, a quantity) becomes an order
 * line: the name and the price come from the catalog, never from the client. Shared by
 * order.manual.create.v1 and order.manual.editLines.v1 so the two cannot drift apart.
 */

export interface CatalogVariant {
  id: string;
  name: string;
  price: number | null;
  isActive: boolean;
}

export interface CatalogProduct {
  id: string;
  name: string;
  price: number;
  productVariants: CatalogVariant[];
}

export interface CatalogLine {
  productId: string;
  productVariantId: string | null;
  productName: string;
  productVariantName: string | null;
  quantity: number;
  unitPrice: number;
}

export function resolveCatalogLine(
  product: CatalogProduct,
  selection: { productVariantId?: string | null; quantity: number },
): CatalogLine {
  const allVariants = product.productVariants;
  const activeVariants = allVariants.filter((variant) => variant.isActive);
  if (allVariants.length > 0 && activeVariants.length === 0) {
    throw new ValidationError(
      `Product '${product.name}' has variants but none are active`,
      "items.productVariantId",
    );
  }

  if (activeVariants.length > 0) {
    const variant = selection.productVariantId
      ? activeVariants.find((candidate) => candidate.id === selection.productVariantId)
      : undefined;
    if (!variant) {
      throw new ValidationError(
        `Product '${product.name}' requires one exact active variant`,
        "items.productVariantId",
      );
    }
    return {
      productId: product.id,
      productVariantId: variant.id,
      productName: product.name,
      productVariantName: variant.name,
      quantity: selection.quantity,
      unitPrice: variant.price ?? product.price,
    };
  }

  if (selection.productVariantId) {
    throw new ValidationError(
      `Product '${product.name}' has no variants`,
      "items.productVariantId",
    );
  }

  return {
    productId: product.id,
    productVariantId: null,
    productName: product.name,
    productVariantName: null,
    quantity: selection.quantity,
    unitPrice: product.price,
  };
}
