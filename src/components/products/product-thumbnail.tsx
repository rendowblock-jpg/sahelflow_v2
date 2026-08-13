"use client";

import * as React from "react";
import { ImageOff, Package } from "lucide-react";

import { cn } from "@/lib/utils";

interface ProductThumbnailProps {
  src: string | null | undefined;
  alt: string;
  className?: string;
}

function LoadedThumbnail({ src, alt }: { src: string; alt: string }) {
  const [state, setState] = React.useState<"loading" | "ready" | "error">(
    "loading",
  );

  return (
    <>
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-0 bg-muted/55",
          state === "loading" ? "opacity-100" : "opacity-0",
        )}
      />
      {/* eslint-disable-next-line @next/next/no-img-element -- local product uploads are served by the bundled standalone public tree */}
      <img
        src={src}
        alt={alt}
        width={44}
        height={44}
        loading="lazy"
        decoding="async"
        onLoad={() => setState("ready")}
        onError={() => setState("error")}
        className={cn(
          "absolute inset-0 size-full object-cover transition-opacity duration-150 motion-reduce:transition-none",
          state === "ready" ? "opacity-100" : "opacity-0",
        )}
      />
      {state === "error" ? (
        <ImageOff
          className="relative size-4 text-muted-foreground/70"
          aria-hidden="true"
        />
      ) : null}
    </>
  );
}

/**
 * Compact, low-overhead product identity thumbnail.
 *
 * Product uploads are already local `/uploads/*` URLs, so the list reuses the
 * same plain-image contract as the product uploader instead of introducing an
 * optimizer, remote loader or second image authority. `key={src}` remounts the
 * tiny load-state boundary when an edit replaces the primary image.
 */
export function ProductThumbnail({
  src,
  alt,
  className,
}: ProductThumbnailProps) {
  return (
    <span
      data-product-thumbnail="primary"
      className={cn(
        "relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/80 bg-muted/35",
        className,
      )}
    >
      {src ? (
        <LoadedThumbnail key={src} src={src} alt={alt} />
      ) : (
        <Package
          className="size-4 text-muted-foreground/65"
          aria-hidden="true"
        />
      )}
    </span>
  );
}
