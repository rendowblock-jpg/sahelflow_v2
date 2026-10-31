"use client";

import { Package } from "lucide-react";
import { useState } from "react";

import { useI18n } from "@/hooks/use-i18n";

/**
 * A product photo, or a designed empty slot when there is none or it cannot be
 * loaded (a path on this computer is not reachable from every screen).
 */
export function ProductThumb({ image }: { image: string | null }) {
  const { t } = useI18n();
  const [failedImage, setFailedImage] = useState<string | null>(null);
  return (
    <span className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-control border bg-muted text-muted-foreground">
      {image !== null && failedImage !== image ? (
        // eslint-disable-next-line @next/next/no-img-element -- seller product media
        <img
          src={image}
          alt=""
          onError={() => setFailedImage(image)}
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <span
          role="img"
          data-testid="product-thumb-empty"
          aria-label={t("storefront.studioStates.photos.none")}
          className="flex size-full items-center justify-center border border-dashed border-border"
        >
          <Package className="size-4" aria-hidden="true" />
        </span>
      )}
    </span>
  );
}
