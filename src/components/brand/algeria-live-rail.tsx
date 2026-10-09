"use client";

import { AlgeriaLiveMap } from "@/components/brand/algeria-live-map";
import { cn } from "@/lib/utils";

/**
 * Full-rail Algeria live map for entry surfaces: orders leave Algiers for the
 * wilayas one after another. The map fills the brand column and follows the
 * app's light or dark theme.
 */
export function AlgeriaLiveRail({
  label,
  caption,
  className,
}: {
  label: string;
  caption: string;
  className?: string;
}) {
  return (
    <figure
      data-algeria-live="rail"
      aria-label={label}
      className={cn("grid h-full min-h-0 w-full grid-rows-[minmax(0,1fr)_auto]", className)}
    >
      <div className="relative min-h-0 w-full" aria-hidden="true">
        <AlgeriaLiveMap className="absolute inset-0 h-full w-full" />
      </div>
      <figcaption className="relative mt-4 max-w-[36ch] text-[13px] leading-5 text-muted-foreground">
        {caption}
      </figcaption>
    </figure>
  );
}
