"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Lock } from "lucide-react";

import { useI18n } from "@/hooks/use-i18n";
import { cn } from "@/lib/utils";

import { SaharaPreview } from "./sahara-preview";
import type {
  StorefrontStudioDevice,
  StorefrontStudioDraft,
  StorefrontStudioProduct,
} from "./studio-types";

/** Real viewport widths the store is laid out at before scaling to fit. */
const DEVICE_WIDTH: Record<StorefrontStudioDevice, number> = {
  desktop: 1280,
  tablet: 768,
  mobile: 390,
};
const GUTTER = 48;

/**
 * The live page, at the device's true width and scaled to fit, so a desktop
 * layout is judged as a desktop layout (not a squeezed one). Clicking any
 * section selects it; links and forms inside the page are inert here.
 */
export function StudioCanvas({
  draft,
  products,
  device,
  selectedSectionId = null,
  revealSectionId = null,
  onInspectSection,
}: {
  draft: StorefrontStudioDraft;
  products: readonly StorefrontStudioProduct[];
  device: StorefrontStudioDevice;
  selectedSectionId?: string | null;
  /** Changes when the selection came from outside the canvas (scroll to it). */
  revealSectionId?: { id: string; nonce: number } | null;
  /** Omit for a read-only preview (sections are not selectable). */
  onInspectSection?: (id: string) => void;
}) {
  const { t, dir } = useI18n();
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const pageRef = useRef<HTMLDivElement | null>(null);
  const width = DEVICE_WIDTH[device];
  const [available, setAvailable] = useState(width);
  const [height, setHeight] = useState(0);
  const scale = Math.min(1, Math.max(0.2, available / width));
  const mobile = device === "mobile";

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const page = pageRef.current;
    if (!viewport || !page) return;
    const measure = () => {
      setAvailable(Math.max(0, viewport.clientWidth - GUTTER));
      setHeight(page.offsetHeight);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(page);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!revealSectionId) return;
    const target = viewportRef.current?.querySelector<HTMLElement>(
      `[data-studio-section="${CSS.escape(revealSectionId.id)}"]`,
    );
    target?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [revealSectionId]);

  return (
    <div
      ref={viewportRef}
      data-studio-canvas={device}
      className="absolute inset-0 overflow-y-auto overflow-x-hidden bg-muted/50 bg-[radial-gradient(var(--border)_1px,transparent_1px)] [background-size:16px_16px]"
      style={{ ["--sf-studio-outline" as string]: "var(--ring)" }}
      onClickCapture={(event) => {
        // The page is a preview: links never navigate the Studio away.
        if ((event.target as HTMLElement).closest("a[href]")) event.preventDefault();
      }}
      onSubmitCapture={(event) => event.preventDefault()}
    >
      <div className="py-6" style={{ paddingInline: GUTTER / 2 }}>
        <div
          className="mx-auto transition-[width] duration-200 ease-out"
          style={{ width: Math.round(width * scale) }}
        >
          <div
            className={cn(
              "overflow-hidden bg-background shadow-(--elevation-3) ring-1 ring-border",
              mobile ? "rounded-[28px] ring-[6px] ring-foreground/85" : "rounded-surface",
            )}
          >
            {mobile ? (
              <div className="flex h-6 items-center justify-center bg-background" aria-hidden="true">
                <span className="h-1.5 w-16 rounded-full bg-foreground/15" />
              </div>
            ) : (
              <div
                className="flex h-9 items-center gap-3 border-b bg-muted/60 px-3"
                aria-hidden="true"
              >
                <span className="flex gap-1.5">
                  <span className="size-2.5 rounded-full bg-foreground/15" />
                  <span className="size-2.5 rounded-full bg-foreground/15" />
                  <span className="size-2.5 rounded-full bg-foreground/15" />
                </span>
                <span
                  dir="ltr"
                  className="mx-auto flex h-6 min-w-0 max-w-sm flex-1 items-center justify-center gap-1.5 truncate rounded-full bg-background px-3 text-caption text-muted-foreground"
                >
                  <Lock className="size-3 shrink-0" />
                  <span className="truncate">sahelflow.app/storefront/{draft.slug}</span>
                </span>
                <span className="w-12" />
              </div>
            )}
            <div
              className="relative overflow-hidden"
              style={{ height: height ? Math.ceil(height * scale) : undefined }}
            >
              <div
                ref={pageRef}
                data-studio-page="true"
                aria-label={t("storefront.studio.preview")}
                className="absolute top-0 start-0"
                style={{
                  width,
                  transform: scale === 1 ? undefined : `scale(${scale})`,
                  transformOrigin: dir === "rtl" ? "top right" : "top left",
                }}
              >
                <SaharaPreview
                  draft={draft}
                  products={products}
                  selectedSectionId={selectedSectionId}
                  onInspectSection={onInspectSection}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
