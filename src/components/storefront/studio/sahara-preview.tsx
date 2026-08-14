"use client";

import { StorefrontRenderer } from "@/components/storefront/storefront-renderer";
import type { StorefrontPreviewProps } from "./studio-types";

type Props = StorefrontPreviewProps & {
  selectedSectionId?: string | null;
  onInspectSection?: (id: string) => void;
};

/** @deprecated Kept as a compatibility boundary while Studio adopts the shared renderer name. */
export function SaharaPreview(props: Props) {
  return <StorefrontRenderer {...props} maxProducts={8} />;
}
