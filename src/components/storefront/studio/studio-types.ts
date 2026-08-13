import type { StorefrontTheme } from "@/lib/storefront/presentation-types";

export type StorefrontStudioDevice = "desktop" | "tablet" | "mobile";

export interface StorefrontStudioProduct {
  id: string;
  name: string;
  price: number;
  sku: string | null;
  stock: number;
  images: string | null;
}

export interface StorefrontStudioDraft {
  name: string;
  slug: string;
  description: string;
  theme: StorefrontTheme;
  selectedProductIds: readonly string[];
  isActive: boolean;
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
