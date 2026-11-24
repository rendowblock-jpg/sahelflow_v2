import type { StorefrontStudioDraft } from "@/lib/storefront/studio-draft";
export type { StorefrontStudioDraft } from "@/lib/storefront/studio-draft";

export type StorefrontStudioDevice = "desktop" | "tablet" | "mobile";

export interface StorefrontStudioProductVariant {
  id: string;
  name: string;
  price: number | null;
  stock: number;
  isActive?: boolean;
}

export interface StorefrontStudioProduct {
  id: string;
  name: string;
  price: number;
  sku: string | null;
  stock: number;
  images: string | null;
  productVariants?: readonly StorefrontStudioProductVariant[];
}

export interface StorefrontPreviewProps {
  draft: StorefrontStudioDraft;
  products: readonly StorefrontStudioProduct[];
}

export function studioImageUrl(images: string | null): string | null {
  if (!images) return null;
  try {
    const parsed = JSON.parse(images) as unknown;
    if (Array.isArray(parsed) && typeof parsed[0] === "string") return parsed[0];
  } catch {
    // Legacy comma-separated values remain previewable.
  }
  return images.split(",")[0]?.trim() || null;
}
