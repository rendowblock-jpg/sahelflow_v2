"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { StorefrontRenderer } from "@/components/storefront/storefront-renderer";
import type { StorefrontStudioProduct } from "@/components/storefront/studio/studio-types";
import type { StorefrontConfig } from "@/lib/storefront/service";
import { createStorefrontStudioDraft } from "@/lib/storefront/studio-draft";

/** The desktop width the miniature is laid out at before scaling down. */
const PREVIEW_WIDTH = 1280;

/**
 * A live, scaled-down render of a store's published page — the same renderer
 * the buyer sees, so the card shows the store as it really looks. Purely
 * visual: inert, hidden from assistive tech, never interactive.
 */
export function StorefrontMiniPreview({
  config,
  products,
}: {
  config: StorefrontConfig;
  products: readonly StorefrontStudioProduct[];
}) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0.3);
  const draft = useMemo(() => createStorefrontStudioDraft(config), [config]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setScale(entry.contentRect.width / PREVIEW_WIDTH);
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={frameRef}
      aria-hidden="true"
      inert
      data-storefront-mini-preview="true"
      className="relative aspect-[16/10] overflow-hidden bg-muted"
    >
      <div
        className="pointer-events-none absolute left-0 top-0 select-none"
        style={{ width: PREVIEW_WIDTH, transform: `scale(${scale})`, transformOrigin: "top left" }}
      >
        <StorefrontRenderer draft={draft} products={products} maxProducts={8} embeddedPreview />
      </div>
    </div>
  );
}
