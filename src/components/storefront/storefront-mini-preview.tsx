"use client";

import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { SkeletonBar } from "@/components/shared/state-skeletons";
import { useI18n } from "@/hooks/use-i18n";

import { StorefrontRenderer } from "@/components/storefront/storefront-renderer";
import type { StorefrontStudioProduct } from "@/components/storefront/studio/studio-types";
import type { StorefrontConfig } from "@/lib/storefront/service";
import { createStorefrontStudioDraft } from "@/lib/storefront/studio-draft";

/** The preview could not be drawn: a designed slot instead of a broken card. */
function PreviewUnavailable() {
  const { t } = useI18n();
  return (
    <div
      data-testid="mini-preview-unavailable"
      className="absolute inset-0 flex items-center justify-center border border-dashed border-border p-2 text-center text-xs text-muted-foreground"
    >
      {t("storefront.studioStates.manager.previewUnavailable")}
    </div>
  );
}

class PreviewBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <PreviewUnavailable /> : this.props.children;
  }
}

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
  const [measured, setMeasured] = useState(false);
  const draft = useMemo(() => createStorefrontStudioDraft(config), [config]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        setScale(entry.contentRect.width / PREVIEW_WIDTH);
        setMeasured(true);
      }
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
      {measured ? (
        <PreviewBoundary>
          <div
            className="pointer-events-none absolute left-0 top-0 select-none"
            style={{ width: PREVIEW_WIDTH, transform: `scale(${scale})`, transformOrigin: "top left" }}
          >
            <StorefrontRenderer draft={draft} products={products} maxProducts={8} embeddedPreview />
          </div>
        </PreviewBoundary>
      ) : (
        <SkeletonBar data-testid="mini-preview-loading" className="absolute inset-0 rounded-none" />
      )}
    </div>
  );
}
